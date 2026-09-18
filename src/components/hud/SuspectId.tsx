"use client";

/**
 * IDENTIFIED BY — the identification strip.
 *
 * The rail already reports every target precisely, with percentages and case
 * weights. This is the opposite kind of readout: one glance, no numbers, sat
 * directly above the exhibit where the player's eyes already are. While you are
 * working a blur into a face you should not have to look away to find out
 * whether it landed — the chip for that face simply goes out.
 *
 * The framing is deliberate. Vice City PD does not hold "a photograph", it
 * holds a set of separable identifiers — a face, a plate, a vehicle, a mark —
 * and each one is independently enough to place you. Rendering them as discrete
 * things that can be extinguished one at a time is what makes the strategy
 * legible: you are not improving a picture, you are putting out lights.
 *
 * Each chip carries a magnified crop of its own region, because the code alone
 * does not locate anything. ASSOC and MARK were codes for "the second man's
 * head" and "the tattoo inside his raised arm", and a player who cannot find
 * those two loses a third of VC-004 without ever knowing there was something to
 * do. The crop is of the *original* exhibit, so it keeps answering "what were
 * they looking at" after the player has scrubbed that part of the picture out.
 *
 * Never rendered over the editor canvas — it sits above it. The canvas has to
 * stay pixel-true and clickable.
 */

import { useEffect, useRef, useState } from "react";
import type { ForensicResult, Mission } from "@/types";
import { audio } from "@/lib/audio/engine";
import { RegionCrop } from "./RegionLocator";

/** Legibility at or above this and they can still work with it. */
const LIVE_AT = 60;
/** Below this the identifier is effectively gone. */
const CLEAR_UNDER = 30;

type ChipState = "live" | "partial" | "clear" | "gone";

const STATE_LABEL: Record<ChipState, string> = {
  live: "LIVE",
  partial: "PARTIAL",
  clear: "CLEAR",
  gone: "OUT OF FRAME",
};

/**
 * Colour carries the meaning here, so it has to invert the usual reading: a
 * *lit* chip is bad news for the player. Red means they can still identify you.
 *
 * `crop` drains with the chip for the same reason — an identifier the police
 * can no longer use should stop looking like a photograph of you.
 */
const STATE_STYLE: Record<
  ChipState,
  { edge: string; text: string; crop: string }
> = {
  live: {
    edge: "border-danger/70 bg-danger/10",
    text: "text-danger",
    crop: "opacity-100",
  },
  partial: {
    edge: "border-amber/60 bg-amber/8",
    text: "text-amber",
    crop: "opacity-85 saturate-50",
  },
  clear: {
    edge: "border-clear/40 bg-clear/5",
    text: "text-clear/80",
    crop: "opacity-45 grayscale",
  },
  gone: {
    edge: "border-line bg-panel/60",
    text: "text-faint",
    crop: "opacity-20 grayscale",
  },
};

function stateFor(legibility: number, croppedOut: boolean): ChipState {
  if (croppedOut) return "gone";
  if (legibility >= LIVE_AT) return "live";
  if (legibility >= CLEAR_UNDER) return "partial";
  return "clear";
}

