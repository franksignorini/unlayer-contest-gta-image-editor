"use client";

/**
 * The payoff.
 *
 * Values count up from zero, the outcome lands as a stamped banner, and on a
 * confirmed identification the file reference is shown beside the doctored
 * exhibit — the match the player failed to prevent.
 */

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import type {
  CaseReference,
  ForensicResult,
  Mission,
  Submission,
} from "@/types";
import {
  OUTCOME_COPY,
  WANTED_MAX,
  outcomeBody,
  wantedLabel,
} from "@/lib/forensics/score";
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
import { audio } from "@/lib/audio/engine";
import { ExaminerNotes } from "./ExaminerNotes";
import { OutcomeCard } from "./OutcomeCard";
import {
  Button,
  Divider,
  Meter,
  Panel,
  Stamp,
  WantedStars,
  prefersReducedMotion,
  useCountUp,
} from "@/components/ui/primitives";

const TONE_TEXT: Record<Tone, string> = {
  clear: "text-clear",
  amber: "text-amber",
  danger: "text-danger",
};

const TONE_CLASS = {
  clear: {
    text: "text-clear",
    border: "border-clear/50",
    bg: "bg-clear/8",
    meter: "clear" as const,
  },
  warn: {
    text: "text-amber",
    border: "border-amber/50",
    bg: "bg-amber/8",
    meter: "amber" as const,
  },
  danger: {
    text: "text-magenta",
    border: "border-magenta/50",
    bg: "bg-magenta/8",
    meter: "magenta" as const,
  },
  critical: {
    text: "text-danger",
    border: "border-danger/60",
    bg: "bg-danger/10",
    meter: "danger" as const,
  },
};

