"use client";

/**
 * The verdict, as a title card, before it is a report.
 *
 * The run used to end on a staged pipeline and then cut straight to a panel of
 * gauges — which is a good report and a flat ending. The cold open already
 * taught the player what this game sounds like when it means something: black
 * field, big white words, a flash. The verdict is the other bookend of that
 * sequence, so it speaks the same language for two and a half seconds before
 * the paperwork arrives.
 *
 * The player's own filed exhibit sits behind the words, graded down the way
 * the intro plates are. It is the thing being judged, so it is the thing on
 * screen while the judgement lands.
 *
 * Anything skips it, same as the intro. The report mounts only after it clears,
 * so the count-ups and the notes play where they can be seen rather than
 * finishing underneath a black screen.
 */

import { useCallback, useEffect, useState } from "react";
import type { ForensicResult, Outcome, Submission } from "@/types";
import { WantedStars, prefersReducedMotion } from "@/components/ui/primitives";
import { wantedLabel } from "@/lib/forensics/score";
import { operatorRating } from "@/lib/game/rating";

interface CardCopy {
  lines: [string, string];
  sub: string;
  stamp: string;
  /** Accent for the flash, the stamp and the sub emphasis. */
  tone: "clear" | "amber" | "magenta" | "danger";
}

function copyFor(outcome: Outcome, delta: number): CardCopy {
  const stars = delta > 0 ? `+${delta} WANTED LEVEL` : "WANTED LEVEL UNCHANGED";
  switch (outcome) {
    case "ACCEPTED":
      return {
        lines: ["CASE", "CLOSED."],
        sub: `NO ACTIONABLE EVIDENCE · ${stars}`,
        stamp: "NO FURTHER ACTION",
        tone: "clear",
      };
    case "INSUFFICIENT":
      return {
        lines: ["NOT ENOUGH", "TO HOLD YOU."],
        sub: `CASE SUSPENDED · ${stars}`,
        stamp: "SUSPENDED",
        tone: "amber",
      };
    case "TAMPERING":
      return {
        lines: ["THEY KNOW", "IT WAS DOCTORED."],
        sub: `EVIDENCE TAMPERING DETECTED · ${stars}`,
        stamp: "ESCALATED",
        tone: "magenta",
      };
    case "IDENTIFIED":
      return {
        lines: ["YOU'VE BEEN", "IDENTIFIED."],
        sub: `MATCH CONFIRMED · WARRANT REQUESTED · ${stars}`,
        stamp: "WANTED",
        tone: "danger",
      };
  }
}

const TONE_TEXT = {
  clear: "text-clear",
  amber: "text-amber",
  magenta: "text-magenta",
  danger: "text-danger",
} as const;

const TONE_FLASH = {
  clear: "bg-clear/40",
  amber: "bg-amber/40",
  magenta: "bg-magenta/55",
  danger: "bg-danger/70",
} as const;

/**
 * On screen, including the exit beat. Long enough to read, short enough to
 * wait for — and long enough for the grade, the last thing to land, to be
 * seen standing still rather than caught mid-slam on the way out.
 */
const CARD_MS = 3100;
const EXIT_MS = 260;

