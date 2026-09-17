/**
 * Pixel primitives for the forensic engine.
 *
 * Everything downstream works on single-channel luminance buffers ("Gray").
 * Tamper detection cares about structure — edges, variance, exposure — not hue,
 * and one channel keeps the live analysis cheap enough to run while the player
 * is still editing.
 */

/** Single-channel luminance buffer, values 0..255. */
export interface Gray {
  w: number;
  h: number;
  data: Float32Array;
}

type Canvas2D = {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
};

/** Prefer OffscreenCanvas so analysis never touches the document. */
function makeCanvas(w: number, h: number): Canvas2D {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2D context unavailable on OffscreenCanvas");
    return { canvas, ctx };
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D context unavailable");
  return { canvas, ctx };
}

/** Decode a URL or data URL into something drawable. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Local assets and data URLs only, so this never taints the canvas.
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error(`Evidence image failed to decode: ${src.slice(0, 64)}`));
    img.src = src;
  });
}

export interface DrawSource {
  source: HTMLImageElement;
  /** Region of the source to take. Defaults to the whole image. */
  srcRect?: { x: number; y: number; w: number; h: number };
  /** Where to put it in the destination. Defaults to filling the destination. */
  dstRect?: { x: number; y: number; w: number; h: number };
}

/**
 * Rasterise one or more draws into a luminance buffer of exactly w x h.
 * `background` fills first — used to mark pixels a crop removed.
 */
export function rasterizeGray(
  w: number,
  h: number,
  draws: DrawSource[],
  background = "#000000"
): Gray {
  const { ctx } = makeCanvas(w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);
  for (const d of draws) {
    const s = d.srcRect ?? {
      x: 0,
      y: 0,
      w: d.source.naturalWidth,
      h: d.source.naturalHeight,
    };
    const t = d.dstRect ?? { x: 0, y: 0, w, h };
    ctx.drawImage(d.source, s.x, s.y, s.w, s.h, t.x, t.y, t.w, t.h);
  }
  const { data } = ctx.getImageData(0, 0, w, h);
  const out = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    // Rec. 601 luma — cheap and matches how a CCTV encoder would see it.
    out[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  return { w, h, data: out };
}

/** Working-resolution luminance of a whole image, aspect preserved. */
export function grayFromImage(img: HTMLImageElement, targetW: number): Gray {
  const w = Math.max(16, Math.round(targetW));
  const h = Math.max(
    16,
    Math.round((img.naturalHeight / img.naturalWidth) * w)
  );
  return rasterizeGray(w, h, [{ source: img }]);
}

/* ------------------------------------------------------------------ *
 * Sampling
 * ------------------------------------------------------------------ */

export function at(g: Gray, x: number, y: number): number {
  const cx = x < 0 ? 0 : x >= g.w ? g.w - 1 : x;
  const cy = y < 0 ? 0 : y >= g.h ? g.h - 1 : y;
  return g.data[cy * g.w + cx];
}

/** Bilinear sample in continuous coordinates. */
export function bilinear(g: Gray, fx: number, fy: number): number {
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const a = at(g, x0, y0);
  const b = at(g, x0 + 1, y0);
  const c = at(g, x0, y0 + 1);
  const d = at(g, x0 + 1, y0 + 1);
  return (
    a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty
  );
}

/**
 * Resample an arbitrary rectangle of a Gray into a fixed square patch, so two
 * regions of different pixel sizes can be compared directly.
 */
export function samplePatch(
  g: Gray,
  rect: { x: number; y: number; w: number; h: number },
  size: number
): Gray {
  const out = new Float32Array(size * size);
  const sx = rect.w / size;
  const sy = rect.h / size;
  for (let j = 0; j < size; j++) {
    const fy = rect.y + (j + 0.5) * sy;
    for (let i = 0; i < size; i++) {
      out[j * size + i] = bilinear(g, rect.x + (i + 0.5) * sx, fy);
    }
  }
  return { w: size, h: size, data: out };
}

/* ------------------------------------------------------------------ *
 * Statistics
 * ------------------------------------------------------------------ */

export interface Stats {
  mean: number;
  variance: number;
  std: number;
}

export function stats(g: Gray, mask?: Uint8Array): Stats {
  let n = 0;
  let sum = 0;
  for (let i = 0; i < g.data.length; i++) {
    if (mask && mask[i]) continue;
    sum += g.data[i];
    n++;
  }
  if (!n) return { mean: 0, variance: 0, std: 0 };
  const mean = sum / n;
  let acc = 0;
  for (let i = 0; i < g.data.length; i++) {
    if (mask && mask[i]) continue;
    const d = g.data[i] - mean;
    acc += d * d;
  }
  const variance = acc / n;
  return { mean, variance, std: Math.sqrt(variance) };
}

/**
 * Mean residual below this many luma levels is encoder noise, not structure.
 * Used to decide whether an octave of the ORIGINAL carried anything worth
 * comparing against, never to scale a score.
 */
const DETAIL_NOISE_FLOOR = 1.2;

/**
 * How much each octave of structure counts toward being identifiable.
 *
 * Index 0 is the finest scale present in the patch, each step after it is
 * half the resolution. Coarse scales are weighted slightly higher than fine
 * ones because they are what survives a moderate defocus, and they are also
 * what a canvass actually runs on — hair, build, the shape of a head. Fine
 * scales still matter, they are simply not the whole story, and weighting them
 * alone made every blur setting above the lightest score identically zero.
 */
const OCTAVE_WEIGHTS = [0.16, 0.2, 0.28, 0.36];

/** Signed 3x3 band-pass residual — the structure present at one scale. */
function residualField(g: Gray): Float32Array {
  const { w, h, data } = g;
  const out = new Float32Array(w * h);
  if (w < 3 || h < 3) return out;

  // Separable box mean. Edges clamp rather than shrink the window, so every
  // pixel stays in the statistic.
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -1; k <= 1; k++) {
        const xx = x + k < 0 ? 0 : x + k >= w ? w - 1 : x + k;
        sum += data[y * w + xx];
      }
      tmp[y * w + x] = sum / 3;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -1; k <= 1; k++) {
        const yy = y + k < 0 ? 0 : y + k >= h ? h - 1 : y + k;
        sum += tmp[yy * w + x];
      }
      out[y * w + x] = data[y * w + x] - sum / 3;
    }
  }
  return out;
}

