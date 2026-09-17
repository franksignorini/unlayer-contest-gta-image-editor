"use client";

/**
 * CASE ASSESSMENT — the verdict, assembling itself.
 *
 * The pipeline beside this reports each stage as a line of text, and the
 * column under it used to be empty for the whole analysis: nine seconds in
 * which the player's fate was being decided and the screen had nowhere to show
 * it accumulating. The outcome then arrived all at once on a title card.
 *
 * This is where it accumulates. Identification is a sum — every target
 * contributes `weight × legibility`, and those shares add up to the headline
 * exactly — so it can be built in public, one stage at a time: when facial
 * recognition reports, the faces' points land on the tally; when the registry
 * reports, the plate's do. The player watches the number climb towards the
 * line and hopes it stops short. Integrity is a single figure and lands whole,
 * when the integrity stage reports it.
 *
 * Nothing here is theatre beyond the order of reveal. The shares are the real
 * findings, the leaning is `decideOutcome` applied to what has been revealed,
 * and once every stage is in, the tally IS the result — so the provisional
 * reading can only ever escalate towards the final one, never reverse out of
 * it. That monotone climb is the tension.
 */

import { useEffect, useRef, useState } from "react";
import type { EvidenceKind, ForensicResult, Mission, Outcome } from "@/types";
import { decideOutcome } from "@/lib/forensics/score";
import {
  contribution,
  contributionTone,
  identificationTone,
  IDENTIFICATION_MARKS,
  integrityTone,
  INTEGRITY_MARKS,
  shownIdentification,
  shownIntegrity,
  type Tone,
} from "@/lib/forensics/display";
import { audio } from "@/lib/audio/engine";
import { Meter, prefersReducedMotion } from "@/components/ui/primitives";

const TONE_TEXT: Record<Tone, string> = {
  clear: "text-clear",
  amber: "text-amber",
  danger: "text-danger",
};

const OUTCOME_TONE: Record<Outcome, string> = {
  ACCEPTED: "text-clear border-clear/50 bg-clear/8",
  INSUFFICIENT: "text-amber border-amber/50 bg-amber/8",
  TAMPERING: "text-magenta border-magenta/50 bg-magenta/8",
  IDENTIFIED: "text-danger border-danger/60 bg-danger/10",
};

/** How bad each outcome is for the player — the leaning only ever climbs this. */
const SEVERITY: Record<Outcome, number> = {
  ACCEPTED: 0,
  INSUFFICIENT: 1,
  TAMPERING: 2,
  IDENTIFIED: 3,
};

