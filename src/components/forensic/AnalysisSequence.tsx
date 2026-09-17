"use client";

/**
 * The turn.
 *
 * The criminal terminal is torn down and the same software reassembles as the
 * police side of it. The staged pipeline is theatre, but the numbers it reports
 * are the real analysis of the exhibit the player actually filed — the run
 * happens immediately, and the sequence reveals it in dramatic order.
 */

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  EvidenceKind,
  ForensicResult,
  Mission,
  Submission,
} from "@/types";
import { ForensicAnalyzer } from "@/lib/forensics/analyze";
import { mapRegionIntoSubmission } from "@/lib/forensics/align";
import { shownIntegrity } from "@/lib/forensics/display";
import { EnhancePanel, buildRecoverySlots } from "./EnhancePanel";
import { CaseAssessment } from "./CaseAssessment";
import { ReferenceMatch } from "./ReferenceMatch";
import { audio } from "@/lib/audio/engine";
import {
  Button,
  Meter,
  RecDot,
  ScanSweep,
  prefersReducedMotion,
} from "@/components/ui/primitives";

/** Pixel dimensions of the exhibit as actually filed. */
interface FiledSize {
  w: number;
  h: number;
}

interface Stage {
  id: string;
  label: string;
  /** Evidence kinds this stage examines, used to bracket the image. */
  kinds: EvidenceKind[];
  durationMs: number;
  /** Reads the finished analysis for this stage's verdict line. */
  report(
    result: ForensicResult,
    mission: Mission,
    filed: FiledSize | null
  ): { text: string; tone: Tone };
}

type Tone = "clear" | "amber" | "danger" | "dim";

const legibilityOf = (result: ForensicResult, kinds: EvidenceKind[]) => {
  const relevant = result.findings.filter((f) => kinds.includes(f.kind));
  if (!relevant.length) return null;
  return Math.max(...relevant.map((f) => f.legibility));
};

const toneFor = (v: number): Tone =>
  v >= 60 ? "danger" : v >= 30 ? "amber" : "clear";

/**
 * Pixel recovery pacing, owned here rather than by the panel.
 *
 * How many regions get examined and how long each takes are pipeline timing
 * decisions — the panel renders whatever it is handed. Keeping both constants
 * in this module also keeps `STAGES` free of cross-module reads at evaluation
 * time, which the dev bundler will not tolerate.
 */
const RECOVERY_SLOTS = 3;
const RECOVERY_SLOT_MS = 1500;