function meanAbsOf(a: Float32Array): number {
  if (!a.length) return 0;
  let acc = 0;
  for (let i = 0; i < a.length; i++) acc += Math.abs(a[i]);
  return acc / a.length;
}

/** Zero-mean normalised correlation between two equally sized fields. */
function correlate(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    num += da * db;
    va += da * da;
    vb += db * db;
  }
  const den = Math.sqrt(va * vb);
  return den < 1e-9 ? 0 : num / den;
}

/**
 * Grid concentration — how much of the region's variation sits on a handful of
 * rows and columns.
 *
 * This is the pixelation detector, and it is separate from the octave sum
 * because no amount of tuning could make that sum see a mosaic. Coverage-style
 * measures fail on it: the block boundaries carry so much residual that a
 * mosaic reads as ordinary texture at every scale and every patch resolution.
 *
 * What is unmistakable about a mosaic is not its energy but its GEOMETRY —
 * every edge lands on a regular axis-aligned grid, so almost all of the
 * horizontal gradient lives in one column of every block, and likewise for
 * rows. Measured across all five cases, real photographic regions put 29–57%
 * of their gradient energy in the busiest quarter of lines, blurred ones the
 * same or less, and every pixelated one put essentially 100% there. The
 * thresholds below sit in that gap with room on both sides.
 *
 * Taking the MIN of the two axes is what stops a scene's own structure — a
 * railing, a window blind, venetian shadow — from reading as a mosaic: those
 * concentrate on one axis, a block grid concentrates on both.
 */
const GRID_CONCENTRATION_FLOOR = 0.62;
const GRID_CONCENTRATION_FULL = 0.85;
/** Share of lines counted as "the busy ones". */
const GRID_TOP_FRACTION = 0.25;

function quantisation(g: Gray): number {
  const { w, h, data } = g;
  if (w < 8 || h < 8) return 0;
  const col = new Float64Array(w - 1);
  const row = new Float64Array(h - 1);
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      col[x] += Math.abs(data[y * w + x + 1] - data[y * w + x]);
      row[y] += Math.abs(data[(y + 1) * w + x] - data[y * w + x]);
    }
  }
  const share = (line: Float64Array): number => {
    const sorted = Array.from(line).sort((a, b) => b - a);
    let total = 0;
    for (const v of sorted) total += v;
    // A region with no variation at all is a flat fill, not a mosaic — the
    // block detectors own that case, so report no quantisation here.
    if (total <= 1e-6) return 0;
    const k = Math.max(1, Math.round(sorted.length * GRID_TOP_FRACTION));
    let top = 0;
    for (let i = 0; i < k; i++) top += sorted[i];
    return top / total;
  };
  const concentration = Math.min(share(col), share(row));
  return clamp01(
    (concentration - GRID_CONCENTRATION_FLOOR) /
      (GRID_CONCENTRATION_FULL - GRID_CONCENTRATION_FLOOR)
  );
}

/** 2x2 box downsample — one step down the pyramid. */
function halve(g: Gray): Gray {
  const w = g.w >> 1;
  const h = g.h >> 1;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = 2 * y * g.w + 2 * x;
      out[y * w + x] =
        (g.data[i] + g.data[i + 1] + g.data[i + g.w] + g.data[i + g.w + 1]) / 4;
    }
  }
  return { w, h, data: out };
}

