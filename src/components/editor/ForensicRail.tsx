"use client";

/**
 * The live forensic rail.
 *
 * Everything here is computed from the actual submitted pixels by
 * lib/forensics — no value on this panel is theatre. The two headline gauges
 * are deliberately opposed, because that opposition is the game:
 *
 *   IDENTIFICATION  — how well they can still place you. Lower is better.
 *   EXHIBIT INTEGRITY — how authentic the photograph looks. Higher is better.
 *
 * Driving one down usually drives the other down with it.
 */

import type {
  EvidenceModification,
  ForensicResult,
  Mission,
  TargetTreatment,
} from "@/types";
import { Meter, Panel, Readout } from "@/components/ui/primitives";
import {
  contribution,
  contributionScale,
  contributionTone,
  identificationCaption,
  identificationTone,
  IDENTIFICATION_MARKS,
  IDENTIFICATION_TARGET,
  integrityCaption,
  integrityTone,
  INTEGRITY_MARKS,
  shownIdentification,
  shownIntegrity,
  type Tone,
} from "@/lib/forensics/display";

/**
 * These sit forty pixels from the identification strip above the exhibit,
 * which grades the same targets the other way up — a chip there reading CLEAR
 * means the player has cleared it, in green. So nothing in here may use that
 * word: an untouched target is the department's best news and the player's
 * worst, and calling both states "CLEAR" in opposing colours on one screen is
 * how a reader stops trusting either rail.
 */
const TREATMENT_LABEL: Record<TargetTreatment, string> = {
  untouched: "UNTOUCHED",
  degraded: "DEGRADED",
  obscured: "OBSCURED",
  redacted: "REDACTED",
  replaced: "REPLACED",
  cropped: "OUT OF FRAME",
};

const TONE_TEXT: Record<Tone, string> = {
  clear: "text-clear",
  amber: "text-amber",
  danger: "text-danger",
};

const TREATMENT_TONE: Record<TargetTreatment, string> = {
  untouched: "text-danger",
  degraded: "text-amber",
  obscured: "text-cyan",
  redacted: "text-magenta",
  replaced: "text-magenta",
  cropped: "text-clear",
};

export function ForensicRail({
  mission,
  live,
  modifications,
  analysing,
  dirty,
}: {
  mission: Mission;
  live: ForensicResult | null;
  modifications: EvidenceModification[];
  analysing: boolean;
  dirty: boolean;
}) {
  // Before the first snapshot lands, show the untouched baseline rather than
  // zeros — the exhibit really is fully legible at that point.
  const identification = live?.identification ?? 100;
  const integrity = live?.integrity ?? 100;
  const suspicion = live?.suspicion ?? 0;
  // One scale for every row, so bar lengths compare directly between targets.
  const barScale = contributionScale(mission.targets.map((t) => t.weight));

  return (
    // Scrolls rather than clips. The rail is four stacked panels and the last
    // of them is a growing ticker; on a short viewport the bottom of it used
    // to be cut off with nothing to indicate there was more.
    <div className="flex h-full min-h-0 flex-col gap-2.5 overflow-y-auto">
      <Panel
        title="LIVE FORENSIC ANALYSIS"
        aside={
          <span
            className={`u-label text-[9px] ${
              analysing ? "animate-blink text-cyan" : "text-faint"
            }`}
          >
            {analysing ? "SCANNING" : dirty ? "ALTERED" : "PRISTINE"}
          </span>
        }
      >
        <div className="space-y-3.5 px-3 py-3">
          <Gauge
            label="IDENTIFICATION"
            hint={identificationCaption(identification)}
            value={identification}
            shown={shownIdentification(identification)}
            tone={identificationTone(identification)}
            marks={IDENTIFICATION_MARKS}
          />
          <Gauge
            label="EXHIBIT INTEGRITY"
            hint={integrityCaption(integrity)}
            value={integrity}
            shown={shownIntegrity(integrity)}
            tone={integrityTone(integrity)}
            marks={INTEGRITY_MARKS}
          />
          <div className="border-t border-line/70 pt-2.5">
            <Readout
              label="SUSPICION"
              value={`${Math.round(suspicion)}%`}
              tone={suspicion > 55 ? "danger" : suspicion > 25 ? "amber" : "dim"}
            />
          </div>
        </div>
      </Panel>

      {/*
        Ranked by what each target costs, not by how legible it is. Those are
        different orders, and sorting by legibility sent effort at whatever
        still looked sharp rather than at whatever was carrying the case.
      */}
      <Panel title="IDENTIFICATION BREAKDOWN" aside={<BudgetAside value={identification} />}>
        <ul className="divide-y divide-line/60">
          {[...mission.targets]
            .map((target) => {
              const finding = live?.findings.find(
                (f) => f.targetId === target.id
              );
              const legibility = finding?.legibility ?? 100;
              return {
                target,
                legibility,
                treatment: finding?.treatment ?? ("untouched" as TargetTreatment),
                points: contribution(target.weight, legibility),
              };
            })
            .sort((a, b) => b.points - a.points)
            .map(({ target, legibility, treatment, points }) => (
              <li key={target.id} className="px-3 py-2">
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span className="u-label text-[10px] text-bone">
                    {target.short}
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`u-label text-[8.5px] ${TREATMENT_TONE[treatment]}`}
                    >
                      {TREATMENT_LABEL[treatment]}
                    </span>
                    <span
                      className={`w-11 text-right font-mono text-[11px] ${TONE_TEXT[contributionTone(points)]}`}
                    >
                      {points.toFixed(1)}
                      <span className="text-[8px] text-faint">PTS</span>
                    </span>
                  </div>
                </div>
                <Meter
                  value={(points / barScale) * 100}
                  tone={contributionTone(points)}
                  height={3}
                />
                {/* The two figures the points are made of, so the sum is checkable. */}
                <div className="mt-1 flex items-center justify-between">
                  <span className="u-label text-[8px] text-ghost">
                    WEIGHT {Math.round(target.weight * 100)}
                  </span>
                  <span className="font-mono text-[8.5px] text-ghost">
                    {Math.round(legibility)}% LEGIBLE
                  </span>
                </div>
              </li>
            ))}
        </ul>
      </Panel>

      {live && <TamperSignals result={live} />}

      <ModificationLog modifications={modifications} />
    </div>
  );
}

