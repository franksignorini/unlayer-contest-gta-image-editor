/**
 * Where a target actually is, shown rather than named.
 *
 * The forensic rail and the identification strip both label targets by a
 * six-character code — ASSOC, MARK, SIGN — and a code is not a location. The
 * regions are declared in `missions.ts` as pixel boxes and were disclosed
 * nowhere in the terminal: `AnalysisSequence` draws them, but that runs *after*
 * submission, so a first playthrough forfeited every target the player could
 * not find by eye. In VC-004 that is 36% of the identification budget sitting
 * on a second face at the frame edge and a tattoo in a raised inner arm.
 *
 * `EnhancePanel` already reached this conclusion for the analysis pass — its
 * inset `Locator` exists because "a hard magnification is disorienting". The
 * same is true while the player is still holding the brush, and there it is
 * worse, because they can still act on it.
 *
 * Two halves, both needed:
 *
 *   RegionCrop  — *what* it is. A magnified window onto the untouched exhibit.
 *   ExhibitMap  — *where* it is. The whole frame with the box drawn on it.
 *
 * Neither ever renders over the editor canvas. Both read the original exhibit,
 * not the working image, so they keep answering "what were they looking at"
 * even once the player has scrubbed that part of the picture away.
 */

import type { EvidenceTarget, PixelRect } from "@/types";

type ImageSize = { width: number; height: number };

/**
 * Slide the magnified plane so the region sits centred, without ever exposing
 * past the edge of the exhibit — a target near the frame border pulls its
 * context inward instead of opening a void.
 */
function planeOffset(windowSize: number, planeSize: number, centre: number) {
  if (planeSize <= windowSize) return (windowSize - planeSize) / 2;
  return Math.min(0, Math.max(windowSize - planeSize, windowSize / 2 - centre));
}

export function RegionCrop({
  image,
  imageSize,
  region,
  size,
  /**
   * Fraction of the window the region itself should occupy. Below ~0.5 the
   * surroundings are what identify the crop ("that is the far man's arm");
   * above it the region's own detail is. Small chips want context, the
   * manifest wants detail.
   */
  fill = 0.55,
  className = "",
}: {
  image: string;
  imageSize: ImageSize;
  region: PixelRect;
  /** Edge of the square window, in CSS pixels. */
  size: number;
  fill?: number;
  className?: string;
}) {
  const span = Math.max(region.w, region.h) || 1;
  const scale = (size * fill) / span;
  const planeW = imageSize.width * scale;
  const planeH = imageSize.height * scale;

  const left = planeOffset(size, planeW, (region.x + region.w / 2) * scale);
  const top = planeOffset(size, planeH, (region.y + region.h / 2) * scale);

  return (
    <div
      className={`relative shrink-0 overflow-hidden border border-line bg-void ${className}`}
      style={{ width: size, height: size }}
    >
      <div
        className="absolute"
        style={{ width: planeW, height: planeH, left, top }}
      >
        {/* Deliberately a plain img, not next/image: the editor has already
            loaded these exact bytes to mount the exhibit, so reusing the raw
            URL is a cache hit. An optimised variant would be a second fetch
            and a second decode of a picture already in memory. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt=""
          className="absolute inset-0 max-w-none"
          style={{ width: planeW, height: planeH }}
          draggable={false}
        />
        <div
          className="absolute border border-cyan/85 shadow-[0_0_0_1px_rgba(0,0,0,0.55)]"
          style={{
            left: region.x * scale,
            top: region.y * scale,
            width: region.w * scale,
            height: region.h * scale,
          }}
        />
      </div>
    </div>
  );
}

export function ExhibitMap({
  image,
  imageSize,
  targets,
  activeId = null,
  className = "",
}: {
  image: string;
  imageSize: ImageSize;
  targets: EvidenceTarget[];
  /** Lifts one box out of the set. Everything else drops back. */
  activeId?: string | null;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden border border-line bg-void ${className}`}
      style={{ aspectRatio: `${imageSize.width} / ${imageSize.height}` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-60"
        draggable={false}
      />
      {targets.map((t) => {
        const active = activeId === t.id;
        return (
          <div
            key={t.id}
            // Slow, because this tracks a hover that the player is sweeping
            // down a list — boxes that snap on and off read as flicker.
            className={`absolute border transition-all duration-300 ${
              active
                ? "border-cyan bg-cyan/25 shadow-[0_0_10px_-1px_var(--color-cyan)]"
                : activeId
                  ? "border-line/60"
                  : "border-danger/70 bg-danger/10"
            }`}
            style={{
              left: `${(t.region.x / imageSize.width) * 100}%`,
              top: `${(t.region.y / imageSize.height) * 100}%`,
              width: `${(t.region.w / imageSize.width) * 100}%`,
              height: `${(t.region.h / imageSize.height) * 100}%`,
            }}
          >
            {/* Only the lifted box is lettered. Regions overlap — VC-004's
                MARK sits inside the arm of its ASSOC — so labelling all of
                them at 220px wide stacks codes on top of each other. */}
            {active && (
              <span className="u-label absolute -top-[1px] left-0 -translate-y-full bg-cyan px-1 text-[7.5px] leading-[1.5] text-void">
                {t.short}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
