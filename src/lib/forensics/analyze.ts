/**
 * The forensic analyser.
 *
 * Compares a submitted PNG against the original surveillance still and reports
 * what a hostile examiner would find. There is no ML and no network — it is
 * deterministic image analysis over canvas pixels.
 *
 * The library gives us no edit events, so this is the only thing standing
 * between "the player did something" and "the game reacts to it". Everything
 * the game knows, it knows from here.
 *
 * Construction is expensive (it pre-computes every derived view of the
 * original); `analyze()` is cheap enough to run on a poll while editing.
 */

import type {
  ForensicResult,
  Mission,
  TamperSignals,
  TargetFinding,
} from "@/types";
import {
  type Gray,
  type Stats,
  clamp01,
  survivingDetail,
  grayFromImage,
  loadImage,
  meanAbsDiff,
  rasterizeGray,
  stats,
} from "./image";
import { estimateTransform, mapRegionIntoSubmission } from "./align";
import {
  SCORING,
  classifyTreatment,
  decideOutcome,
  identificationFrom,
  integrityFrom,
  suspicionFrom,
  wantedDeltaFor,
} from "./score";

interface OriginalProfile {
  gray: Gray;
  stats: Stats;
  /** Per-target resampled patch plus its detail/variance baseline. */
  targets: {
    id: string;
    patch: Gray;
    variance: number;
  }[];
  /** Strong axis-aligned edge presence, per pixel of the working frame. */
  edgeV: Float32Array;
  edgeH: Float32Array;
  /** Variance per block, row-major over the block grid. */
  blockVariance: Float32Array;
  blocksX: number;
  blocksY: number;
}

export class ForensicAnalyzer {
  private readonly mission: Mission;
  private readonly original: HTMLImageElement;
  private readonly profile: OriginalProfile;

  private constructor(
    mission: Mission,
    original: HTMLImageElement,
    profile: OriginalProfile
  ) {
    this.mission = mission;
    this.original = original;
    this.profile = profile;
  }

  /**
   * There is deliberately no "live" mode any more.
   *
   * The rail and the verdict used to run at different working resolutions (320
   * vs 512) to keep the editing poll cheap, and they disagreed by 3–8 points of
   * identification — enough to straddle a threshold, so the terminal could
   * project INSUFFICIENT on an exhibit the verdict then ACCEPTED. A readout the
   * player plans against has to be the number they are graded on, so both run
   * one analysis at one resolution. Cost is managed by the poll interval and
   * the unchanged-data-URL skip in useLiveForensics, never by scoring the live
   * exhibit differently from the filed one.
   */
  static async create(mission: Mission): Promise<ForensicAnalyzer> {
    const original = await loadImage(mission.image);
    const gray = grayFromImage(original, SCORING.workWidth);
    const profile = buildProfile(mission, original, gray, SCORING.patchSize);
    return new ForensicAnalyzer(mission, original, profile);
  }

  /** The original, at working resolution — used by the analysis screen. */
  get originalImage(): HTMLImageElement {
    return this.original;
  }