const STAGES: Stage[] = [
  {
    id: "acquire",
    label: "ACQUIRING EXHIBIT",
    kinds: [],
    durationMs: 600,
    // Reports what was actually filed — not the original size, once the
    // exhibit has been cropped or resized.
    report: (_r, m, filed) => ({
      text: filed
        ? `${filed.w}×${filed.h} RECEIVED`
        : `${m.imageSize.width}×${m.imageSize.height} RECEIVED`,
      tone: "dim",
    }),
  },
  {
    id: "integrity",
    label: "ANALYSING IMAGE INTEGRITY",
    kinds: [],
    durationMs: 850,
    report: (r) => ({
      text:
        r.integrity >= 70
          ? `${shownIntegrity(r.integrity)}% — CONSISTENT`
          : r.integrity >= 45
            ? `${shownIntegrity(r.integrity)}% — QUESTIONABLE`
            : `${shownIntegrity(r.integrity)}% — ALTERATION DETECTED`,
      tone: r.integrity >= 70 ? "clear" : r.integrity >= 45 ? "amber" : "danger",
    }),
  },
  {
    id: "face",
    label: "RUNNING FACIAL RECOGNITION",
    kinds: ["face", "mark", "mask"],
    // Long enough for the reference comparison docked on the exhibit to hunt
    // for its figure and then hold it — at 950ms it was over before it read.
    durationMs: 1800,
    report: (r) => {
      const v = legibilityOf(r, ["face", "mark", "mask"]);
      if (v === null) return { text: "NO SUBJECT REGION", tone: "dim" };
      return {
        text:
          v >= 60
            ? `MATCH ${Math.round(v)}% — SUBJECT IDENTIFIED`
            : v >= 30
              ? `MATCH ${Math.round(v)}% — PARTIAL`
              : `MATCH ${Math.round(v)}% — NO MATCH`,
        tone: toneFor(v),
      };
    },
  },
  {
    id: "vehicle",
    label: "CROSS-REFERENCING REGISTRY",
    kinds: ["plate", "vehicle"],
    durationMs: 750,
    report: (r) => {
      const v = legibilityOf(r, ["plate", "vehicle"]);
      if (v === null) return { text: "NO REGISTRY DATA", tone: "dim" };
      return {
        text: v >= 45 ? `PLATE RESOLVED ${Math.round(v)}%` : "PLATE UNREADABLE",
        tone: toneFor(v),
      };
    },
  },
  {
    // The payoff stage. Everything above reports a percentage; this one puts
    // the player's own pixels under a lens and reads the plate off them, or
    // fails to. It gets the longest slot in the pipeline on purpose.
    id: "recovery",
    label: "PIXEL RECOVERY",
    kinds: [],
    durationMs: RECOVERY_SLOTS * RECOVERY_SLOT_MS,
    report: (r, m, filed) => {
      const slots = buildRecoverySlots(m, r, filed, RECOVERY_SLOTS);
      const got = slots.filter((s) => s.rect && s.legibility >= 45).length;
      return {
        text:
          got === 0
            ? "NOTHING RECOVERABLE"
            : `${got}/${slots.length} REGIONS RECOVERED`,
        tone: got === 0 ? "clear" : got < slots.length ? "amber" : "danger",
      };
    },
  },
  {
    id: "anomaly",
    label: "PIXEL ANOMALY SWEEP",
    kinds: [],
    durationMs: 900,
    report: (r) => {
      const s = r.signals;
      const worst = Math.max(s.hardEdges, s.flatBlocks, s.foreignDetail, s.detailLoss);
      return {
        text:
          worst >= 0.3
            ? "STRUCTURED EDITING PRESENT"
            : worst >= 0.08
              ? "MINOR ANOMALIES"
              : "NO ANOMALIES",
        tone: worst >= 0.3 ? "danger" : worst >= 0.08 ? "amber" : "clear",
      };
    },
  },
  {
    id: "network",
    label: "SEARCHING SURVEILLANCE NETWORK",
    kinds: ["witness", "location", "object", "weapon"],
    durationMs: 700,
    report: (r) => {
      const v = legibilityOf(r, ["witness", "location", "object", "weapon"]);
      if (v === null) return { text: "NO CORROBORATION", tone: "dim" };
      return {
        text: v >= 45 ? `${Math.round(v)}% CORROBORATED` : "NO CORROBORATION",
        tone: toneFor(v),
      };
    },
  },
];

const TOTAL_MS = STAGES.reduce((s, st) => s + st.durationMs, 0);

