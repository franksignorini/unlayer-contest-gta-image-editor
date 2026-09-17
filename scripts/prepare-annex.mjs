/**
 * Normalises intelligence-annex material into /public/realgameimages.
 *
 *   node scripts/prepare-annex.mjs
 *
 * The annex is the clean, on-file photography the department already holds —
 * shown at case select, during the facial-recognition pass, and again on a
 * confirmed match. Its fidelity is load-bearing: the whole threat model rests
 * on the contrast between the grainy exhibit the police *have* and the sharp
 * reference they will compare it against. So this grades nothing and softens
 * nothing. It only fixes the delivery.
 *
 * The sources are 4K (3840x2160) frames, ~12MB in total, for panels that are
 * never rendered wider than about 520 CSS pixels. `next/image` optimises on
 * demand, which means the first request for each one triggers an 8-megapixel
 * resize — which is exactly why the annex panels were still blank when the
 * briefing painted. Capping the sources near the largest size that can actually
 * be displayed makes that first pass cheap and shrinks the deploy with it.
 *
 * Two rules the earlier layout got wrong and this fixes:
 *
 *   sources live outside /public — same as /assets/gameplay and /assets/sources.
 *     The originals used to sit in /public/realgameimages, so 4K masters were
 *     being deployed and served. This script is the only thing that writes
 *     there now.
 *   only referenced material ships — the build list is scanned out of the whole
 *     of /src rather than hardcoded, so adding a case picks its references up
 *     automatically and nothing unreferenced can quietly ride along.
 *
 *     Scanning *all* of /src is load-bearing, not thoroughness for its own
 *     sake. An earlier version read missions.ts alone and therefore dropped the
 *     cold open's backdrop, which is referenced straight from BootSequence —
 *     the page still rendered locally because Next's image cache was holding a
 *     copy, and it would have 404'd on the first clean deploy.
 *
 * Uses sharp, a devDependency — nothing at runtime depends on it.
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

/**
 * The annex panels are never rendered wider than ~520 CSS px, but the same
 * material also backs the cold open full-bleed, so the cap has to clear a
 * desktop viewport rather than a panel. 1920 covers both — and one rule for
 * every file beats a per-file exception that the next person has to remember.
 */
const MAX_W = 1920;

/**
 * High, deliberately. This is the one place in the project where image quality
 * is part of the mechanic rather than a matter of taste — 4:4:4 keeps chroma
 * detail in faces and weapon markings, which is what the exhibit is being
 * compared against.
 */
const QUALITY = 82;
const CHROMA = '4:4:4';

const SRC_DIR = path.join(process.cwd(), 'assets', 'annex');
const OUT_DIR = path.join(process.cwd(), 'public', 'realgameimages');
const CODE_DIR = path.join(process.cwd(), 'src');

/** Every .ts/.tsx file under /src, so nothing that references the annex is missed. */
function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Every annex file the app actually references, in first-seen order. */
function referencedFiles() {
  const found = new Set();
  for (const file of sourceFiles(CODE_DIR)) {
    const code = fs.readFileSync(file, 'utf8');
    for (const m of code.matchAll(/\/realgameimages\/([A-Za-z0-9_.-]+)/g)) {
      found.add(m[1]);
    }
  }
  return [...found];
}

async function build(file) {
  const src = path.join(SRC_DIR, file);
  if (!fs.existsSync(src)) {
    console.warn(`  ! missing source: ${file}`);
    return null;
  }
  const out = path.join(OUT_DIR, file);
  const info = await sharp(src)
    .resize({ width: MAX_W, withoutEnlargement: true })
    .jpeg({ quality: QUALITY, mozjpeg: true, chromaSubsampling: CHROMA })
    .toFile(out);

  return {
    file,
    bytesBefore: fs.statSync(src).size,
    bytesAfter: info.size,
    w: info.width,
    h: info.height,
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const wanted = referencedFiles();
  console.log(
    `Intelligence annex → ${path.relative(process.cwd(), OUT_DIR)}` +
      `   (${wanted.length} referenced)\n`
  );

  let before = 0;
  let after = 0;
  const kb = (n) => `${(n / 1024).toFixed(0)}KB`;

  for (const file of wanted) {
    const r = await build(file);
    if (!r) continue;
    before += r.bytesBefore;
    after += r.bytesAfter;
    console.log(
      `  ${String(r.w).padStart(4)}x${String(r.h).padEnd(4)}` +
        `  ${kb(r.bytesBefore).padStart(8)} → ${kb(r.bytesAfter).padStart(6)}` +
        `   ${r.file}`
    );
  }

  // Anything in the output directory that nothing references is dead weight
  // being deployed. Say so loudly rather than removing it silently.
  const stale = fs
    .readdirSync(OUT_DIR)
    .filter((f) => !wanted.includes(f) && !f.startsWith('.'));
  if (stale.length) {
    console.log(`\n  unreferenced in ${path.relative(process.cwd(), OUT_DIR)}:`);
    for (const f of stale) console.log(`    ${f}  — safe to delete`);
  }

  const unused = fs
    .readdirSync(SRC_DIR)
    .filter((f) => /\.(jpe?g|png)$/i.test(f) && !wanted.includes(f));
  if (unused.length) {
    console.log(`\n  held in ${path.relative(process.cwd(), SRC_DIR)}, not shipped:`);
    for (const f of unused) console.log(`    ${f}`);
  }

  const mb = (n) => `${(n / 1048576).toFixed(1)}MB`;
  console.log(
    `\n  total ${mb(before)} → ${mb(after)}   capped at ${MAX_W}px, q${QUALITY} ${CHROMA}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
