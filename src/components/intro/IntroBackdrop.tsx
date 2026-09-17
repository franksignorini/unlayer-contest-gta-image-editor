"use client";

/**
 * Case footage behind the cold open.
 *
 * Every plate is mounted for the whole sequence and only its opacity changes,
 * so a cut never waits on a decode. Which plate is showing is derived from the
 * card index rather than held in state — including whether a plate has *ever*
 * been shown, which is what keeps its drift running. If the drift class were
 * removed on fade-out the transform would snap back mid-fade, and the snap is
 * visible even at these opacities.
 */

import Image from "next/image";
import { INTRO_BACKDROPS, INTRO_SCRIPT } from "@/data/intro";

/** First card each plate appears on — its drift starts there and never stops. */
const FIRST_USE = new Map<string, number>();
INTRO_SCRIPT.forEach((card, i) => {
  if (card.backdrop && !FIRST_USE.has(card.backdrop)) {
    FIRST_USE.set(card.backdrop, i);
  }
});

export function IntroBackdrop({ cardIndex }: { cardIndex: number }) {
  const activeId = INTRO_SCRIPT[cardIndex]?.backdrop;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-black">
      {INTRO_BACKDROPS.map((plate, i) => {
        const active = plate.id === activeId;
        const started = cardIndex >= (FIRST_USE.get(plate.id) ?? Infinity);
        return (
          <div
            key={plate.id}
            className={`absolute inset-0 transition-opacity duration-[700ms] ease-out ${
              active ? "opacity-100" : "opacity-0"
            }`}
          >
            <Image
              src={plate.src}
              alt=""
              fill
              priority={i === 0}
              sizes="100vw"
              style={{ objectPosition: plate.focus }}
              className={`object-cover ${
                started ? `intro-plate--${plate.drift}` : ""
              }`}
            />
          </div>
        );
      })}

      {/*
        Darkest through the middle band, where the words sit, and lighter at the
        top and bottom edges — so the scene stays readable as a scene while the
        type never has to fight a bright sky.

        These alphas are calibrated against the levelled plate mean of 78 (see
        prepare-backdrops.mjs): they land the band near 32/255 and the edges
        near 55/255. Raising them is how the footage gets quieter; there is no
        second brightness control, deliberately, because stacking two of them
        is what drove the plates to 6/255 and made them invisible.
      */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgb(0_0_0/0.3)_0%,rgb(0_0_0/0.59)_34%,rgb(0_0_0/0.61)_58%,rgb(0_0_0/0.34)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_32%,rgb(0_0_0/0.5)_100%)]" />
      <div className="u-scanlines absolute inset-0 opacity-40" />
    </div>
  );
}