export function AnalysisSequence({
  mission,
  submission,
  onComplete,
}: {
  mission: Mission;
  submission: Submission;
  onComplete(result: ForensicResult): void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<ForensicResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [filed, setFiled] = useState<FiledSize | null>(null);
  const finished = useRef(false);

  // Run the real analysis straight away; the animation is a reveal, not a wait.
  useEffect(() => {
    let cancelled = false;
    ForensicAnalyzer.create(mission)
      .then((a) => a.analyze(submission.dataUrl))
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((err) => {
        console.error("[vice-evidence] analysis failed", err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mission, submission.dataUrl]);

  // Measure the exhibit as filed, so the pipeline reports its real size.
  useEffect(() => {
    let cancelled = false;
    const probe = new window.Image();
    probe.onload = () => {
      if (!cancelled) {
        setFiled({ w: probe.naturalWidth, h: probe.naturalHeight });
      }
    };
    probe.src = submission.dataUrl;
    return () => {
      cancelled = true;
    };
  }, [submission.dataUrl]);

  // Drive the timeline. Reduced motion jumps straight to the end — handled
  // inside the frame callback so no state is set synchronously in the effect.
  useEffect(() => {
    const reduce = prefersReducedMotion();
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = reduce ? TOTAL_MS : now - start;
      setElapsed(t);
      if (t < TOTAL_MS) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Hand over once the theatre has caught up with the truth.
  useEffect(() => {
    if (finished.current) return;
    if (result && elapsed >= TOTAL_MS) {
      finished.current = true;
      onComplete(result);
    }
  }, [result, elapsed, onComplete]);

  const stageStates = useMemo(() => {
    // Offsets are accumulated up front rather than inside the map callback,
    // so nothing mutable is captured by a closure that outlives the render.
    const offsets: number[] = [];
    let acc = 0;
    for (const stage of STAGES) {
      offsets.push(acc);
      acc += stage.durationMs;
    }
    return STAGES.map((stage, i) => {
      const progress = Math.max(
        0,
        Math.min(1, (elapsed - offsets[i]) / stage.durationMs)
      );
      return { stage, progress, active: progress > 0 && progress < 1 };
    });
  }, [elapsed]);

  const activeStage =
    stageStates.find((s) => s.active)?.stage ??
    (elapsed >= TOTAL_MS ? null : STAGES[0]);

  // One cue as each stage lands. A set rather than an index because skipping
  // the analysis completes several stages in the same frame, and six blips on
  // top of each other is a noise, not a sound.
  const sounded = useRef(new Set<string>());
  useEffect(() => {
    for (const { stage, progress } of stageStates) {
      if (progress >= 1 && !sounded.current.has(stage.id)) {
        sounded.current.add(stage.id);
        if (sounded.current.size <= STAGES.length) audio.cue("stage");
      }
    }
  }, [stageStates]);

  const overall = Math.min(100, (elapsed / TOTAL_MS) * 100);
  const subjectRef = mission.references.find((r) => r.role === "subject");
  const face = stageStates.find((s) => s.stage.id === "face");
  const faceMatch = result ? legibilityOf(result, ["face", "mark", "mask"]) : null;
  const showReference =
    subjectRef !== undefined &&
    faceMatch !== null &&
    face !== undefined &&
    face.progress > 0 &&
    face.progress < 1;

  // What the assessment panel may show so far: the kinds whose stage has
  // reported, and whether integrity has.
  const complete = elapsed >= TOTAL_MS;
  const revealedKinds = useMemo(() => {
    const kinds = new Set<EvidenceKind>();
    for (const { stage, progress } of stageStates) {
      if (progress >= 1) stage.kinds.forEach((k) => kinds.add(k));
    }
    return kinds;
  }, [stageStates]);
  const integrityKnown =
    (stageStates.find((s) => s.stage.id === "integrity")?.progress ?? 0) >= 1;

  // While pixel recovery runs, the exhibit view is given over to the lens.
  // Once it finishes — or the player skips — the wide shot comes back.
  const recovery = stageStates.find((s) => s.stage.id === "recovery");
  const inRecovery =
    result !== null &&
    recovery !== undefined &&
    recovery.progress > 0 &&
    recovery.progress < 1;

  // Once the transform is known, the surviving crop gives the filed exhibit's
  // true shape; before that, fall back to the original's.
  const exhibitAspect = result
    ? result.transform.crop.w / result.transform.crop.h
    : mission.imageSize.width / mission.imageSize.height;

  return (
    // Powers up out of the line the terminal's handoff collapsed to — see
    // FilingOverlay. The two halves are meant to read as one picture.
    <main className="crt-on u-grid flex min-h-dvh flex-col bg-void">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan/30 bg-panel/80 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <RecDot tone="clear" />
          <div>
            <div className="u-display text-[14px] text-cyan">
              VICE CITY POLICE DEPARTMENT
            </div>
            <div className="u-label text-[8.5px] text-faint">
              DIGITAL FORENSICS UNIT · AUTOMATED ANALYSIS
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="u-label text-[8.5px] text-faint">CASE</div>
          <div className="font-mono text-[12px] text-bone">{mission.id}</div>
        </div>
      </header>

      {/* Sized to its content and centred in the height it has, rather than
          stretched to fill it. Stretched, the exhibit box grew past the
          photograph and framed ~100px of empty pit above and below it — a
          bordered letterbox around the one thing on screen worth looking at. */}
      <div className="mx-auto grid w-full max-w-[1500px] gap-3 p-3 lg:my-auto lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* the exhibit under examination */}
        <div className="flex min-h-0 flex-col gap-3">
          {/* The frame is pinned to the exhibit's own aspect ratio so the
              region brackets land on the pixels they describe — with
              object-contain letterboxing they would sit off the evidence. */}
          {/* u-vignette and u-scanlines both use ::after, so they have to sit
              on different elements; u-grain uses ::before and can pair up. */}
          <div className="u-vignette flex items-center justify-center border border-line bg-pit p-1.5">
            <div
              className="u-scanlines u-grain relative max-h-full w-full overflow-hidden"
              style={{ aspectRatio: `${exhibitAspect}` }}
            >
              {inRecovery && result ? (
                <EnhancePanel
                  mission={mission}
                  submission={submission}
                  result={result}
                  filed={filed}
                  count={RECOVERY_SLOTS}
                  progress={recovery.progress}
                />
              ) : (
                <>
                  <Image
                    src={submission.dataUrl}
                    alt="Submitted exhibit under forensic analysis"
                    fill
                    unoptimized
                    sizes="(max-width: 1024px) 100vw, 1000px"
                    className="object-contain"
                  />
                  <ScanSweep tone="cyan" active={elapsed < TOTAL_MS} />
                  {showReference && subjectRef && faceMatch !== null && face && (
                    <ReferenceMatch
                      reference={subjectRef}
                      match={faceMatch}
                      progress={face.progress}
                    />
                  )}
                  {result && activeStage && activeStage.kinds.length > 0 && (
                    <RegionBrackets
                      mission={mission}
                      result={result}
                      kinds={activeStage.kinds}
                    />
                  )}
                  <div className="absolute top-2 left-2 z-30 border border-cyan/40 bg-void/80 px-2 py-1">
                    <span className="u-label text-[8.5px] text-cyan">
                      EXHIBIT AS FILED
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="border border-line bg-panel/70 px-3.5 py-3">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="u-label text-[10px] text-dim">
                {activeStage ? activeStage.label : "ANALYSIS COMPLETE"}
              </span>
              <span className="font-mono text-[14px] text-cyan">
                {Math.round(overall)}%
              </span>
            </div>
            <Meter value={overall} tone="cyan" height={6} />
          </div>
        </div>

        {/* pipeline */}
        <div className="flex flex-col gap-3">
          <div className="border border-line bg-panel/70">
            <div className="border-b border-line/80 px-3 py-1.5">
              <span className="u-label text-[9.5px] text-dim">
                ANALYSIS PIPELINE
              </span>
            </div>
            <ol>
              {stageStates.map(({ stage, progress }) => {
                const done = progress >= 1;
                const verdict =
                  done && result ? stage.report(result, mission, filed) : null;
                return (
                  <li
                    key={stage.id}
                    className={`border-b border-line/50 px-3 py-2 last:border-0 ${
                      progress > 0 ? "opacity-100" : "opacity-35"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="u-label text-[9.5px] text-bone">
                        {stage.label}
                      </span>
                      <span
                        className={`u-label shrink-0 text-[8.5px] ${
                          verdict
                            ? {
                                clear: "text-clear",
                                amber: "text-amber",
                                danger: "text-danger",
                                dim: "text-dim",
                              }[verdict.tone]
                            : "text-faint"
                        }`}
                      >
                        {verdict
                          ? verdict.text
                          : progress > 0
                            ? `${Math.round(progress * 100)}%`
                            : "QUEUED"}
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <Meter
                        value={progress * 100}
                        tone={done ? "clear" : "cyan"}
                        height={2}
                        ticks={false}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          <CaseAssessment
            mission={mission}
            result={result}
            revealedKinds={revealedKinds}
            integrityKnown={integrityKnown}
            complete={complete}
          />

          {failed && (
            <p className="border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[10px] leading-relaxed text-danger">
              The exhibit could not be analysed. The file has been rejected at
              intake.
            </p>
          )}

          {elapsed > 900 && elapsed < TOTAL_MS && (
            <Button
              onClick={() => setElapsed(TOTAL_MS)}
              className="self-start"
            >
              SKIP ANALYSIS
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}

/**
 * Brackets over the regions the current stage is examining.
 *
 * Positions come from the recovered transform, so they stay correct even when
 * the player cropped the exhibit.
 */
function RegionBrackets({
  mission,
  result,
  kinds,
}: {
  mission: Mission;
  result: ForensicResult;
  kinds: string[];
}) {
  const editSize = useMemo(() => {
    // The submission's own pixel space: the crop scaled to its own bounds.
    const { crop } = result.transform;
    return { width: crop.w, height: crop.h };
  }, [result.transform]);

  const boxes = mission.targets
    .filter((t) => kinds.includes(t.kind))
    .map((t) => {
      const mapped = mapRegionIntoSubmission(
        t.region,
        result.transform,
        editSize
      );
      if (!mapped) return null;
      const finding = result.findings.find((f) => f.targetId === t.id);
      return {
        id: t.id,
        short: t.short,
        legible: (finding?.legibility ?? 0) >= 45,
        left: (mapped.x / editSize.width) * 100,
        top: (mapped.y / editSize.height) * 100,
        width: (mapped.w / editSize.width) * 100,
        height: (mapped.h / editSize.height) * 100,
      };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null);

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {boxes.map((b) => (
        <div
          key={b.id}
          className={`u-rise absolute border ${
            b.legible ? "border-danger" : "border-clear/70"
          }`}
          style={{
            left: `${b.left}%`,
            top: `${b.top}%`,
            width: `${b.width}%`,
            height: `${b.height}%`,
          }}
        >
          <span
            className={`u-label absolute -top-[15px] left-0 bg-void/85 px-1 text-[7.5px] ${
              b.legible ? "text-danger" : "text-clear"
            }`}
          >
            {b.short} {b.legible ? "LEGIBLE" : "UNREADABLE"}
          </span>
        </div>
      ))}
    </div>
  );
}