export function OutcomeCard({
  result,
  submission,
  wantedLevel,
  onDone,
}: {
  result: ForensicResult;
  submission: Submission;
  wantedLevel: number;
  onDone(): void;
}) {
  const copy = copyFor(result.outcome, result.wantedDelta);
  const rating = operatorRating(result.outcome, result.integrity);
  const [leaving, setLeaving] = useState(false);
  const [reduce] = useState(prefersReducedMotion);

  const finish = useCallback(() => {
    setLeaving(true);
    setTimeout(onDone, reduce ? 0 : EXIT_MS);
  }, [onDone, reduce]);

  useEffect(() => {
    const out = setTimeout(finish, CARD_MS - EXIT_MS);
    const skip = () => finish();
    // Deferred a beat so the click that submitted the analysis skip, or a key
    // still held from the terminal, does not dismiss the card as it mounts.
    const arm = setTimeout(() => {
      window.addEventListener("keydown", skip);
      window.addEventListener("pointerdown", skip);
    }, 350);
    return () => {
      clearTimeout(out);
      clearTimeout(arm);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, [finish]);

  const identified = result.outcome === "IDENTIFIED";

  return (
    <main
      className={`fixed inset-0 z-50 flex cursor-pointer select-none items-center justify-center overflow-hidden bg-black ${
        identified ? "outcome-strobe" : ""
      }`}
      aria-live="assertive"
      aria-label={`Verdict: ${copy.lines.join(" ")}`}
    >
      {/* The exhibit as filed, behind the words. A data URL, so a plain img. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={submission.dataUrl}
        alt=""
        aria-hidden="true"
        className="outcome-plate pointer-events-none absolute inset-0 size-full object-cover"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.82)_75%)]" />
      <div className="u-scanlines pointer-events-none absolute inset-0" />
      <div
        className={`intro-flash pointer-events-none absolute inset-0 z-10 ${TONE_FLASH[copy.tone]}`}
      />

      <div
        className={`relative z-20 px-6 text-center ${leaving ? "intro-out" : ""}`}
      >
        {submission.trigger === "timeout" && (
          <p className="intro-sub u-label mb-5 text-[10px] text-danger">
            TIME EXPIRED — INTAKE PULLED THE EXHIBIT
          </p>
        )}

        {copy.lines.map((line, lineIndex) => (
          <div
            key={line}
            className={`u-display flex flex-wrap justify-center gap-x-[0.26em] text-[clamp(2.6rem,9vw,7.5rem)] leading-[0.9] ${
              lineIndex === 1 ? `${TONE_TEXT[copy.tone]} intro-aberration` : "text-white"
            }`}
          >
            {line.split(" ").map((word, i) => (
              <span
                key={`${word}-${i}`}
                className="intro-word"
                style={{
                  animationDelay: reduce ? "0ms" : `${lineIndex * 380 + i * 60}ms`,
                }}
              >
                {word}
              </span>
            ))}
          </div>
        ))}

        <p className="intro-sub u-label mx-auto mt-6 max-w-[80ch] text-[clamp(9px,1.4vw,12px)] text-white/60">
          {copy.sub}
        </p>

        <div
          className="intro-sub mt-6 flex flex-col items-center gap-2"
          style={{ animationDelay: "0.75s" }}
        >
          <WantedStars level={wantedLevel} size={26} />
          <span
            className={`u-label text-[10px] ${
              result.wantedDelta > 0 ? "text-amber" : "text-white/40"
            }`}
          >
            {wantedLabel(wantedLevel)}
          </span>
        </div>

        <div className="mt-8 flex items-center justify-center gap-7">
          <div
            className={`outcome-slam inline-block ${TONE_TEXT[copy.tone]}`}
            style={{ animationDelay: reduce ? "0ms" : "1.05s" }}
          >
            <span className="u-stamp inline-block -rotate-6 text-[clamp(13px,1.8vw,18px)]">
              {copy.stamp}
            </span>
          </div>

          {/* The grade is the rank screen every game has trained the player
              to wait for. It used to arrive two screens later, on the
              dossier, after the moment had passed; it lands here last, a
              beat after the stamp, as the answer to "was that good?". */}
          <div
            className="outcome-slam flex items-center gap-3 text-left"
            style={{ animationDelay: reduce ? "0ms" : "1.45s" }}
          >
            <span
              className={`u-display grid size-[clamp(46px,5.4vw,64px)] place-items-center border-2 text-[clamp(32px,3.9vw,46px)] leading-none ${
                TONE_TEXT[rating.tone]
              }`}
            >
              {rating.grade}
            </span>
            <span>
              <span className="u-label block text-[9px] text-white/45">
                OPERATOR RATING
              </span>
              <span
                className={`u-display block text-[clamp(15px,1.7vw,20px)] leading-tight ${
                  TONE_TEXT[rating.tone]
                }`}
              >
                {rating.title}
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/10">
        <div
          className="outcome-progress h-full bg-white/50"
          style={{ animationDuration: `${CARD_MS}ms` }}
        />
      </div>
      <span className="u-label absolute right-5 bottom-5 z-20 text-[9px] text-white/30">
        ANY KEY · REPORT
      </span>
    </main>
  );
}