export function VerdictReport({
  mission,
  submission,
  result,
  wantedLevel,
  onContinue,
}: {
  mission: Mission;
  submission: Submission;
  result: ForensicResult;
  wantedLevel: number;
  onContinue(): void;
}) {
  const copy = OUTCOME_COPY[result.outcome];
  const tone = TONE_CLASS[copy.tone];
  const identified = result.outcome === "IDENTIFIED";
  const subjectRef = mission.references.find((r) => r.role === "subject");
  // One scale for every finding row, so their bars compare directly.
  const findingScale = contributionScale(result.findings.map((f) => f.weight));

  // The verdict lands as a physical stamp; a confirmed identification then
  // brings the car. The delay lets the stamp finish before the siren starts,
  // so the two read as consequence rather than as one noise.
  //
  // Timed to the title card: the stamp sounds when the stamp lands on it, not
  // when the card mounts a second earlier.
  const [cardDone, setCardDone] = useState(false);
  const handleCardDone = useCallback(() => setCardDone(true), []);
  useEffect(() => {
    const slam = prefersReducedMotion() ? 0 : 1050;
    const ids = [setTimeout(() => audio.cue("stamp"), slam)];
    if (identified) ids.push(setTimeout(() => audio.cue("siren"), slam + 620));
    return () => ids.forEach(clearTimeout);
  }, [identified]);

  if (!cardDone) {
    return (
      <OutcomeCard
        result={result}
        submission={submission}
        wantedLevel={wantedLevel}
        onDone={handleCardDone}
      />
    );
  }

  return (
    <main className="u-grid min-h-dvh bg-void">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel/80 px-4 py-2.5">
        <div>
          <div className="u-display text-[14px] text-cyan">
            VICE CITY POLICE DEPARTMENT
          </div>
          <div className="u-label text-[8.5px] text-faint">
            DIGITAL FORENSICS · ANALYSIS COMPLETE
          </div>
        </div>
        <div className="text-right">
          <div className="u-label text-[8.5px] text-faint">CASE</div>
          <div className="font-mono text-[12px] text-bone">{mission.id}</div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* left: the report */}
        <div className="flex flex-col gap-3">
          <div
            className={`u-rise relative overflow-hidden border ${tone.border} ${tone.bg} px-5 py-6`}
          >
            <div className="u-label mb-2 text-[9px] text-faint">
              {submission.trigger === "timeout"
                ? "EXHIBIT PULLED BY INTAKE — TIME EXPIRED"
                : "EXHIBIT FILED BY OPERATOR"}
            </div>
            {/* The verdict lands with a single glitch pass, not a loop. */}
            <h1
              className={`u-display u-glitch text-[8vw] leading-[0.9] sm:text-[46px] ${tone.text}`}
            >
              {copy.headline}
            </h1>
            <p className="mt-3 max-w-[62ch] font-mono text-[11.5px] leading-relaxed text-dim">
              {outcomeBody(result.outcome, result)}
            </p>
            <div className="mt-5 flex flex-wrap items-end gap-x-10 gap-y-4">
              <div>
                <div className="u-label text-[8.5px] text-faint">
                  CASE STATUS
                </div>
                <div className={`u-display text-[24px] ${tone.text}`}>
                  {copy.caseStatus}
                </div>
              </div>
              <div>
                <div className="u-label text-[8.5px] text-faint">
                  WANTED LEVEL
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <WantedStars level={wantedLevel} />
                  <span className="font-mono text-[11px] text-dim">
                    {result.wantedDelta > 0
                      ? `+${result.wantedDelta}`
                      : "UNCHANGED"}
                  </span>
                </div>
                {/* The number is abstract; the rung is not. */}
                <div
                  className={`u-label mt-1.5 text-[10px] ${
                    wantedLevel >= WANTED_MAX
                      ? "animate-blink text-danger"
                      : "text-dim"
                  }`}
                >
                  {wantedLabel(wantedLevel)}
                </div>
              </div>
            </div>
            <div className="absolute top-4 right-4 hidden sm:block">
              <Stamp tone={copy.tone === "clear" ? "clear" : "danger"} rotate={8}>
                {copy.tone === "clear" ? "NO ACTION" : "ON RECORD"}
              </Stamp>
            </div>
          </div>

          <ExaminerNotes mission={mission} result={result} />

          <Panel title="FORENSIC REPORT">
            <div className="space-y-4 px-3.5 py-3.5">
              <HeadlineRow
                label="IDENTIFICATION CONFIDENCE"
                value={result.identification}
                tone={identificationTone(result.identification)}
                marks={IDENTIFICATION_MARKS}
                shown={shownIdentification}
                foot={identificationCaption(result.identification, "CLEAR OF")}
              />
              <HeadlineRow
                label="EXHIBIT INTEGRITY"
                value={result.integrity}
                tone={integrityTone(result.integrity)}
                marks={INTEGRITY_MARKS}
                shown={shownIntegrity}
                foot={integrityCaption(result.integrity, "TAMPERING FLOOR")}
              />
              <HeadlineRow
                label="SUSPICION"
                value={result.suspicion}
                shown={Math.round}
                tone={result.suspicion >= 55 ? "danger" : result.suspicion >= 25 ? "amber" : "clear"}
              />

              <Divider label="IDENTIFICATION BREAKDOWN" />

              {/*
                Sorted by what each exhibit cost, not by its weight or its raw
                legibility. Those orders disagree, and the other two put the
                loudest-looking row at the top rather than the expensive one.
              */}
              <ul className="space-y-2.5">
                {[...result.findings]
                  .sort(
                    (a, b) =>
                      contribution(b.weight, b.legibility) -
                      contribution(a.weight, a.legibility)
                  )
                  .map((f, i) => (
                    <FindingRow
                      key={f.targetId}
                      finding={f}
                      scale={findingScale}
                      delay={i * 70}
                    />
                  ))}
              </ul>
              <div className="flex items-baseline justify-between border-t border-line/70 pt-2 font-mono text-[9px]">
                <span className="u-label text-ghost">TOTAL</span>
                <span className="text-ghost">
                  <span
                    className={
                      result.identification <= IDENTIFICATION_TARGET
                        ? "text-clear"
                        : "text-danger"
                    }
                  >
                    {result.identification.toFixed(1)}
                  </span>{" "}
                  / {IDENTIFICATION_TARGET}.0 TO FILE CLEAN
                </span>
              </div>

              <Divider label="INSTRUMENTATION" />
              <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[9px] text-ghost">
                <span>
                  ANALYSIS TIME {result.elapsedMs.toFixed(0)}MS · PIXEL DELTA{" "}
                  {(result.signals.alteredFraction * 100).toFixed(1)}%
                </span>
                <span>
                  {result.transform.estimated
                    ? `REFRAME RECOVERED · FRAME LOSS ${(result.transform.frameLoss * 100).toFixed(0)}%`
                    : "FRAME INTACT"}
                </span>
              </div>
            </div>
          </Panel>
        </div>

        {/* right: the exhibit, and the match */}
        <div className="flex flex-col gap-3">
          <Panel title="EXHIBIT AS FILED">
            <div className="u-scanlines relative aspect-video bg-pit">
              <Image
                src={submission.dataUrl}
                alt="The exhibit as submitted"
                fill
                unoptimized
                sizes="420px"
                className="object-contain"
              />
            </div>
          </Panel>

          {subjectRef && (
            <DatabaseComparison
              reference={subjectRef}
              identification={result.identification}
              identified={identified}
            />
          )}

          <div className="border border-line bg-panel/70 px-3.5 py-3">
            <Button
              variant="primary"
              onClick={onContinue}
              className="w-full py-3"
            >
              VIEW CASE FILE
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}