/**
 * Surviving identifying detail — how much of the ORIGINAL fine structure a
 * recogniser could still work from, as a 0..1 fraction.
 *
 * The question is deliberately COMPARATIVE, and that is the whole model. Every
 * cheaper formulation asks "how much structure is in this region now", and
 * three different edits defeat that question in three different ways:
 *
 *   - a heavy blur leaves a broad luminance ramp, and a ramp has large
 *     gradients — so scoring on gradient made blurring *harder* raise the score
 *   - a mosaic is nothing but edges, and rated a fully pixelated exhibit ~91%
 *     legible
 *   - a sticker, a coloured brush stroke or any pasted object puts MORE
 *     structure in the region than the camera recorded, so hiding a face under
 *     something detailed scored it as perfectly legible
 *
 * All three are the same mistake: presence of structure is not survival of
 * identity. So each octave is scored by AGREEMENT with the original — the
 * correlation of the two band-pass residuals — and by how much of the
 * original's energy is left, capped, because you cannot have more of a
 * photograph than was in it.
 *
 * Three pieces, each earning its place:
 *
 *   - RESIDUAL against a local mean. A ramp survives it with nothing left
 *     over, which is what makes the score monotone in blur radius.
 *   - OCTAVES give it a working range. A blur removes structure below its
 *     radius and leaves everything above it, so summing across scales makes the
 *     score fall off smoothly instead of hitting zero the moment the finest
 *     scale dies. Octaves the original had nothing in do not vote.
 *   - QUANTISATION, separately, for the one edit that correlates well and
 *     identifies nothing: a mosaic is a downsample, so its coarse octaves
 *     genuinely match. Geometry is what gives it away.
 *
 * Sample both patches at the SOURCE image's resolution, not from a downsampled
 * working frame — resampling twice anti-aliases a mosaic into something that
 * genuinely reads as texture, and throws away exactly the evidence being
 * scored.
 */
export function survivingDetail(edit: Gray, base: Gray): number {
  let e = edit;
  let b = base;
  let num = 0;
  let den = 0;

  for (let k = 0; k < OCTAVE_WEIGHTS.length; k++) {
    const resEdit = residualField(e);
    const resBase = residualField(b);
    const baseEnergy = meanAbsOf(resBase);

    // Octaves where the original had nothing do not get a vote. Without this a
    // region that was always smooth would be judged on noise, and its score
    // would wander. Ramped rather than switched so nothing snaps at the edge.
    const signal = clamp01(baseEnergy / DETAIL_NOISE_FLOOR);
    if (signal > 0) {
      // AGREEMENT, not amount. This is the whole point of the function: a
      // sticker, a coloured brush stroke, a pasted object all put *more*
      // structure into a region than the camera recorded, so any measure of
      // "how much detail is here" reads them as a perfectly legible face.
      // Correlation against the original asks the only question that matters —
      // is what is here still what was here.
      const agreement = clamp01(correlate(resEdit, resBase));
      // And you cannot have more of the original surviving than there was, so
      // added energy is capped rather than rewarded.
      const kept = clamp01(meanAbsOf(resEdit) / Math.max(baseEnergy, 1e-6));
      num += OCTAVE_WEIGHTS[k] * signal * agreement * kept;
      den += OCTAVE_WEIGHTS[k] * signal;
    }

    if (e.w < 8 || e.h < 8 || b.w < 8 || b.h < 8) break;
    e = halve(e);
    b = halve(b);
  }

  // No octave carried usable signal — the region is featureless in the
  // original, so there is no fine structure to have survived or lost. Fall back
  // to whether it still looks like the same thing at all, rather than reporting
  // a confident zero or a confident one about nothing.
  if (den <= 1e-6) return clamp01(1 - meanAbsDiff(edit, base) / 96);

  // A mosaic is the one edit that correlates well and identifies nothing: it is
  // a downsample, so its coarse octaves genuinely match the original. Geometry
  // is what gives it away. See `quantisation`.
  return clamp01(num / den) * (1 - quantisation(edit));
}

/** Mean absolute difference between two equally sized buffers. */
export function meanAbsDiff(a: Gray, b: Gray): number {
  const n = Math.min(a.data.length, b.data.length);
  let acc = 0;
  for (let i = 0; i < n; i++) acc += Math.abs(a.data[i] - b.data[i]);
  return n ? acc / n : 0;
}

/**
 * Zero-mean normalised correlation, in [-1, 1].
 *
 * Used for alignment because it ignores overall brightness and contrast — a
 * player who crops *and* regrades should still have their crop recovered.
 */
export function normalizedCorrelation(a: Gray, b: Gray): number {
  const n = Math.min(a.data.length, b.data.length);
  if (!n) return 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a.data[i];
    mb += b.data[i];
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a.data[i] - ma;
    const db = b.data[i] - mb;
    num += da * db;
    va += da * da;
    vb += db * db;
  }
  const den = Math.sqrt(va * vb);
  // A flat patch correlates with nothing; treat it as no evidence either way.
  return den < 1e-6 ? 0 : num / den;
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;
