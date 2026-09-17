/**
 * Normalises gameplay captures into the intro's backdrop plates.
 *
 *   node scripts/prepare-backdrops.mjs
 *
 * The cold open runs before anything else has loaded, so its imagery has to be
 * cheap. The raw captures are 0.3–13.3MB PNGs (one is 4K); shipping them would
 * stall the first card. Each plate is therefore cropped, capped at MAX_W and
 * re-encoded as a graded JPEG — typically a 20–60x reduction.
 *
 * Two things are baked in rather than left to CSS:
 *
 *   crop  — several captures carry the game's own HUD (wanted stars top-right,
 *           minimap bottom-left). Those corners are cropped out so no scrap of
 *           another game's interface survives into ours.
 *   level — every plate is pushed to the SAME mean luminance. This is the part
 *           that matters. The captures run from a bright daylight swamp to a
 *           dim interior; grading them by a fixed multiplier left them three
 *           stops apart, and once the CSS scrim went over the top the darker
 *           ones measured 6/255 in the band where the words sit — black on any
 *           real display. Levelling to a target means the scrim can be tuned
 *           once and hold for every plate.
 *
 * Sources live in /assets/gameplay, outside /public, for the same reason the
 * evidence sources do: the app never loads them and they would otherwise be
 * deployed and served for nothing. This script only writes to /public/backdrops.
 *
 * Uses sharp, which is a devDependency — nothing at runtime depends on it.
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const MAX_W = 1600;
const QUALITY = 74;
const SRC_DIR = path.join(process.cwd(), 'assets', 'gameplay');
const OUT_DIR = path.join(process.cwd(), 'public', 'backdrops');

/**
 * Mean luminance every plate is levelled to, 0..255. The single number that
 * decides how present the footage feels. The CSS scrim takes it down further,
 * but only where the type sits — see IntroBackdrop.
 */
const TARGET_MEAN = 78;
const SATURATION = 0.6;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/**
 * Chosen captures. `crop` is a fraction of the source frame — left, top, width,
 * height — and exists only to remove burnt-in game HUD.
 */
const PLATES = [
  {
    slug: 'pursuit-swamp',
    source: 'image.png',
    note: 'Everglades pursuit — helicopter, marked unit, airboat.',
  },
  {
    slug: 'standoff-street',
    source: 'image copy.png',
    // Wanted stars top-right, minimap bottom-left.
    crop: { left: 0.1, top: 0, width: 0.81, height: 0.81 },
    note: 'Street standoff — roadblock and air support.',
  },
  {
    slug: 'shootout-gate',
    source: 'image copy 3.png',
    crop: { left: 0.1, top: 0, width: 0.81, height: 0.81 },
    note: 'Gate shootout — two marked units, weapon drawn.',
  },
  {
    slug: 'two-up-car',
    source: 'image copy 6.png',
    note: 'Two occupants, one armed — faces to camera.',
  },
];

async function build(plate) {
  const src = path.join(SRC_DIR, plate.source);
  if (!fs.existsSync(src)) {
    console.warn(`  ! missing source: ${plate.source}`);
    return null;
  }

  let pipeline = sharp(src);
  const { width, height } = await pipeline.metadata();

  if (plate.crop) {
    pipeline = pipeline.extract({
      left: Math.round(width * plate.crop.left),
      top: Math.round(height * plate.crop.top),
      width: Math.round(width * plate.crop.width),
      height: Math.round(height * plate.crop.height),
    });
  }

  // Stage the geometry first, so the levelling measures what actually ships.
  const staged = await pipeline
    .resize({ width: MAX_W, withoutEnlargement: true })
    .toBuffer();

  const measured = await sharp(staged).greyscale().stats();
  const brightness = clamp(TARGET_MEAN / measured.channels[0].mean, 0.2, 1.8);

  const out = path.join(OUT_DIR, `${plate.slug}.jpg`);
  const info = await sharp(staged)
    .modulate({ brightness, saturation: SATURATION })
    .jpeg({ quality: QUALITY, mozjpeg: true, chromaSubsampling: '4:2:0' })
    .toFile(out);

  // Levelling is the whole point, so the script verifies it rather than assumes.
  const result = await sharp(out).greyscale().stats();

  return {
    slug: plate.slug,
    bytesBefore: fs.statSync(src).size,
    bytesAfter: info.size,
    w: info.width,
    h: info.height,
    mean: result.channels[0].mean,
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Backdrop plates → ${path.relative(process.cwd(), OUT_DIR)}\n`);

  let before = 0;
  let after = 0;
  const kb = (n) => `${(n / 1024).toFixed(0)}KB`;

  for (const plate of PLATES) {
    const r = await build(plate);
    if (!r) continue;
    before += r.bytesBefore;
    after += r.bytesAfter;
    console.log(
      `  ${r.slug.padEnd(18)} ${String(r.w).padStart(4)}x${r.h}` +
        `  ${kb(r.bytesBefore).padStart(8)} → ${kb(r.bytesAfter).padStart(6)}` +
        `   mean ${r.mean.toFixed(1).padStart(5)}`
    );
  }

  const mb = (n) => `${(n / 1048576).toFixed(1)}MB`;
  console.log(`\n  total ${mb(before)} → ${mb(after)}   levelled to ${TARGET_MEAN}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
