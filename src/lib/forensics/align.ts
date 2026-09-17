/**
 * Crop / resize recovery.
 *
 * The editor gives us a finished PNG, not an edit history. If the player crops,
 * every evidence box we hold is suddenly in the wrong coordinate system — so
 * before scoring anything we work out which rectangle of the ORIGINAL survives
 * in the submission.
 *
 * Strategy: coarse search over scale and offset scored by zero-mean normalised
 * correlation (so a simultaneous regrade doesn't defeat it), then a local
 * refinement pass. Cheap enough for the live poll, and it degrades gracefully —
 * a poor match reports high `error`, and the caller can fall back to a stretch.
 */

import type { FrameTransform, PixelRect } from "@/types";
import { type Gray, normalizedCorrelation, samplePatch, clamp01 } from "./image";

/** Correlation grid resolution. 24x24 is plenty to localise a crop. */
const GRID = 24;
/** Scale candidates: fraction of the original width the crop covers. */
const COARSE_SCALES = 13;
const MIN_SCALE = 0.34;
/** Offset candidates per axis in the coarse pass. */
const COARSE_OFFSETS = 11;

interface Candidate {
  crop: PixelRect;
  score: number;
}

function scoreCandidate(
  origGray: Gray,
  editPatch: Gray,
  crop: PixelRect
): number {
  const patch = samplePatch(origGray, crop, GRID);
  return normalizedCorrelation(patch, editPatch);
}

/**
 * Recover the region of the original that the submission represents.
 *
 * `origSize` / `editSize` are the true pixel dimensions; the Gray buffers are
 * working-resolution, so the returned crop is expressed in ORIGINAL pixel space.
 */
export function estimateTransform(
  origGray: Gray,
  editGray: Gray,
  origSize: { width: number; height: number },
  editSize: { width: number; height: number }
): FrameTransform {
  const full: PixelRect = {
    x: 0,
    y: 0,
    w: origSize.width,
    h: origSize.height,
  };

  // Same dimensions: nothing was cropped or resized, so trust the identity.
  // (A resize back to the exact original size is indistinguishable from no
  // resize at all, and is scored as a quality loss rather than a reframe.)
  if (
    origSize.width === editSize.width &&
    origSize.height === editSize.height
  ) {
    return { crop: full, frameLoss: 0, estimated: false, error: 0 };
  }

  const editPatch = samplePatch(
    editGray,
    { x: 0, y: 0, w: editGray.w, h: editGray.h },
    GRID
  );
  const editAspect = editSize.width / editSize.height;

  // --- coarse pass ---------------------------------------------------
  let best: Candidate | null = null;
  for (let si = 0; si < COARSE_SCALES; si++) {
    const s = 1 - (si / (COARSE_SCALES - 1)) * (1 - MIN_SCALE);
    const cw = origSize.width * s;
    const ch = cw / editAspect;
    if (ch > origSize.height) continue;
    const maxOx = origSize.width - cw;
    const maxOy = origSize.height - ch;
    for (let oxi = 0; oxi < COARSE_OFFSETS; oxi++) {
      const ox = maxOx * (oxi / (COARSE_OFFSETS - 1));
      for (let oyi = 0; oyi < COARSE_OFFSETS; oyi++) {
        const oy = maxOy * (oyi / (COARSE_OFFSETS - 1));
        const crop = { x: ox, y: oy, w: cw, h: ch };
        const score = scoreCandidate(origGray, editPatch, cropToGray(crop, origSize, origGray));
        if (!best || score > best.score) best = { crop, score };
      }
    }
  }

  if (!best) {
    // Aspect ratio can't be produced by any crop of the original (the player
    // resized to a new shape). Treat it as a full-frame stretch.
    return { crop: full, frameLoss: 0, estimated: true, error: 1 };
  }

  // --- refinement ----------------------------------------------------
  // Walk a shrinking neighbourhood around the coarse winner.
  let current = best;
  let stepScale = (1 - MIN_SCALE) / (COARSE_SCALES - 1);
  let stepX = (origSize.width - current.crop.w) / (COARSE_OFFSETS - 1) || 1;
  let stepY = (origSize.height - current.crop.h) / (COARSE_OFFSETS - 1) || 1;

  for (let pass = 0; pass < 3; pass++) {
    stepScale *= 0.45;
    stepX = Math.max(1, stepX * 0.45);
    stepY = Math.max(1, stepY * 0.45);
    const baseScale = current.crop.w / origSize.width;
    for (const ds of [-1, 0, 1]) {
      const s = clamp01(baseScale + ds * stepScale);
      if (s <= 0.05) continue;
      const cw = origSize.width * s;
      const ch = cw / editAspect;
      if (ch > origSize.height) continue;
      for (const dx of [-1, 0, 1]) {
        for (const dy of [-1, 0, 1]) {
          const x = clampRange(current.crop.x + dx * stepX, 0, origSize.width - cw);
          const y = clampRange(current.crop.y + dy * stepY, 0, origSize.height - ch);
          const crop = { x, y, w: cw, h: ch };
          const score = scoreCandidate(
            origGray,
            editPatch,
            cropToGray(crop, origSize, origGray)
          );
          if (score > current.score) current = { crop, score };
        }
      }
    }
  }

  const cropArea = current.crop.w * current.crop.h;
  const fullArea = origSize.width * origSize.height;
  return {
    crop: current.crop,
    frameLoss: clamp01(1 - cropArea / fullArea),
    estimated: true,
    // Correlation of 1 is perfect; map to an error in 0..1.
    error: clamp01((1 - current.score) / 2),
  };
}

/** Convert a crop in original pixel space into working-resolution coordinates. */
function cropToGray(
  crop: PixelRect,
  origSize: { width: number; height: number },
  origGray: Gray
): PixelRect {
  const kx = origGray.w / origSize.width;
  const ky = origGray.h / origSize.height;
  return { x: crop.x * kx, y: crop.y * ky, w: crop.w * kx, h: crop.h * ky };
}

function clampRange(v: number, lo: number, hi: number): number {
  if (hi < lo) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Map a rectangle in original pixel space into the submitted image's own pixel
 * space, given a recovered transform. Returns null when the box fell outside
 * the surviving frame — i.e. the player cropped that evidence away.
 */
export function mapRegionIntoSubmission(
  region: PixelRect,
  transform: FrameTransform,
  editSize: { width: number; height: number }
): PixelRect | null {
  const { crop } = transform;
  const kx = editSize.width / crop.w;
  const ky = editSize.height / crop.h;
  const x = (region.x - crop.x) * kx;
  const y = (region.y - crop.y) * ky;
  const w = region.w * kx;
  const h = region.h * ky;

  // Require a meaningful part of the region to survive; a sliver on the edge is
  // not something a forensic examiner could work with.
  const visibleW = Math.min(x + w, editSize.width) - Math.max(x, 0);
  const visibleH = Math.min(y + h, editSize.height) - Math.max(y, 0);
  if (visibleW <= 0 || visibleH <= 0) return null;
  const visibleFraction = (visibleW * visibleH) / (w * h);
  if (visibleFraction < 0.35) return null;

  return { x, y, w, h };
}