/**
 * The comparison the whole case was about.
 *
 * This panel used to render only on a confirmed identification — so the one
 * outcome the player was working towards showed them nothing, and the column
 * beside their filed exhibit sat empty on every win. The reference photograph
 * is the thing the department was going to match them against; whether it
 * matched is the answer to the run, and an answer is owed in both directions.
 *
 * So it always renders, and the stamp carries the result: NO MATCH when the
 * recognition pass came back with nothing, INCONCLUSIVE when it got a partial,
 * MATCH CONFIRMED when it got them. The reference itself is shown clean on a
 * failure to match and ringed in red on a hit — the annex material is
 * high-fidelity on purpose, and that contrast against a scrubbed exhibit is
 * the point of holding it.
 */
function DatabaseComparison({
  reference,
  identification,
  identified,
}: {
  reference: CaseReference;
  identification: number;
  identified: boolean;
}) {
  // Mirrors the analysis pipeline's own registry stage, so the panel and the
  // readout above it can never disagree about what recognition came back with.
  //
  // The figure is named on the stamp. It is the case-wide identification, and
  // the analysis showed this same photograph beside a face-match figure a few
  // points away — two bare percentages on one picture read as a contradiction.
  const partial = !identified && identification >= 30;
  const verdict = identified
    ? {
        title: "DATABASE MATCH",
        tone: "danger" as const,
        stamp: `MATCH CONFIRMED · ${shownIdentification(identification)}% IDENTIFICATION`,
        note: reference.caption,
        chrome: "ring-danger/60",
        chip: "border-danger/60 text-danger",
        wash: "",
      }
    : partial
      ? {
          title: "DATABASE COMPARISON",
          tone: "default" as const,
          stamp: `INCONCLUSIVE · ${shownIdentification(identification)}% IDENTIFICATION`,
          note: "Partial correspondence to the reference on file. Below the threshold to refer, and not enough to rule out.",
          chrome: "ring-amber/40",
          chip: "border-amber/60 text-amber",
          wash: "opacity-80",
        }
      : {
          title: "DATABASE COMPARISON",
          tone: "default" as const,
          stamp: `NO MATCH · ${shownIdentification(identification)}% IDENTIFICATION`,
          note: "The reference on file could not be tied to the submitted exhibit. Nothing in the photograph corresponds to a known subject.",
          chrome: "ring-clear/30",
          chip: "border-clear/50 text-clear",
          wash: "opacity-70 grayscale",
        };

  return (
    <Panel title={verdict.title} tone={verdict.tone}>
      <div className="relative aspect-video bg-pit">
        <Image
          src={reference.src}
          alt={reference.caption}
          fill
          sizes="420px"
          className={`object-cover transition-all duration-700 ${verdict.wash}`}
        />
        <div className={`absolute inset-0 ring-2 ring-inset ${verdict.chrome}`} />
        <div
          className={`absolute bottom-2 left-2 border bg-void/85 px-2 py-1 ${verdict.chip}`}
        >
          <span className="u-label text-[8.5px]">{verdict.stamp}</span>
        </div>
      </div>
      <p className="px-3 py-2.5 font-mono text-[10px] leading-relaxed text-dim">
        {verdict.note}
      </p>
    </Panel>
  );
}