  async analyze(submittedDataUrl: string): Promise<ForensicResult> {
    const startedAt = performance.now();
    const edited = await loadImage(submittedDataUrl);
    const editSize = {
      width: edited.naturalWidth,
      height: edited.naturalHeight,
    };
    const origSize = this.mission.imageSize;

    // 1. Work out which part of the original this submission represents.
    const editGray = grayFromImage(edited, SCORING.workWidth);
    const transform = estimateTransform(
      this.profile.gray,
      editGray,
      origSize,
      editSize
    );

    // 2. Re-render the submission back into the original's frame, so every
    //    comparison below happens in one coordinate system. Pixels the crop
    //    removed are marked in `missing` and excluded from the statistics
    //    rather than being compared against black.
    const { gray: aligned, missing } = alignIntoOriginalFrame(
      edited,
      transform,
      origSize,
      this.profile.gray
    );

    // 3. Per-target legibility.
    //
    // Regions are read from the SUBMITTED image at its own resolution, not
    // from the downsampled working frame the whole-frame signals use. What is
    // being asked here is what a recogniser could still pull out of these
    // pixels, and downsampling to 512 first throws away the evidence — it also
    // anti-aliases a mosaic into something that reads as ordinary texture.
    const findings: TargetFinding[] = this.mission.targets.map((target) => {
      const baseline = this.profile.targets.find((t) => t.id === target.id);
      const regionInEdit = mapRegionIntoSubmission(
        target.region,
        transform,
        editSize
      );

      if (!baseline || !regionInEdit) {
        return {
          targetId: target.id,
          label: target.label,
          short: target.short,
          kind: target.kind,
          weight: target.weight,
          legibility: 0,
          detailRatio: 0,
          similarity: 0,
          uniformity: 1,
          croppedOut: true,
          treatment: "cropped",
        };
      }

      const patch = rasterizeGray(SCORING.patchSize, SCORING.patchSize, [
        { source: edited, srcRect: regionInEdit },
      ]);
      const patchStats = stats(patch);
      // Compared against the original region, never measured on its own.
      //
      // `survivingDetail` returns the fraction of the ORIGINAL's structure
      // still readable here, which is the only form of the question that
      // survives contact with the tools: a sticker or a coloured brush stroke
      // puts more structure into a region than the camera did, and any
      // "how much detail is present" measure scores that as a legible face.
      // It also removes the need to normalise against a per-target baseline
      // scalar, which used to leave low-texture targets — a tattoo on skin —
      // unable to lose a large fraction of detail they never had.
      const detailRatio = survivingDetail(patch, baseline.patch);
      const similarity = clamp01(1 - meanAbsDiff(patch, baseline.patch) / 96);
      const uniformity =
        baseline.variance <= 1
          ? 0
          : clamp01(1 - patchStats.variance / baseline.variance);
      const varianceRatio =
        baseline.variance <= 1 ? 1 : patchStats.variance / baseline.variance;

      const legibility =
        100 *
        clamp01(
          detailRatio * SCORING.legibility.detail +
            similarity * SCORING.legibility.similarity
        );

      return {
        targetId: target.id,
        label: target.label,
        short: target.short,
        kind: target.kind,
        weight: target.weight,
        legibility,
        detailRatio,
        similarity,
        uniformity,
        croppedOut: false,
        treatment: classifyTreatment({
          croppedOut: false,
          detailRatio,
          uniformity,
          varianceRatio,
          patchVariance: patchStats.variance,
        }),
      };
    });

    // 4. Whole-frame tamper signals.
    const signals = computeSignals(
      this.profile,
      aligned,
      missing,
      transform.frameLoss
    );

    const identification = identificationFrom(findings);
    const integrity = integrityFrom(signals);
    const suspicion = suspicionFrom(integrity, signals);
    const outcome = decideOutcome(identification, integrity);

    return {
      identification,
      integrity,
      suspicion,
      findings,
      signals,
      transform,
      outcome,
      wantedDelta: wantedDeltaFor(outcome, identification),
      elapsedMs: performance.now() - startedAt,
    };
  }
}

/* ------------------------------------------------------------------ *
 * Original profiling
 * ------------------------------------------------------------------ */

function buildProfile(
  mission: Mission,
  original: HTMLImageElement,
  gray: Gray,
  patchSize: number
): OriginalProfile {
  // Sampled from the source image at its own resolution, exactly as the
  // submission's regions are — the two are compared directly, so they have to
  // be produced the same way.
  const targets = mission.targets.map((t) => {
    const patch = rasterizeGray(patchSize, patchSize, [
      { source: original, srcRect: t.region },
    ]);
    return {
      id: t.id,
      patch,
      variance: stats(patch).variance,
    };
  });

  const { edgeV, edgeH } = axisEdges(gray);
  const { variance: blockVariance, blocksX, blocksY } = blockVariances(gray);

  return {
    gray,
    stats: stats(gray),
    targets,
    edgeV,
    edgeH,
    blockVariance,
    blocksX,
    blocksY,
  };
}

/**
 * Draw the submission back into the original's frame.
 *
 * When the player cropped, the surviving content is placed where it came from
 * and everything else is flagged as missing.
 */
function alignIntoOriginalFrame(
  edited: HTMLImageElement,
  transform: { crop: { x: number; y: number; w: number; h: number } },
  origSize: { width: number; height: number },
  reference: Gray
): { gray: Gray; missing: Uint8Array } {
  const kx = reference.w / origSize.width;
  const ky = reference.h / origSize.height;
  const dst = {
    x: transform.crop.x * kx,
    y: transform.crop.y * ky,
    w: transform.crop.w * kx,
    h: transform.crop.h * ky,
  };

  const gray = rasterizeGray(reference.w, reference.h, [
    { source: edited, dstRect: dst },
  ]);

  const missing = new Uint8Array(reference.w * reference.h);
  const x0 = Math.max(0, Math.ceil(dst.x));
  const y0 = Math.max(0, Math.ceil(dst.y));
  const x1 = Math.min(reference.w, Math.floor(dst.x + dst.w));
  const y1 = Math.min(reference.h, Math.floor(dst.y + dst.h));
  for (let y = 0; y < reference.h; y++) {
    for (let x = 0; x < reference.w; x++) {
      if (x < x0 || x >= x1 || y < y0 || y >= y1) {
        missing[y * reference.w + x] = 1;
      }
    }
  }
  return { gray, missing };
}

/* ------------------------------------------------------------------ *
 * Tamper signals
 * ------------------------------------------------------------------ */

