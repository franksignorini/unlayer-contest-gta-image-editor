/**
 * Streak inpainting — for lifting game HUD out of an evidence capture.
 *
 * Some captures still carry the source game's own overlay: a minimap, the
 * wanted stars, a publisher mark. A pursuit camera does not draw a minimap, and
 * the exhibit is the one image the whole game asks the player to scrutinise, so
 * the overlay reads as exactly what it is.
 *
 * Every capture that needs this is a moving shot, which is what makes it
 * tractable: the background under the HUD is motion blur, and motion blur is
 * structure along one direction and almost nothing across it. So a hole is
 * filled by walking out of it both ways along that direction, averaging a few
 * pixels past each edge, and interpolating between the two by distance — the
 * streaks the camera recorded simply carry on through. A little grain goes back
 * on top so the fill does not read as flatter than the frame around it.
 *
 * Deterministic (seeded grain), so re-running the pipeline reproduces the same
 * bytes and the forensic baseline never shifts under the scoring model.
 */

import { prng } from './raster.mjs';

/**
 * @param {import('./raster.mjs').Raster} img  edited in place
 * @param {{
 *   rects: {x:number,y:number,w:number,h:number}[],
 *   circles?: {x:number,y:number,r:number}[],
 *   direction: [number, number],
 *   grain?: number,
 *   seed?: number,
 * }} hole
 */
export function inpaintStreaks(img, hole) {
  const { rects, circles = [], direction, grain = 3, seed = 1 } = hole;
  const inHole = (x, y) =>
    rects.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) ||
    circles.some((c) => (x - c.x) ** 2 + (y - c.y) ** 2 <= c.r * c.r);
  const inImage = (x, y) => x >= 0 && y >= 0 && x < img.w && y < img.h;

  const len = Math.hypot(direction[0], direction[1]);
  const dx = direction[0] / len;
  const dy = direction[1] / len;

  /** Distance to the hole's edge along (sx, sy), and the colour just past it. */
  const exit = (x, y, sx, sy) => {
    for (let t = 1; t < 2000; t++) {
      const px = Math.round(x + sx * t);
      const py = Math.round(y + sy * t);
      if (!inImage(px, py)) return null;
      if (inHole(px, py)) continue;
      // A short run a couple of pixels clear of the edge, so one stray pixel
      // at the boundary cannot become a stripe across the whole fill.
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let k = 2; k <= 6; k++) {
        const qx = Math.round(x + sx * (t + k));
        const qy = Math.round(y + sy * (t + k));
        if (!inImage(qx, qy) || inHole(qx, qy)) continue;
        const i = img.idx(qx, qy);
        r += img.data[i];
        g += img.data[i + 1];
        b += img.data[i + 2];
        n++;
      }
      return n ? { t, c: [r / n, g / n, b / n] } : null;
    }
    return null;
  };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  for (const c of circles) {
    minX = Math.min(minX, c.x - c.r);
    minY = Math.min(minY, c.y - c.r);
    maxX = Math.max(maxX, c.x + c.r + 1);
    maxY = Math.max(maxY, c.y + c.r + 1);
  }

  const rand = prng(seed);
  // Read from the untouched frame, write to a copy: filled pixels must never
  // become the source for their neighbours.
  const out = new Float32Array(img.data);
  for (let y = Math.max(0, minY); y < Math.min(img.h, maxY); y++) {
    for (let x = Math.max(0, minX); x < Math.min(img.w, maxX); x++) {
      if (!inHole(x, y)) continue;
      const ahead = exit(x, y, dx, dy);
      const behind = exit(x, y, -dx, -dy);
      if (!ahead && !behind) {
        throw new Error(`inpaint: no source pixels for (${x}, ${y})`);
      }
      let c;
      if (ahead && behind) {
        const w = behind.t / (ahead.t + behind.t);
        c = [0, 1, 2].map((k) => behind.c[k] * (1 - w) + ahead.c[k] * w);
      } else {
        c = (ahead ?? behind).c;
      }
      const n = (rand() - 0.5) * 2 * grain;
      const i = img.idx(x, y);
      out[i] = c[0] + n;
      out[i + 1] = c[1] + n;
      out[i + 2] = c[2] + n;
    }
  }
  img.data.set(out);
}