function HeadlineRow({
  label,
  value,
  tone,
  marks,
  shown,
  foot,
}: {
  label: string;
  value: number;
  tone: Tone;
  /** How the figure is printed — rounded the way its threshold is judged. */
  shown(v: number): number;
  marks?: number[];
  /**
   * Where this number sits relative to the line it is judged against. The
   * gauges carried no scale at all before, so a bare 63% said nothing about
   * whether 63 was a pass.
   */
  foot?: string;
}) {
  const animated = useCountUp(value, 1100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="u-label text-[10px] text-dim">{label}</span>
        <span
          className={`font-mono text-[22px] leading-none ${TONE_TEXT[tone]}`}
        >
          {shown(animated)}
          <span className="text-[11px] text-faint">%</span>
        </span>
      </div>
      <div className="mt-1.5">
        <Meter value={animated} tone={tone} height={5} marks={marks} />
      </div>
      {foot && (
        <p className="u-label mt-1 text-[8px] text-ghost">{foot}</p>
      )}
    </div>
  );
}

/**
 * One exhibit's share of the identification score.
 *
 * The headline figure is `weight * legibility` — the points this exhibit put
 * on the board — because that is what the verdict is decided on and what the
 * player has to spend against. Legibility alone ranked the rows in the wrong
 * order: on VC-003 a face at 46% legible costs 19 points and banded notes at
 * 100% legible cost 20, so the row that looked fine and the row that looked
 * fatal were the same size of problem.
 */
function FindingRow({
  finding,
  scale,
  delay,
}: {
  finding: ForensicResult["findings"][number];
  /** Points the heaviest exhibit in this case could contribute, as the track. */
  scale: number;
  delay: number;
}) {
  const points = contribution(finding.weight, finding.legibility);
  const animated = useCountUp(points, 900);
  const tone = contributionTone(points);
  return (
    <li className="u-rise" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="u-label text-[10px] text-bone">{finding.label}</span>
        <span
          className={`w-16 text-right font-mono text-[12px] ${TONE_TEXT[tone]}`}
        >
          {finding.croppedOut ? (
            "OUT"
          ) : (
            <>
              {animated.toFixed(1)}
              <span className="text-[8px] text-faint">PTS</span>
            </>
          )}
        </span>
      </div>
      <div className="mt-1">
        <Meter
          value={(animated / scale) * 100}
          tone={tone}
          height={2}
          ticks={false}
        />
      </div>
      {/* The two figures the points are made of, so the total is checkable. */}
      <div className="mt-1 flex items-baseline justify-between font-mono text-[8px] text-ghost">
        <span className="u-label">
          WEIGHT {Math.round(finding.weight * 100)}
        </span>
        <span>{Math.round(finding.legibility)}% LEGIBLE</span>
      </div>
    </li>
  );
}