/** A number that glides to each new target from wherever it currently is. */
function useGlide(target: number, ms = 650) {
  const [value, setValue] = useState(0);
  const current = useRef(0);
  useEffect(() => {
    const origin = current.current;
    const start = performance.now();
    const jump = prefersReducedMotion();
    let raf = 0;
    const tick = (now: number) => {
      const t = jump ? 1 : Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = origin + (target - origin) * eased;
      current.current = v;
      setValue(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

export function CaseAssessment({
  mission,
  result,
  revealedKinds,
  integrityKnown,
  complete,
}: {
  mission: Mission;
  result: ForensicResult | null;
  /** Evidence kinds whose pipeline stage has reported. */
  revealedKinds: ReadonlySet<EvidenceKind>;
  integrityKnown: boolean;
  /** Every stage is in; the tally is now the result. */
  complete: boolean;
}) {
  const findings = result?.findings ?? [];
  const totalWeight =
    mission.targets.reduce((sum, t) => sum + t.weight, 0) || 1;

  const revealed = (kind: EvidenceKind) => complete || revealedKinds.has(kind);

  // Same normalisation as `identificationFrom`, so the finished tally lands on
  // the headline figure to the decimal rather than near it.
  const tally = complete && result
    ? result.identification
    : findings
        .filter((f) => revealed(f.kind))
        .reduce((sum, f) => sum + f.weight * f.legibility, 0) / totalWeight;

  const integrity = integrityKnown && result ? result.integrity : null;
  const shownTally = useGlide(tally);
  const shownIntegrityValue = useGlide(integrity ?? 0, 900);

  // Nothing to lean on until integrity is in: a reading of ACCEPTED over an
  // empty tally, in the first half-second, is not provisional — it is wrong.
  const leaning: Outcome | null = !result
    ? null
    : complete
      ? result.outcome
      : integrity === null
        ? null
        : decideOutcome(tally, integrity);

  // A cue when the reading gets worse. Only ever upward — see the header.
  const worst = useRef(-1);
  useEffect(() => {
    if (!leaning) return;
    const severity = SEVERITY[leaning];
    if (worst.current >= 0 && severity > worst.current) audio.cue("lock");
    worst.current = Math.max(worst.current, severity);
  }, [leaning]);

  // Rows in the order the pipeline reveals them, so chips light left to right
  // as the stages land rather than jumping about the strip.
  const rows = mission.targets.map((target) => {
    const finding = findings.find((f) => f.targetId === target.id);
    const shown = finding !== undefined && revealed(target.kind);
    const points = finding
      ? contribution(finding.weight / totalWeight, finding.legibility)
      : 0;
    return { target, shown, points, croppedOut: finding?.croppedOut ?? false };
  });

  return (
    <section className="u-bracket relative border border-line bg-panel/70">
      <header className="flex items-center justify-between gap-3 border-b border-line/80 px-3 py-[7px]">
        <h2 className="u-label text-[10.5px] text-dim">CASE ASSESSMENT</h2>
        <span
          className={`u-label text-[9px] ${
            complete ? "text-bone" : "animate-blink text-cyan"
          }`}
        >
          {complete ? "FINAL" : "ASSEMBLING"}
        </span>
      </header>

      <div className="space-y-3.5 px-3 py-3">
        {/* identification — built from the stages as they report */}
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="u-label text-[10px] text-dim">IDENTIFICATION</span>
            <span
              className={`font-mono text-[22px] leading-none tabular-nums ${
                TONE_TEXT[identificationTone(shownTally)]
              }`}
            >
              {shownIdentification(shownTally)}
              <span className="text-[11px] text-faint">%</span>
            </span>
          </div>
          <div className="mt-1.5">
            <Meter
              value={shownTally}
              tone={identificationTone(shownTally)}
              height={6}
              marks={IDENTIFICATION_MARKS}
            />
          </div>
          <ul className="mt-2 grid grid-cols-2 gap-1">
            {rows.map(({ target, shown, points, croppedOut }) => (
              <li
                key={target.id}
                className={`flex items-baseline justify-between gap-2 border px-1.5 py-[3px] transition-colors duration-500 ${
                  shown
                    ? "u-rise border-line-hot bg-panel-2"
                    : "border-line/60 bg-pit"
                }`}
              >
                <span
                  className={`u-label truncate text-[8.5px] ${
                    shown ? "text-bone" : "text-ghost"
                  }`}
                >
                  {target.short}
                </span>
                <span
                  className={`font-mono text-[9px] tabular-nums ${
                    shown ? TONE_TEXT[contributionTone(points)] : "text-ghost"
                  }`}
                >
                  {!shown ? "···" : croppedOut ? "OUT" : `+${points.toFixed(1)}`}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* integrity — one figure, landing whole */}
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="u-label text-[10px] text-dim">
              EXHIBIT INTEGRITY
            </span>
            <span
              className={`font-mono text-[22px] leading-none tabular-nums ${
                integrity === null
                  ? "text-ghost"
                  : TONE_TEXT[integrityTone(shownIntegrityValue)]
              }`}
            >
              {integrity === null ? "—" : shownIntegrity(shownIntegrityValue)}
              <span className="text-[11px] text-faint">%</span>
            </span>
          </div>
          <div className="mt-1.5">
            <Meter
              value={integrity === null ? 0 : shownIntegrityValue}
              tone={
                integrity === null
                  ? "dim"
                  : integrityTone(shownIntegrityValue)
              }
              height={6}
              marks={INTEGRITY_MARKS}
            />
          </div>
        </div>

        {/* the reading so far */}
        <div className="flex items-center justify-between gap-3 border-t border-line/70 pt-3">
          <span className="u-label text-[9px] text-faint">
            {complete ? "FINDING" : "LEANING"}
          </span>
          {leaning ? (
            <span
              key={`${leaning}-${complete}`}
              className={`u-label border px-2.5 py-1 text-[11px] ${
                OUTCOME_TONE[leaning]
              } ${complete ? "outcome-slam" : "u-rise"}`}
            >
              {leaning}
            </span>
          ) : (
            <span className="u-label animate-flicker text-[11px] text-ghost">
              AWAITING DATA
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
