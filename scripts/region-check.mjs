/**
 * Evidence-region verifier.
 *
 *   node scripts/region-check.mjs [caseId]
 *
 * Reads the regions declared in src/data/missions.ts, draws them over the real
 * screenshot, and writes an annotated preview so the boxes can be checked
 * against the actual pixels rather than estimated by eye. Regenerate this
 * whenever a mission's regions change.
 */

import fs from 'node:fs';
import path from 'node:path';
import { encodePNG } from './raster.mjs';
import { decodePNG } from './png-decode.mjs';

const OUT_DIR = path.join(process.cwd(), 'tmp-region-check');
const PREVIEW_W = 1180;

/**
 * Pull mission id / image / regions straight out of the TS source. A tiny
 * regex reader avoids adding a TS toolchain to a dev-only script, and it fails
 * loudly if the shape drifts.
 */
function readMissions() {
  const src = fs.readFileSync(
    path.join(process.cwd(), 'src', 'data', 'missions.ts'),
    'utf8'
  );
  const missions = [];
  const blocks = src.split(/\n  \{\n/).slice(1);
  for (const block of blocks) {
    const id = /id:\s*"([^"]+)"/.exec(block)?.[1];
    const image = /image:\s*"([^"]+)"/.exec(block)?.[1];
    const size = /imageSize:\s*\{\s*width:\s*(\d+),\s*height:\s*(\d+)/.exec(block);
    if (!id || !image || !size) continue;
    const targets = [];
    const re =
      /id:\s*"([^"]+)",[\s\S]*?short:\s*"([^"]+)",[\s\S]*?region:\s*\{\s*x:\s*(-?\d+),\s*y:\s*(-?\d+),\s*w:\s*(\d+),\s*h:\s*(\d+)\s*\}/g;
    let m;
    while ((m = re.exec(block))) {
      targets.push({
        id: m[1],
        short: m[2],
        x: +m[3],
        y: +m[4],
        w: +m[5],
        h: +m[6],
      });
    }
    missions.push({
      id,
      image,
      width: +size[1],
      height: +size[2],
      targets,
    });
  }
  return missions;
}

const COLORS = [
  [255, 45, 111], // magenta
  [34, 211, 238], // cyan
  [255, 176, 32], // amber
  [53, 214, 138], // clear
  [255, 59, 48], // danger
  [180, 140, 255], // violet
];

function drawBox(r, x, y, w, h, color, thickness = 3) {
  for (let t = 0; t < thickness; t++) {
    r.fillRect(x - t, y - t, w + t * 2, 1, color, 1);
    r.fillRect(x - t, y + h + t, w + t * 2, 1, color, 1);
    r.fillRect(x - t, y - t, 1, h + t * 2, color, 1);
    r.fillRect(x + w + t, y - t, 1, h + t * 2, color, 1);
  }
}

function main() {
  const only = process.argv[2];
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const missions = readMissions();
  if (!missions.length) {
    console.error('No missions parsed from src/data/missions.ts');
    process.exit(1);
  }

  for (const mission of missions) {
    if (only && mission.id !== only) continue;
    const file = path.join(process.cwd(), 'public', decodeURI(mission.image));
    if (!fs.existsSync(file)) {
      console.error(`${mission.id}: missing image ${mission.image}`);
      continue;
    }
    const img = decodePNG(file);

    if (img.w !== mission.width || img.h !== mission.height) {
      console.error(
        `${mission.id}: imageSize ${mission.width}x${mission.height} does not ` +
          `match the file (${img.w}x${img.h})`
      );
    }

    mission.targets.forEach((t, i) => {
      const color = COLORS[i % COLORS.length];
      const thickness = Math.max(2, Math.round(img.w / 500));
      drawBox(img, t.x, t.y, t.w, t.h, color, thickness);
      // A solid tab above the box so labels stay readable over busy pixels.
      const scale = Math.max(2, Math.round(img.w / 420));
      const labelW = t.short.length * 6 * scale + scale * 2;
      const labelH = 7 * scale + scale * 2;
      const ly = Math.max(0, t.y - labelH - thickness);
      img.fillRect(t.x - thickness, ly, labelW, labelH, [8, 8, 12], 0.9);
      img.fillRect(t.x - thickness, ly, labelW, 2, color, 1);
      img.text(t.short, t.x - thickness + scale, ly + scale, scale, color, {
        tracking: 1,
      });
    });

    const factor = Math.max(1, Math.round(img.w / PREVIEW_W));
    const preview = factor > 1 ? img.downsample(factor) : img;
    const out = path.join(OUT_DIR, `${mission.id}.png`);
    fs.writeFileSync(out, encodePNG(preview));
    console.log(
      `${mission.id}  ${img.w}x${img.h} -> ${preview.w}x${preview.h}  ` +
        `${mission.targets.length} regions  ${out}`
    );
  }
}

main();
