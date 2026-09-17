"use client";

/**
 * Facial recognition, shown as a comparison rather than reported as a line.
 *
 * The department's reference photograph used to pop into the pipeline column
 * for under a second and vanish, shoving the stage list down and back up as it
 * went. It belongs next to the exhibit it is being compared with: that pairing
 * is the whole threat the annex was built to make — the clean, high-fidelity
 * booking material against the grainy thing the player filed.
 *
 * So it docks on the exhibit for the length of the recognition stage, and the
 * match figure searches its way to the real one. The figure it lands on is the
 * same `legibility` the pipeline line beside it prints, and the verdict chip
 * uses the same bands, so the two can never disagree. Everything before the
 * landing — the flicker, the record count — is presentation, and reads as it.
 *
 * Driven by the stage's `progress`, not a clock of its own, so skipping the
 * analysis lands it on its final frame rather than cutting it off mid-search.
 */

import Image from "next/image";
import type { CaseReference } from "@/types";
import { ScanSweep } from "@/components/ui/primitives";

/** Where in the stage the search stops moving and the result holds. */
const LOCK_AT = 0.72;

export function ReferenceMatch({
  reference,
  match,
  progress,
}: {
  reference: CaseReference;
  /** Best legibility across the subject regions, 0..100. */
  match: number;
  /** The recognition stage's progress, 0..1. */
  progress: number;
}) {
  const locked = progress >= LOCK_AT;
  const t = Math.min(1, progress / LOCK_AT);
  const eased = 1 - Math.pow(1 - t, 2);
  // A search, not a count: the figure hunts around its eventual value and the
  // hunting dies away as it closes in. Seeded from progress so it is pure.
  const hunt = Math.sin(progress * 211) * 23 * (1 - eased);
  const shown = locked
    ? Math.round(match)
    : Math.max(0, Math.min(99, Math.round(match * eased + hunt + 30 * (1 - eased))));

  const verdict =
    match >= 60
      ? { text: "MATCH CONFIRMED", tone: "border-danger/70 bg-danger/15 text-danger" }
      : match >= 30
        ? { text: "PARTIAL MATCH", tone: "border-amber/60 bg-amber/10 text-amber" }
        : { text: "NO MATCH", tone: "border-clear/60 bg-clear/10 text-clear" };

  const records = Math.round(4_812 + 36_000 * eased);

  return (
    <div className="u-rise pointer-events-none absolute top-[7%] right-[2.5%] z-40 w-[44%] max-w-[360px] sm:w-[36%] border border-magenta/55 bg-void/90 shadow-[0_0_40px_-10px_var(--color-magenta)] backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-magenta/30 px-2.5 py-1.5">
        <span className="u-label text-[8.5px] text-magenta">
          FACIAL RECOGNITION
        </span>
        <span className="hidden font-mono text-[8px] text-ghost sm:inline">
          {reference.code}
        </span>
      </div>

      <div className="relative aspect-video overflow-hidden">
        <Image
          src={reference.src}
          alt={reference.caption}
          fill
          sizes="360px"
          className={`object-cover transition-[filter] duration-500 ${
            locked && match < 30 ? "grayscale" : ""
          }`}
        />
        <div className="u-scanlines absolute inset-0 opacity-70" />
        <ScanSweep tone="magenta" active={!locked} />
        {locked && (
          <div
            className={`outcome-slam absolute bottom-2 left-2 border px-2 py-0.5 ${verdict.tone}`}
          >
            <span className="u-label text-[9px]">{verdict.text}</span>
          </div>
        )}
      </div>

      <div className="flex items-end justify-between gap-3 px-2.5 py-2">
        {/* The search copy is the first thing to go on a phone: at that width
            it wrapped into four lines over the exhibit, and the figure alone
            carries the moment. */}
        <div className="hidden min-w-0 sm:block">
          <div className="u-label text-[8px] text-faint">
            {locked ? "BEST CORRESPONDENCE" : "SEARCHING RECORDS"}
          </div>
          <div className="font-mono text-[9px] text-ghost tabular-nums">
            {records.toLocaleString("en-US")} FACES COMPARED
          </div>
        </div>
        <div
          className={`ml-auto font-mono text-[22px] leading-none tabular-nums sm:text-[28px] ${
            !locked
              ? "text-bone"
              : match >= 60
                ? "text-danger"
                : match >= 30
                  ? "text-amber"
                  : "text-clear"
          }`}
        >
          {shown}
          <span className="text-[12px] text-faint">%</span>
        </div>
      </div>
    </div>
  );
}