export function SuspectId({
  mission,
  live,
  projected = false,
}: {
  mission: Mission;
  live: ForensicResult | null;
  /**
   * `live` is a modelled SCRUB preview. The chips go out on it all the same —
   * watching them go dark as the slider is released is the whole reason the
   * projection exists — but the label says it is the preview talking.
   */
  projected?: boolean;
}) {
  // Before the first analysis lands the exhibit really is untouched, so every
  // identifier is live. Showing zeros here would be a lie in the player's
  // favour, which is the worst direction to be wrong in.
  const chips = mission.targets.map((target) => {
    const finding = live?.findings.find((f) => f.targetId === target.id);
    const legibility = finding?.legibility ?? 100;
    return {
      target,
      legibility,
      state: stateFor(legibility, finding?.croppedOut ?? false),
    };
  });

  const remaining = chips.filter((ch) => ch.state === "live").length;

  // Putting a light out is the single most satisfying thing in the loop, and
  // it used to happen in total silence — the chip crossfaded over half a second
  // and that was all. The player is looking at the canvas when it lands, not at
  // the strip, so the beat has to reach them without their eyes.
  const extinguished = useExtinguished(chips);

  return (
    <div className="flex shrink-0 items-stretch gap-2 border border-line bg-panel/70 px-2.5 py-2">
      <div className="flex shrink-0 flex-col justify-center pr-1">
        <span
          className={`u-label text-[8.5px] whitespace-nowrap ${
            projected ? "text-cyan" : "text-faint"
          }`}
        >
          {projected ? "IF APPLIED" : "IDENTIFIED BY"}
        </span>
        <span
          className={`u-label text-[10px] whitespace-nowrap transition-colors duration-500 ${
            remaining === 0 ? "text-clear" : "text-danger"
          }`}
        >
          {remaining === 0 ? "NOTHING" : `${remaining} OF ${chips.length}`}
        </span>
      </div>

      <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {chips.map(({ target, legibility, state }) => {
          const style = STATE_STYLE[state];
          return (
            <li
              key={target.id}
              // The transition is what sells it: an identifier does not blink
              // off, it fades out as the blur takes hold.
              // Narrower chips until xl, so a five-target case still fits on
              // one row at lg. Wrapped to two rows at 1024x768 the strip took
              // 50px from the editor, and the tool rail lost EDGE off its foot
              // with nothing on screen to say it was there.
              className={`flex min-w-[84px] flex-1 items-center gap-1.5 border px-1.5 py-1 transition-colors duration-500 xl:min-w-[118px] xl:gap-2 ${style.edge} ${
                extinguished.has(target.id) ? "u-extinguish" : ""
              }`}
              // The full name, for a pointer that pauses on a code it does not
              // recognise. The rail's manifest is the unhurried version.
              title={`${target.label} — ${STATE_LABEL[state]}`}
              aria-label={`${target.label}: ${STATE_LABEL[state]}`}
            >
              <RegionCrop
                image={mission.image}
                imageSize={mission.imageSize}
                region={target.region}
                size={30}
                // Wide, because at 30px the surroundings identify the crop far
                // better than its own pixels do: an arm reads as an arm, a
                // 14px tattoo reads as noise.
                fill={0.5}
                className={`transition-all duration-500 ${style.crop}`}
              />
              <span className="min-w-0 flex-1">
                <span className="u-label block truncate text-[9px] text-bone">
                  {target.short}
                </span>
                <span
                  className={`u-label block text-[7.5px] transition-colors duration-500 ${style.text}`}
                >
                  {STATE_LABEL[state]}
                </span>
              </span>
              {/* A sliver of the actual number, for anyone who wants it without
                  looking across at the rail. */}
              {/* Dropped below xl — the rail beside it prints the same figure,
                  and the chip's name is the part that has to stay legible. */}
              <span
                className={`hidden shrink-0 font-mono text-[9px] tabular-nums transition-colors duration-500 xl:inline ${style.text}`}
              >
                {state === "gone" ? "—" : Math.round(legibility)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Which identifiers just went out, and the sound of it.
 *
 * Fires on the CROSSING, not on the state — a chip that has been dark for a
 * minute is not news. `clear` is the cue the pixel-recovery pass uses when a
 * region comes back with nothing recoverable, which is exactly what has
 * happened here, only in the player's favour. The last light out gets a second
 * one a beat later, so "they have nothing" sounds different from "they have one
 * less thing".
 *
 * Deliberately one-directional. An identifier coming BACK — an undo, a filter
 * discarded — is not announced: the strip already shows it, and a cue for it
 * would fire on every step backwards through an undo stack.
 *
 * Everything the effect needs is encoded in a signature string, and the
 * signature is its only dependency. Depending on the chips array instead made
 * the effect re-run immediately after its own `setFlashing`, and its cleanup
 * cancelled the timer that was supposed to end the pulse — so the flash latched
 * on and stayed. The signature changes only when a chip actually does.
 */
function useExtinguished(
  chips: { target: { id: string }; state: ChipState }[]
): ReadonlySet<string> {
  const signature = chips.map((c) => `${c.target.id}:${c.state}`).join("|");
  const previous = useRef<string | null>(null);
  const [flashing, setFlashing] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const before = previous.current;
    previous.current = signature;

    // The first pass establishes the baseline. Without it, a case whose chips
    // arrive already dark would announce every one of them on mount.
    if (before === null) return;

    const states = (sig: string) =>
      new Map(
        sig
          .split("|")
          .filter(Boolean)
          .map((pair) => {
            const cut = pair.lastIndexOf(":");
            return [pair.slice(0, cut), pair.slice(cut + 1)] as const;
          })
      );

    const was = states(before);
    const now = states(signature);
    const justOut = [...now]
      .filter(([id, state]) => was.get(id) === "live" && state !== "live")
      .map(([id]) => id);
    if (!justOut.length) return;

    audio.cue("clear");
    setFlashing(new Set(justOut));

    // The last one is worth its own beat — that is the run won.
    const nothingLeft = ![...now.values()].includes("live");
    const finale = nothingLeft
      ? setTimeout(() => audio.cue("clear"), 300)
      : undefined;
    const reset = setTimeout(() => setFlashing(new Set()), 900);
    return () => {
      if (finale) clearTimeout(finale);
      clearTimeout(reset);
    };
  }, [signature]);

  return flashing;
}
