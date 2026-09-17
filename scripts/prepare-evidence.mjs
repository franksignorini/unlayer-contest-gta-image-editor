/**
 * Normalises the chosen in-game captures into /public/evidence.
 *
 *   node scripts/prepare-evidence.mjs
 *
 * The source captures range from 1000px to 4K. The editor holds the exhibit at
 * native resolution and `getImage()` re-encodes the whole canvas on every
 * forensic poll, so an oversized exhibit is felt directly as editing lag. Every
 * case is therefore capped at MAX_W, which is still far more detail than the
 * evidence regions need.
 *
 * Sources live in /assets/sources — deliberately outside /public, since the
 * app never loads them and they would otherwise deploy for nothing. They are
 * left untouched; this script only writes to /public/evidence.
 */

import fs from 'node:fs';
import path from 'node:path';
import { encodePNG, Raster } from './raster.mjs';
import { decodePNG } from './png-decode.mjs';
import { inpaintStreaks } from './inpaint.mjs';

const MAX_W = 1440;
const SRC_DIR = path.join(process.cwd(), 'assets', 'sources');
const OUT_DIR = path.join(process.cwd(), 'public', 'evidence');

/** Chosen captures, in case order. */
const CASES = [
  {
    slug: 'case-001',
    source: 'image copy.png',
    // The source game's HUD, in normalised-exhibit pixels: the minimap (with
    // its north marker and waypoint dot), the wanted stars, and the publisher
    // mark. A helicopter camera draws none of them. The shot is a fast pursuit,
    // so each fill runs along the motion blur already under it — see
    // inpaint.mjs. None of these touch an evidence region.
    hud: [
      {
        rects: [{ x: 21, y: 657, w: 233, h: 137 }],
        circles: [
          { x: 24, y: 766, r: 9 },
          { x: 150, y: 663, r: 9 },
        ],
        // Along the kerb and verge, which is the direction of travel.
        direction: [1, -0.587],
        grain: 3.2,
        seed: 7,
      },
      {
        rects: [{ x: 1284, y: 16, w: 142, h: 60 }],
        // Vertical, so the pole and window mullions behind carry through.
        direction: [0, 1],
        grain: 2,
        seed: 11,
      },
      {
        rects: [{ x: 1418, y: 782, w: 20, h: 22 }],
        direction: [1, 0],
        grain: 0.6,
        seed: 13,
      },
    ],
  },
  { slug: 'case-002', source: 'image copy 7.png' },
  { slug: 'case-003', source: 'image copy 3.png' },
  { slug: 'case-004', source: 'image copy 8.png' },
  { slug: 'case-005', source: 'image copy 6.png' },
];

/** Bilinear resize — handles the non-integer factors an integer box misses. */
function resize(src, w, h) {
  const out = new Raster(w, h);
  const sx = src.w / w;
  const sy = src.h / h;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(src.h - 1, (y + 0.5) * sy - 0.5);
    const y0 = Math.max(0, Math.floor(fy));
    const y1 = Math.min(src.h - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(src.w - 1, (x + 0.5) * sx - 0.5);
      const x0 = Math.max(0, Math.floor(fx));
      const x1 = Math.min(src.w - 1, x0 + 1);
      const tx = fx - x0;
      const o = out.idx(x, y);
      for (let c = 0; c < 3; c++) {
        const a = src.data[src.idx(x0, y0) + c];
        const b = src.data[src.idx(x1, y0) + c];
        const d = src.data[src.idx(x0, y1) + c];
        const e = src.data[src.idx(x1, y1) + c];
        out.data[o + c] =
          a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + d * (1 - tx) * ty + e * tx * ty;
      }
    }
  }
  return out;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const manifest = {};
  for (const { slug, source, hud = [] } of CASES) {
    const file = path.join(SRC_DIR, source);
    if (!fs.existsSync(file)) {
      console.error(`missing source: ${source}`);
      continue;
    }
    const img = decodePNG(file);
    let out = img;
    if (img.w > MAX_W) {
      const h = Math.round((img.h / img.w) * MAX_W);
      // Box-downsample first where an integer factor exists: it is sharper
      // than a single bilinear pass over a large reduction.
      const factor = Math.floor(img.w / MAX_W);
      const pre = factor >= 2 ? img.downsample(factor) : img;
      out = resize(pre, MAX_W, h);
    }
    for (const hole of hud) inpaintStreaks(out, hole);
    const png = encodePNG(out);
    fs.writeFileSync(path.join(OUT_DIR, `${slug}.png`), png);
    manifest[slug] = { source, width: out.w, height: out.h };
    console.log(
      `${slug}  ${img.w}x${img.h} -> ${out.w}x${out.h}  ` +
        `${(png.length / 1024 / 1024).toFixed(2)}MB  (${source})`
    );
  }
  fs.writeFileSync(
    path.join(OUT_DIR, 'sources.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );
}

main();