/** Bounding box of the pixels a crop left behind, or null if nothing survived. */
function survivingBox(
  missing: Uint8Array,
  w: number,
  h: number
): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (missing[y * w + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < x0 || y1 < y0) return null;
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/** Copy a rectangle out of a Gray. */
function subGray(
  g: Gray,
  box: { x0: number; y0: number; x1: number; y1: number }
): Gray {
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      data[y * w + x] = g.data[(y + box.y0) * g.w + (x + box.x0)];
    }
  }
  return { w, h, data };
}

/** Per-pixel strength of vertical and horizontal edges. */
function axisEdges(g: Gray): { edgeV: Float32Array; edgeH: Float32Array } {
  const edgeV = new Float32Array(g.w * g.h);
  const edgeH = new Float32Array(g.w * g.h);
  for (let y = 1; y < g.h - 1; y++) {
    for (let x = 1; x < g.w - 1; x++) {
      const i = y * g.w + x;
      edgeV[i] = Math.abs(g.data[i + 1] - g.data[i - 1]);
      edgeH[i] = Math.abs(g.data[i + g.w] - g.data[i - g.w]);
    }
  }
  return { edgeV, edgeH };
}

function blockVariances(g: Gray): {
  variance: Float32Array;
  blocksX: number;
  blocksY: number;
} {
  const bs = SCORING.blockSize;
  const blocksX = Math.max(1, Math.floor(g.w / bs));
  const blocksY = Math.max(1, Math.floor(g.h / bs));
  const variance = new Float32Array(blocksX * blocksY);
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      let sum = 0;
      let sumSq = 0;
      let n = 0;
      for (let y = by * bs; y < (by + 1) * bs; y++) {
        for (let x = bx * bs; x < (bx + 1) * bs; x++) {
          const v = g.data[y * g.w + x];
          sum += v;
          sumSq += v * v;
          n++;
        }
      }
      const mean = sum / n;
      variance[by * blocksX + bx] = sumSq / n - mean * mean;
    }
  }
  return { variance, blocksX, blocksY };
}

/**
 * Grow a mask by `r` pixels (separable max filter).
 *
 * Needed because a cropped submission is re-rendered into the original frame
 * with empty space around it. Pixels just *inside* the crop boundary have
 * neighbours in that empty space, so their gradients read as a long straight
 * introduced edge — which would score a plain crop as if it were a redaction
 * bar. Dilating the missing mask keeps the boundary out of the edge and block
 * passes, so cropping is charged as frame loss only.
 */
