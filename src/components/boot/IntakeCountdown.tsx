"use client";

/**
 * The intake opens whether or not the operator is ready.
 *
 * This exists because a cold open is a dead end for anyone who does not
 * realise it is waiting for them — a judge who lands here, reads, and then
 * sits looking at a static screen never sees the game at all. So the screen
 * starts itself.
 *
 * It is not a usability crutch bolted onto the fiction, it *is* the fiction:
 * the boot log two panels away already says the analysis is queued and cannot
 * be cancelled. A case file that opens on its own is the premise made literal —
 * the clock was running before the player arrived.
 *
 * Three rules keep it from being hostile:
 *
 *  - it is always visible, with a countdown and a draining bar, so nothing
 *    happens that the player was not told was about to happen;
 *  - interaction buys time back. Anyone reading, scrolling, or reaching for the
 *    audio switch is engaged and must not be yanked mid-sentence. Only inaction
 *    advances the screen;
 *  - it only counts while the page can be seen. A judge who opened the game in
 *    a background tab came back to the case index, having missed the screen
 *    this whole countdown exists to show them — so hidden time is not counted,
 *    and returning to the tab is treated as the interaction it is.
 *
 * Advancing costs the player nothing: the next screen is the case briefing,
 * which has no timer of its own — the deadline does not start until they open a
 * case. If that ever stops being true, this has to be reconsidered.
 */

import { useEffect, useRef, useState } from "react";
import { formatClock } from "@/components/ui/primitives";

/** How long the cold open waits before opening the case file itself. */
const AUTO_START_MS = 20_000;

/** Interaction guarantees at least this much time remains. */
const GRACE_MS = 8_000;

/** Below this the countdown turns hot, so the last seconds are not a surprise. */
const URGENT_S = 5;

export function IntakeCountdown({ onFire }: { onFire(): void }) {
  const [remaining, setRemaining] = useState(AUTO_START_MS);
  // Wall-clock rather than an accumulated tick count: a throttled background
  // tab must not be able to stall the countdown indefinitely. Set inside the
  // effect, not in the ref initialiser — reading the clock during render is
  // impure, and it would also start counting before the screen was painted.
  const deadline = useRef<number | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    deadline.current ??= Date.now() + AUTO_START_MS;

    const nudge = () => {
      deadline.current = Math.max(
        deadline.current ?? 0,
        Date.now() + GRACE_MS
      );
    };
    window.addEventListener("pointerdown", nudge);
    window.addEventListener("keydown", nudge);
    window.addEventListener("wheel", nudge, { passive: true });

    // Coming back to the tab is a return to the screen, not a reason to fire:
    // it gets the same grace as any other sign of life. Background timers are
    // throttled to a tick a minute after a while, so the per-tick pause below
    // cannot be relied on to have covered the whole absence on its own.
    const onVisibility = () => {
      if (document.visibilityState === "visible") nudge();
    };
    document.addEventListener("visibilitychange", onVisibility);

    let lastTick = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      if (document.visibilityState === "hidden") {
        // Nobody is watching: the intake waits for them.
        deadline.current = (deadline.current ?? now) + (now - lastTick);
        lastTick = now;
        return;
      }
      lastTick = now;
      const left = (deadline.current ?? 0) - now;
      setRemaining(Math.max(0, left));
      if (left <= 0 && !fired.current) {
        fired.current = true;
        onFire();
      }
    }, 100);

    return () => {
      clearInterval(id);
      window.removeEventListener("pointerdown", nudge);
      window.removeEventListener("keydown", nudge);
      window.removeEventListener("wheel", nudge);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [onFire]);

  const seconds = remaining / 1000;
  const urgent = seconds <= URGENT_S;
  const left = Math.max(0, Math.min(1, remaining / AUTO_START_MS));

  return (
    <div className="min-w-[124px]">
      <div
        className={`u-label text-[9px] ${urgent ? "text-danger" : "text-amber"}`}
        role="timer"
        aria-live="off"
        aria-label={`Case file opens automatically in ${Math.ceil(seconds)} seconds`}
      >
        INTAKE OPENS IN{" "}
        <span className="font-mono tabular-nums">{formatClock(seconds)}</span>
      </div>
      {/* Scaled rather than resized — a bar updating ten times a second must
          never touch layout. */}
      <div className="mt-1.5 h-[2px] overflow-hidden bg-line" aria-hidden="true">
        <div
          className={`h-full origin-left ${urgent ? "bg-danger" : "bg-amber"}`}
          style={{ transform: `scaleX(${left})` }}
        />
      </div>
    </div>
  );
}
