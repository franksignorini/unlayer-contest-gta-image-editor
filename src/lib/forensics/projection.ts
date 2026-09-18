/**
 * DEFOCUS, modelled — what the SCRUB panel's slider will do once it lands.
 *
 * The editor keeps a filter preview out of `getImage()` for as long as the
 * canvas holds no overlay objects: the export is its cached base image, and the
 * blur the player is looking at lives only on the fabric image being drawn. So
 * on a clean exhibit — which is where every player starts, and exactly the move
 * the terminal tells them to make first — the rail had nothing to read until
 * the panel closed. The one verb the game is built on was the one with no live
 * feedback.
 *
 * This reproduces that preview on a canvas of our own so it can be scored
 * before it commits. It is not a guess: the radius mapping is the one
 * /forensics-check is calibrated on, fitted against the running editor with
 * `__fitBlur`, and pushed through the real analyser it agrees with the real
 * filter on every case. Measured on editor 2.9.0 with /forensics-editor, real
 * vs modelled (identification / integrity):
 *
 *   VC-001  DEFOCUS 10  36.4 / 97.0   vs 35.8 / 96.9
 *           DEFOCUS 25  15.9 / 85.2   vs 15.5 / 84.4
 *           DEFOCUS 45  11.2 / 67.7   vs 10.9 / 67.3
 *           DEFOCUS 70   9.6 / 56.4   vs  9.5 / 55.9   both just over the floor
 *   VC-005  DEFOCUS 40  20.1 / 72.3   vs 20.0 / 71.7
 *           DEFOCUS 60  14.6 / 58.2   vs 14.3 / 57.5
 *
 * Re-measure after any editor release, the same as the rest of the contract.
 *
 * Only DEFOCUS is modelled. MOSAIC was measured too and it does not hold up at
 * low settings — the editor's pixelate samples rather than averages, and at 10
 * it scored 58/53 IDENTIFIED where the model said 49/86 INSUFFICIENT — so any
 * other control in play means no projection at all rather than a wrong one.
 */

import type { Drawable } from "./image";
import { drawableSize } from "./image";

/**
 * Blur radius per unit of the DEFOCUS slider, as a fraction of image width.
 *
 * Fabric's Blur is a texture-space delta, so its strength scales with the image
 * rather than being a fixed pixel radius — roughly 0.42px per slider unit on a
 * 1440px exhibit. Expressed against width so a cropped or reframed exhibit is
 * modelled the way the editor would blur it.
 */
const RADIUS_PER_UNIT = 2.92e-4;

/** The canvas blur radius the editor's DEFOCUS slider corresponds to. */
export function defocusRadius(width: number, slider: number): number {
  return width * RADIUS_PER_UNIT * slider;
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable for the DEFOCUS model");
  return ctx;
}

/**
 * `base` as it will look with DEFOCUS at `slider` applied, at full resolution.
 *
 * The edges are clamped before blurring, and that is not a nicety. A canvas
 * `blur()` samples transparent pixels beyond the frame, so a plain blur fades
 * every border towards black — and the analyser reads that as an exposure
 * shift the editor's own filter never makes. Measured against the running
 * editor on VC-005, the 1000px exhibit where the border is the largest share of
 * the frame: DEFOCUS 60 really files at integrity 58.2, ACCEPTED; blurred
 * plain, the model said 52.2 — TAMPERING, under the floor. With the frame
 * extended by its own edge pixels first it reads 57.5.
 *
 * A regular canvas rather than an OffscreenCanvas: the filter property is what
 * does the work, and it is the one piece of 2D canvas support that has lagged
 * on the offscreen variant.
 */
export function renderDefocus(base: Drawable, slider: number): HTMLCanvasElement {
  const { width: w, height: h } = drawableSize(base);
  const radius = defocusRadius(w, slider);
  // Three standard deviations covers everything the kernel can reach.
  const g = Math.ceil(radius * 3) + 2;

  const padded = document.createElement("canvas");
  padded.width = w + 2 * g;
  padded.height = h + 2 * g;
  const p = context(padded);
  p.drawImage(base, g, g);
  // Clamp to edge: each border row and column stretched out across the gutter,
  // then the corner pixels into the corners.
  p.drawImage(base, 0, 0, 1, h, 0, g, g, h);
  p.drawImage(base, w - 1, 0, 1, h, g + w, g, g, h);
  p.drawImage(base, 0, 0, w, 1, g, 0, w, g);
  p.drawImage(base, 0, h - 1, w, 1, g, g + h, w, g);
  p.drawImage(base, 0, 0, 1, 1, 0, 0, g, g);
  p.drawImage(base, w - 1, 0, 1, 1, g + w, 0, g, g);
  p.drawImage(base, 0, h - 1, 1, 1, 0, g + h, g, g);
  p.drawImage(base, w - 1, h - 1, 1, 1, g + w, g + h, g, g);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = context(canvas);
  ctx.filter = `blur(${radius}px)`;
  ctx.drawImage(padded, -g, -g);
  // Handed back clean. A caller that draws on top — the harness lays a bar
  // over the blur — would otherwise draw through the blur too, and a softened
  // bar scored 0% hard edges where the editor's own scores 25%.
  ctx.filter = "none";
  return canvas;
}