function dilateMask(
  mask: Uint8Array,
  w: number,
  h: number,
  r: number
): Uint8Array {
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k < 0 ? 0 : x + k >= w ? w - 1 : x + k;
        if (mask[y * w + xx]) {
          v = 1;
          break;
        }
      }
      tmp[y * w + x] = v;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k < 0 ? 0 : y + k >= h ? h - 1 : y + k;
        if (tmp[yy * w + x]) {
          v = 1;
          break;
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

/**
 * Whole-frame tamper signals.
 *
 * Key calibration decision: crudeness is measured **where the player actually
 * edited**, not as a fraction of the whole frame. Evidence regions are small —
 * a plate is well under 1% of the picture — so a frame-relative score made the
 * most blatant possible tampering (a solid bar over every target) read as
 * ~95% intact, which inverted the whole game: the crude strategy won.
 *
 * So the block detectors answer "of the blocks you changed, what fraction did
 * you flatten or fill with something new?", and the edge detector compares the
 * introduced straight-line length against the perimeter a compact alteration of
 * that area would have. A blur scores ~0 on both; a hard rectangle scores ~1.
 *
 * Both are ramped by a confidence factor so a couple of stray pixels cannot
 * read as total tampering.
 */
function computeSignals(
  profile: OriginalProfile,
  aligned: Gray,
  missing: Uint8Array,
  frameLoss: number
): TamperSignals {
  const g = profile.gray;
  const orig = g.data;
  const edit = aligned.data;
  // Edge and block passes ignore the crop seam; see dilateMask.
  const seam = dilateMask(missing, g.w, g.h, 3);

  // --- how much was changed at all -------------------------------------
  let altered = 0;
  let counted = 0;
  for (let i = 0; i < orig.length; i++) {
    if (missing[i]) continue;
    counted++;
    if (Math.abs(orig[i] - edit[i]) > SCORING.alteredThreshold) altered++;
  }
  const alteredFraction = counted ? altered / counted : 0;

  // --- introduced straight lines (the redaction-bar detector) ----------
  // An introduced edge counts as "drawn" only when it is strongly axis
  // aligned: sharp across one axis and quiet along the other. Photographic
  // content rarely does that; a rectangle's border always does.
  const { edgeV, edgeH } = axisEdges(aligned);
  const T = SCORING.hardEdgeThreshold;
  const quiet = T * SCORING.axisDominance;
  let straight = 0;
  for (let y = 1; y < g.h - 1; y++) {
    for (let x = 1; x < g.w - 1; x++) {
      const i = y * g.w + x;
      if (seam[i]) continue;
      const newV = edgeV[i] > T && profile.edgeV[i] <= T;
      const newH = edgeH[i] > T && profile.edgeH[i] <= T;
      if ((newV && edgeH[i] < quiet) || (newH && edgeV[i] < quiet)) straight++;
    }
  }
  // A compact alteration of area A has a perimeter around 4·sqrt(A); edge
  // detection reports it a couple of pixels thick, hence the scale factor.
  const expectedPerimeter =
    4 * Math.sqrt(Math.max(altered, 1)) * SCORING.hardEdgePerimeterScale;
  const edgeConfidence = clamp01(altered / SCORING.crudenessMinPixels);
  const hardEdges = clamp01(straight / expectedPerimeter) * edgeConfidence;

  // --- flat fills and foreign content, relative to what was edited -----
  const {
    variance: editBlockVar,
    blocksX,
    blocksY,
  } = blockVariances(aligned);
  const bs = SCORING.blockSize;
  let flat = 0;
  let foreign = 0;
  let alteredBlocks = 0;
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const cx = bx * bs + (bs >> 1);
      const cy = by * bs + (bs >> 1);
      // Skip blocks anywhere near the crop seam, not just centred on it.
      if (seam[cy * g.w + cx] || seam[by * bs * g.w + bx * bs]) continue;

      // Only blocks the player substantially *replaced* count here. A block
      // straddling the border of a redaction is half original content, so its
      // variance stays high — including it would dilute the ratio and let a
      // solid fill over a small region look far less crude than it is. The
      // question being answered is: of the area you replaced, how much of it is
      // now featureless?
      let changedPixels = 0;
      let n = 0;
      for (let y = by * bs; y < (by + 1) * bs; y++) {
        for (let x = bx * bs; x < (bx + 1) * bs; x++) {
          const i = y * g.w + x;
          if (Math.abs(orig[i] - edit[i]) > SCORING.alteredThreshold) {
            changedPixels++;
          }
          n++;
        }
      }
      if (!n || changedPixels / n < SCORING.blockReplacedFraction) continue;
      alteredBlocks++;

      const bi = by * blocksX + bx;
      const ov = profile.blockVariance[bi];
      const ev = editBlockVar[bi];
      if (
        ov > SCORING.flatBlockOrigVariance &&
        ev < SCORING.flatBlockEditVariance
      ) {
        flat++;
      }
      if (ev > ov * SCORING.foreignVarianceFactor + SCORING.foreignVarianceBias) {
        foreign++;
      }
    }
  }
  const blockConfidence = clamp01(alteredBlocks / SCORING.crudenessMinBlocks);
  const flatBlocks = alteredBlocks
    ? (flat / alteredBlocks) * blockConfidence
    : 0;
  const foreignDetail = alteredBlocks
    ? (foreign / alteredBlocks) * blockConfidence
    : 0;

  // --- exposure / grade drift ------------------------------------------
  const editStats = stats(aligned, missing);
  const origStats = stats(g, missing);
  const histogramShift = clamp01(
    Math.abs(editStats.mean - origStats.mean) / 90 +
      Math.abs(editStats.std - origStats.std) / 70
  );

  // --- whole-frame detail loss (the defocus detector) -------------------
  //
  // The editor's filters are global: there is no way to soften one face, only
  // to soften the photograph. So the winning move used to be "drag DEFOCUS to
  // the end", which erased every identifier at almost no cost to integrity —
  // an exhibit with no fine structure anywhere read as 85% authentic.
  //
  // A surveillance still whose entire frame has lost its detail is as plainly
  // worked-on as one with a black bar across it, and this charges for that. It
  // is what puts the tension back into the only tool that can hide anything
  // subtly: blur far enough to beat recognition and the defocus itself becomes
  // the finding, so the play is to spend exactly enough and no more.
  //
  // Measured over the surviving frame only. A crop is re-rendered into the
  // original's frame with empty space around it, and that empty space has no
  // structure at all — including it charged a plain crop as if the player had
  // defocused the whole exhibit, on top of the frame-loss penalty it already
  // earns. Cropping removes evidence; it does not soften what is left.
  const box = survivingBox(missing, g.w, g.h);
  const detailLoss = box
    ? clamp01(1 - survivingDetail(subGray(aligned, box), subGray(g, box)))
    : 0;

  return {
    hardEdges,
    flatBlocks,
    foreignDetail,
    histogramShift,
    frameLoss,
    alteredFraction,
    detailLoss,
  };
}