function Gauge({
  label,
  hint,
  value,
  shown,
  tone,
  marks,
}: {
  label: string;
  hint: string;
  value: number;
  /** The printed figure — rounded the way its threshold is judged. */
  shown: number;
  tone: Tone;
  marks?: number[];
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="u-label text-[10px] text-dim">{label}</span>
        <span className={`font-mono text-[17px] leading-none ${TONE_TEXT[tone]}`}>
          {shown}
          <span className="text-[10px] text-faint">%</span>
        </span>
      </div>
      <Meter value={value} tone={tone} height={5} marks={marks} />
      {/* Says where the value sits relative to the line, not what the bar means. */}
      <p className="u-label mt-1 text-[8px] text-ghost">{hint}</p>
    </div>
  );
}

/**
 * The running total against the number that has to be beaten, in the panel
 * header — so the breakdown below it is read as a budget rather than a list of
 * unrelated percentages.
 */
function BudgetAside({ value }: { value: number }) {
  const shown = shownIdentification(value);
  const clean = shown <= IDENTIFICATION_TARGET;
  return (
    <span className="font-mono text-[9px]">
      <span className={clean ? "text-clear" : "text-danger"}>
        {shown}
      </span>
      <span className="text-ghost"> / {IDENTIFICATION_TARGET} TARGET</span>
    </span>
  );
}

function TamperSignals({ result }: { result: ForensicResult }) {
  const s = result.signals;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const rows: [string, number][] = [
    ["HARD EDGES", s.hardEdges],
    ["FLAT FILL", s.flatBlocks],
    ["FOREIGN CONTENT", s.foreignDetail],
    ["DEFOCUS", s.detailLoss],
    ["EXPOSURE DRIFT", s.histogramShift],
    ["FRAME LOSS", s.frameLoss],
    ["PIXEL DELTA", s.alteredFraction],
  ];
  return (
    <Panel title="TAMPER SIGNALS">
      {/* One column until xl. At lg the rail is 232px, and two columns left
          each readout ~98px: the label is the part that refuses to shrink, so
          the figure it exists to report was the part clipped to "0(". */}
      <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 px-3 py-2.5 xl:grid-cols-2">
        {rows.map(([label, v]) => (
          <Readout
            key={label}
            label={label}
            value={pct(v)}
            tone={v > 0.3 ? "danger" : v > 0.08 ? "amber" : "dim"}
          />
        ))}
      </div>
    </Panel>
  );
}

function ModificationLog({
  modifications,
}: {
  modifications: EvidenceModification[];
}) {
  return (
    <Panel
      title="MODIFICATION LOG"
      className="flex min-h-[104px] flex-1 flex-col"
      aside={
        <span className="font-mono text-[9px] text-ghost">
          {modifications.length}
        </span>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {modifications.length === 0 ? (
          <p className="font-mono text-[10px] leading-relaxed text-ghost">
            No alterations detected. The exhibit is as the camera recorded it.
          </p>
        ) : (
          <ol className="space-y-1">
            {modifications.map((m) => (
              <li
                key={m.id}
                className="u-rise flex items-baseline gap-2 font-mono text-[9.5px] leading-snug"
              >
                <span className="shrink-0 text-ghost">
                  {formatOffset(m.at)}
                </span>
                <span className="shrink-0 text-magenta">&gt;</span>
                <span className="text-dim">{m.label}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Panel>
  );
}

function formatOffset(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
