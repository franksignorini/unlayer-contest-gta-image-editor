/**
 * Zero-dependency software rasteriser + PNG encoder.
 *
 * Used by the dev-only evidence tooling:
 *   - scripts/prepare-evidence.mjs  normalises the real captures into
 *     /public/evidence
 *   - scripts/region-check.mjs      draws declared evidence boxes over a
 *     capture so they can be verified against actual pixels
 *
 * Includes a 5x7 bitmap font, used for the region labels in those previews.
 * Some drawing primitives here are more than the current tooling needs; they
 * are kept because this is a general-purpose raster module.
 */

import zlib from 'node:zlib';

/* ------------------------------------------------------------------ *
 * Colour
 * ------------------------------------------------------------------ */

/** '#rrggbb' | '#rgb' | [r,g,b] -> [r,g,b] */
export function rgb(c) {
  if (Array.isArray(c)) return c;
  let h = c.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export const lerp = (a, b, t) => a + (b - a) * t;
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const mixC = (a, b, t) => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

/** Deterministic PRNG (mulberry32). */
export function prng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ *
 * 5x7 bitmap font — deliberately blocky, like real CCTV OSD burn-in
 * ------------------------------------------------------------------ */

const G = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10011', '01111'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '#': ['01010', '01010', '11111', '01010', '11111', '01010', '01010'],
  '*': ['00000', '01010', '00100', '11111', '00100', '01010', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '[': ['01110', '01000', '01000', '01000', '01000', '01000', '01110'],
  ']': ['01110', '00010', '00010', '00010', '00010', '00010', '01110'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00110', '00100', '00000', '00100'],
  '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
  '%': ['10001', '00010', '00010', '00100', '01000', '01000', '10001'],
  '<': ['00010', '00100', '01000', '10000', '01000', '00100', '00010'],
  '>': ['01000', '00100', '00010', '00001', '00010', '00100', '01000'],
  '@': ['01110', '10001', '10111', '10101', '10111', '10000', '01110'],
  // named glyphs
  BULLET: ['00000', '01110', '11111', '11111', '11111', '01110', '00000'],
};

export function textWidth(str, scale, tracking = 1) {
  if (!str.length) return 0;
  return str.length * (5 + tracking) * scale - tracking * scale;
}

/* ------------------------------------------------------------------ *
 * Raster surface (linear-ish float RGB, 0..255)
 * ------------------------------------------------------------------ */

export class Raster {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Float32Array(w * h * 3);
  }

  idx(x, y) {
    return (y * this.w + x) * 3;
  }

  /** Blend one pixel. mode: 'over' | 'add' | 'mul' */
  px(x, y, color, alpha = 1, mode = 'over') {
    if (alpha <= 0) return;
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = this.idx(x, y);
    const d = this.data;
    if (mode === 'add') {
      d[i] += color[0] * alpha;
      d[i + 1] += color[1] * alpha;
      d[i + 2] += color[2] * alpha;
    } else if (mode === 'mul') {
      const k0 = 1 - alpha + (color[0] / 255) * alpha;
      const k1 = 1 - alpha + (color[1] / 255) * alpha;
      const k2 = 1 - alpha + (color[2] / 255) * alpha;
      d[i] *= k0;
      d[i + 1] *= k1;
      d[i + 2] *= k2;
    } else {
      const ia = 1 - alpha;
      d[i] = d[i] * ia + color[0] * alpha;
      d[i + 1] = d[i + 1] * ia + color[1] * alpha;
      d[i + 2] = d[i + 2] * ia + color[2] * alpha;
    }
  }

  clear(color) {
    const c = rgb(color);
    for (let i = 0; i < this.data.length; i += 3) {
      this.data[i] = c[0];
      this.data[i + 1] = c[1];
      this.data[i + 2] = c[2];
    }
  }

  fillRect(x, y, w, h, color, alpha = 1, mode = 'over') {
    const c = rgb(color);
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.ceil(x + w));
    const y1 = Math.min(this.h, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) this.px(xx, yy, c, alpha, mode);
    }
  }

  /**
   * Axis-aligned gradient. stops: [[t, color], ...] with t in 0..1.
   * dir: 'v' (top->bottom) | 'h' (left->right)
   */
  gradientRect(x, y, w, h, stops, dir = 'v', alpha = 1, mode = 'over') {
    const s = stops.map(([t, c]) => [t, rgb(c)]);
    const sample = (t) => {
      if (t <= s[0][0]) return s[0][1];
      if (t >= s[s.length - 1][0]) return s[s.length - 1][1];
      for (let i = 0; i < s.length - 1; i++) {
        if (t >= s[i][0] && t <= s[i + 1][0]) {
          const span = s[i + 1][0] - s[i][0] || 1;
          return mixC(s[i][1], s[i + 1][1], (t - s[i][0]) / span);
        }
      }
      return s[s.length - 1][1];
    };
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.ceil(x + w));
    const y1 = Math.min(this.h, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      const rowC = dir === 'v' ? sample((yy - y) / (h || 1)) : null;
      for (let xx = x0; xx < x1; xx++) {
        this.px(xx, yy, rowC || sample((xx - x) / (w || 1)), alpha, mode);
      }
    }
  }

  /** Soft radial light pool. `squash` < 1 flattens it into an ellipse. */
  glow(cx, cy, r, color, intensity = 1, falloff = 2, mode = 'add', squash = 1) {
    const c = rgb(color);
    const ry = r * squash;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(this.w, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - ry));
    const y1 = Math.min(this.h, Math.ceil(cy + ry));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const dx = (xx - cx) / r;
        const dy = (yy - cy) / ry;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= 1) continue;
        this.px(xx, yy, c, Math.pow(1 - d, falloff) * intensity, mode);
      }
    }
  }

  /** Scanline polygon fill, 4x vertical supersampling + exact horizontal coverage. */
  fillPoly(pts, color, alpha = 1, mode = 'over') {
    if (pts.length < 3) return;
    const c = rgb(color);
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(this.h - 1, Math.ceil(maxY));
    if (y1 < y0) return;
    const SS = 4;
    const cov = new Float32Array(this.w);
    const xs = [];
    for (let yy = y0; yy <= y1; yy++) {
      cov.fill(0);
      for (let s = 0; s < SS; s++) {
        const sy = yy + (s + 0.5) / SS;
        xs.length = 0;
        for (let i = 0; i < pts.length; i++) {
          const [ax, ay] = pts[i];
          const [bx, by] = pts[(i + 1) % pts.length];
          if (ay === by) continue;
          if (sy >= Math.min(ay, by) && sy < Math.max(ay, by)) {
            xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
          }
        }
        xs.sort((p, q) => p - q);
        for (let i = 0; i + 1 < xs.length; i += 2) {
          let sx = xs[i];
          let ex = xs[i + 1];
          if (ex <= 0 || sx >= this.w) continue;
          sx = Math.max(0, sx);
          ex = Math.min(this.w, ex);
          const isx = Math.floor(sx);
          const iex = Math.floor(ex);
          if (isx === iex) {
            cov[isx] += (ex - sx) / SS;
          } else {
            cov[isx] += (isx + 1 - sx) / SS;
            for (let xx = isx + 1; xx < iex; xx++) cov[xx] += 1 / SS;
            if (iex < this.w) cov[iex] += (ex - iex) / SS;
          }
        }
      }
      for (let xx = 0; xx < this.w; xx++) {
        if (cov[xx] > 0.002) {
          this.px(xx, yy, c, Math.min(1, cov[xx]) * alpha, mode);
        }
      }
    }
  }

  fillEllipse(cx, cy, rx, ry, color, alpha = 1, mode = 'over', segments = 56) {
    const pts = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    this.fillPoly(pts, color, alpha, mode);
  }

  line(a, b, color, width = 1, alpha = 1, mode = 'over') {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 0.0001) return;
    const nx = (-dy / len) * (width / 2);
    const ny = (dx / len) * (width / 2);
    this.fillPoly(
      [
        [a[0] + nx, a[1] + ny],
        [b[0] + nx, b[1] + ny],
        [b[0] - nx, b[1] - ny],
        [a[0] - nx, a[1] - ny],
      ],
      color,
      alpha,
      mode
    );
  }

  strokePoly(pts, color, width, alpha = 1, closed = false, mode = 'over') {
    const n = pts.length;
    const lim = closed ? n : n - 1;
    for (let i = 0; i < lim; i++) {
      this.line(pts[i], pts[(i + 1) % n], color, width, alpha, mode);
    }
  }

  /** Blocky OSD text. Returns advance width. */
  text(str, x, y, scale, color, opts = {}) {
    const { tracking = 1, alpha = 1, mode = 'over' } = opts;
    const c = rgb(color);
    let cx = x;
    for (const ch of String(str).toUpperCase()) {
      const g = G[ch] || G['?'];
      for (let gy = 0; gy < 7; gy++) {
        const row = g[gy];
        for (let gx = 0; gx < 5; gx++) {
          if (row[gx] === '1') {
            this.fillRect(cx + gx * scale, y + gy * scale, scale, scale, c, alpha, mode);
          }
        }
      }
      cx += (5 + tracking) * scale;
    }
    return cx - x;
  }

  /* ---------------- post / degradation ---------------- */

  /** Separable box blur, optionally limited to a region. */
  blur(radius, region = null) {
    const r = Math.round(radius);
    if (r < 1) return;
    const x0 = region ? Math.max(0, region.x | 0) : 0;
    const y0 = region ? Math.max(0, region.y | 0) : 0;
    const x1 = region ? Math.min(this.w, (region.x + region.w) | 0) : this.w;
    const y1 = region ? Math.min(this.h, (region.y + region.h) | 0) : this.h;
    const w = x1 - x0;
    const h = y1 - y0;
    if (w <= 0 || h <= 0) return;
    const tmp = new Float32Array(w * h * 3);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sr = 0;
        let sg = 0;
        let sb = 0;
        for (let k = -r; k <= r; k++) {
          const sx = Math.min(x1 - 1, Math.max(x0, x0 + x + k));
          const i = this.idx(sx, y0 + y);
          sr += this.data[i];
          sg += this.data[i + 1];
          sb += this.data[i + 2];
        }
        const n = r * 2 + 1;
        const o = (y * w + x) * 3;
        tmp[o] = sr / n;
        tmp[o + 1] = sg / n;
        tmp[o + 2] = sb / n;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sr = 0;
        let sg = 0;
        let sb = 0;
        for (let k = -r; k <= r; k++) {
          const sy = Math.min(h - 1, Math.max(0, y + k));
          const o = (sy * w + x) * 3;
          sr += tmp[o];
          sg += tmp[o + 1];
          sb += tmp[o + 2];
        }
        const n = r * 2 + 1;
        const i = this.idx(x0 + x, y0 + y);
        this.data[i] = sr / n;
        this.data[i + 1] = sg / n;
        this.data[i + 2] = sb / n;
      }
    }
  }

  /** Luma-weighted sensor noise — darker areas get noisier, as in real low light. */
  noise(amount, seed = 1, chroma = 0.35) {
    const rnd = prng(seed);
    for (let i = 0; i < this.data.length; i += 3) {
      const l = (this.data[i] + this.data[i + 1] + this.data[i + 2]) / 765;
      const k = amount * (1.25 - l * 0.85);
      const n = (rnd() - 0.5) * 2 * k;
      this.data[i] += n + (rnd() - 0.5) * 2 * k * chroma;
      this.data[i + 1] += n;
      this.data[i + 2] += n + (rnd() - 0.5) * 2 * k * chroma;
    }
  }

  scanlines(period, strength, offset = 0) {
    for (let y = 0; y < this.h; y++) {
      const f = ((y + offset) % period) / period;
      const k = 1 - strength * (0.5 + 0.5 * Math.cos(f * Math.PI * 2));
      for (let x = 0; x < this.w; x++) {
        const i = this.idx(x, y);
        this.data[i] *= k;
        this.data[i + 1] *= k;
        this.data[i + 2] *= k;
      }
    }
  }

  vignette(strength, power = 2.2) {
    const cx = this.w / 2;
    const cy = this.h / 2;
    const maxD = Math.hypot(cx, cy);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const d = Math.hypot(x - cx, y - cy) / maxD;
        const k = 1 - strength * Math.pow(d, power);
        const i = this.idx(x, y);
        this.data[i] *= k;
        this.data[i + 1] *= k;
        this.data[i + 2] *= k;
      }
    }
  }

  /** Lateral chroma smear — cheap CCTV/VHS colour bleed. */
  chromaShift(px) {
    if (!px) return;
    const src = Float32Array.from(this.data);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = this.idx(x, y);
        this.data[i] = src[this.idx(Math.min(this.w - 1, x + px), y)];
        this.data[i + 2] = src[this.idx(Math.max(0, x - px), y) + 2];
      }
    }
  }

  levels(contrast = 1, lift = 0, gamma = 1) {
    for (let i = 0; i < this.data.length; i++) {
      let v = this.data[i] / 255;
      v = (v - 0.5) * contrast + 0.5;
      v = Math.pow(Math.max(0, v), gamma);
      this.data[i] = (v * (1 - lift) + lift) * 255;
    }
  }

  /** Push the whole frame toward a colour (night-camera cast). */
  tint(color, amount) {
    const c = rgb(color);
    for (let i = 0; i < this.data.length; i += 3) {
      this.data[i] = lerp(this.data[i], c[0], amount);
      this.data[i + 1] = lerp(this.data[i + 1], c[1], amount);
      this.data[i + 2] = lerp(this.data[i + 2], c[2], amount);
    }
  }

  /** Interlace tear: shift a horizontal band sideways. */
  tear(y, height, shift) {
    const src = Float32Array.from(this.data);
    for (let yy = Math.max(0, y); yy < Math.min(this.h, y + height); yy++) {
      for (let x = 0; x < this.w; x++) {
        const j = this.idx(Math.min(this.w - 1, Math.max(0, x + shift)), yy);
        const i = this.idx(x, yy);
        this.data[i] = src[j];
        this.data[i + 1] = src[j + 1];
        this.data[i + 2] = src[j + 2];
      }
    }
  }

  /** Box-downsample by an integer factor — this is our anti-aliasing. */
  downsample(factor) {
    const w = Math.floor(this.w / factor);
    const h = Math.floor(this.h / factor);
    const out = new Raster(w, h);
    const n = factor * factor;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sr = 0;
        let sg = 0;
        let sb = 0;
        for (let dy = 0; dy < factor; dy++) {
          for (let dx = 0; dx < factor; dx++) {
            const i = this.idx(x * factor + dx, y * factor + dy);
            sr += this.data[i];
            sg += this.data[i + 1];
            sb += this.data[i + 2];
          }
        }
        const o = out.idx(x, y);
        out.data[o] = sr / n;
        out.data[o + 1] = sg / n;
        out.data[o + 2] = sb / n;
      }
    }
    return out;
  }

  toRGB8() {
    const out = Buffer.allocUnsafe(this.w * this.h * 3);
    for (let i = 0; i < this.data.length; i++) {
      out[i] = clamp255(Math.round(this.data[i]));
    }
    return out;
  }
}

/* ------------------------------------------------------------------ *
 * PNG encoding (RGB8, filter 0, zlib deflate)
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

export function encodePNG(raster) {
  const { w, h } = raster;
  const px = raster.toRGB8();
  const stride = w * 3;
  const raw = Buffer.allocUnsafe((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = truecolour RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
