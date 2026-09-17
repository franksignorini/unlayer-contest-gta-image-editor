"use client";

/**
 * The dossier — the shareable close.
 *
 * The comparison is the point: what the camera recorded, next to what the
 * player filed. Everything else on this screen supports that one before/after.
 */

import { useCallback, useState } from "react";
import type { ForensicResult, Mission, Submission } from "@/types";
import { OUTCOME_COPY, WANTED_MAX, wantedLabel } from "@/lib/forensics/score";
import { caseCardFilename, renderCaseCard } from "@/lib/share/case-card";
import { operatorRating } from "@/lib/game/rating";
import { MUSIC } from "@/lib/audio/music";
import { ExhibitWipe } from "@/components/forensic/ExhibitWipe";
import { Button, Panel, WantedStars } from "@/components/ui/primitives";
import type { OperatorRating } from "@/lib/game/rating";
import {
  careerVerdict,
  isComplete,
  type CaseRecords,
} from "@/lib/game/rap-sheet";
import { MISSIONS } from "@/data/missions";
import {
  CAREER_TONE_EDGE,
  CAREER_TONE_TEXT,
} from "@/components/case/RapSheetPanel";

export function CaseDossier({
  mission,
  submission,
  result,
  wantedLevel,
  records,
  onRetry,
  nextCaseId,
  onAnotherCase,
}: {
  mission: Mission;
  submission: Submission;
  result: ForensicResult;
  wantedLevel: number;
  /** The whole record, for the final standing once every case is on file. */
  records: CaseRecords;
  onRetry(): void;
  /** Where ANOTHER CASE leads — named on the button, so the choice is visible. */
  nextCaseId: string;
  onAnotherCase(): void;
}) {
  const copy = OUTCOME_COPY[result.outcome];
  const success = result.outcome === "ACCEPTED";
  const rating = operatorRating(result.outcome, result.integrity);
  // The career's ending used to live only in the corner of the case index,
  // below the fold at 1280x800 — so the run that filed the fifth case ended on
  // this screen with no sign that anything had been completed.
  const career = isComplete(records) ? careerVerdict(records) : null;

  const [cardState, setCardState] = useState<
    "idle" | "rendering" | "done" | "error"
  >("idle");

  const download = useCallback(async () => {
    setCardState("rendering");
    try {
      const blob = await renderCaseCard({
        mission,
        submission,
        result,
        wantedLevel,
        // Passed in rather than recomputed, so the card can never disagree
        // with the grade printed next to it on this screen.
        rating,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = caseCardFilename(mission, result);
      a.click();
      // Revoked on the next tick: revoking synchronously can beat the browser
      // to the fetch and produce an empty file.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setCardState("done");
    } catch (err) {
      console.error("[vice-evidence] case card failed", err);
      setCardState("error");
    }
  }, [mission, submission, result, wantedLevel, rating]);

  return (
    <main className="u-grid flex min-h-dvh flex-col bg-void">
      {/* Centred in the height it has: the comparison is width-bound, so on a
          16:10 display the whole screen used to sit in the top two thirds with
          a band of empty grid under it. */}
      <div className="mx-auto grid w-full max-w-[1500px] gap-3 p-3 lg:my-auto lg:grid-cols-[minmax(0,1fr)_390px]">
        {/* comparison */}
        {/* `self-start` so the panel ends where the comparison ends. Stretched
            to match the taller column it trailed an empty bordered box under
            the caption on anything narrow enough to make the card the taller
            of the two. */}
        <Panel
          className="self-start"
          title="EXHIBIT COMPARISON"
          aside={
            <span className="u-label text-[8px] text-cyan">
              DRAG TO COMPARE
            </span>
          }
        >
          <ExhibitWipe
            original={mission.image}
            filed={submission.dataUrl}
            width={mission.imageSize.width}
            height={mission.imageSize.height}
            success={success}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5">
            <p className="max-w-[58ch] font-mono text-[10px] leading-relaxed text-faint">
              The department retains both. The version on the left is what the
              camera wrote to disk; the version on the right is what reached
              intake.
            </p>
            <span className="font-mono text-[9px] text-ghost">
              {mission.cameraId} · {mission.timestamp}
            </span>
          </div>
        </Panel>

        {/* the card */}
        <div className="flex flex-col gap-3">
          <article
            className={`u-bracket relative overflow-hidden border bg-panel/80 px-5 py-6 ${
              success ? "border-clear/45" : "border-magenta/45"
            }`}
          >
            <div className="u-tape absolute inset-x-0 top-0 h-[3px]" />
            <div className="u-label text-[9px] text-faint">
              VICE CITY POLICE DEPARTMENT
            </div>
            <div className="u-display mt-1 text-[30px] leading-none text-bone">
              VICE EVIDENCE
            </div>
            <div className="mt-4 font-mono text-[11px] text-dim">
              CASE {mission.id} · {mission.title}
            </div>

            <div className="mt-5 space-y-3.5">
              {/* Worded to finish the label's sentence for every outcome. It
                  used to print the report headline on a loss, so the card read
                  "EVIDENCE TAMPERING — IDENTIFICATION CONFIRMED", and it
                  coloured a suspended case the same red as an arrest. */}
              <CardRow
                label="EVIDENCE TAMPERING"
                value={TAMPERING_VERDICT[result.outcome]}
                tone={OUTCOME_TONE[result.outcome]}
              />
              <RatingRow rating={rating} />
              <CardRow
                label="CASE STATUS"
                value={copy.caseStatus}
                tone={OUTCOME_TONE[result.outcome]}
              />
              <div>
                <div className="u-label text-[8.5px] text-faint">
                  WANTED LEVEL
                </div>
                <div className="mt-1.5">
                  <WantedStars level={wantedLevel} size={17} animate={false} />
                </div>
                <div
                  className={`u-label mt-1.5 text-[9.5px] ${
                    wantedLevel >= WANTED_MAX ? "text-danger" : "text-dim"
                  }`}
                >
                  {wantedLabel(wantedLevel)}
                </div>
              </div>
            </div>

            <blockquote className="mt-6 border-l-2 border-magenta/60 pl-3">
              <p className="u-display text-[15px] leading-tight text-bone">
                “{mission.closingLine}”
              </p>
            </blockquote>

            <div className="mt-5 flex items-center justify-between border-t border-line/70 pt-3">
              <span className="u-label text-[8px] text-ghost">
                EXHIBIT {mission.imageSize.width}×{mission.imageSize.height}
              </span>
              <span className="font-mono text-[8px] text-ghost">
                {result.transform.estimated ? "REFRAMED" : "FRAME INTACT"} ·{" "}
                {result.findings.filter((f) => f.treatment !== "untouched").length}
                /{result.findings.length} ALTERED
              </span>
            </div>
          </article>

          {career && (
            <section
              className={`u-rise border px-4 py-3.5 ${CAREER_TONE_EDGE[career.tone]}`}
              style={{ animationDelay: "250ms" }}
            >
              <div className="u-label text-[8.5px] text-faint">
                ALL {MISSIONS.length} CASES ON FILE · FINAL STANDING
              </div>
              <div
                className={`u-display mt-1 text-[26px] leading-none ${CAREER_TONE_TEXT[career.tone]}`}
              >
                {career.headline}
              </div>
              <p className="mt-2 font-mono text-[9.5px] leading-relaxed text-dim">
                {career.body}
              </p>
            </section>
          )}

          <div className="flex flex-col gap-2 border border-line bg-panel/70 p-3">
            {/* The run currently ends inside a tab. This is the one control
                that lets it leave. */}
            <Button
              variant="primary"
              onClick={download}
              disabled={cardState === "rendering"}
              className="py-3"
            >
              {cardState === "rendering" ? "COMPOSING…" : "DOWNLOAD CASE FILE"}
            </Button>
            <Button onClick={onRetry} className="py-3">
              RETRY THIS CASE
            </Button>
            <Button onClick={onAnotherCase} className="py-3">
              {/* Once the set is complete the next case is the weakest filing
                  on the record, and the button says so rather than implying a
                  fresh one. */}
              {career ? `REFILE ${nextCaseId}` : `NEXT CASE · ${nextCaseId}`}
            </Button>
            <p
              className={`mt-1 font-mono text-[9px] leading-relaxed ${
                cardState === "error" ? "text-danger" : "text-ghost"
              }`}
            >
              {cardState === "error"
                ? "The card could not be composed. The exhibit is still on file above."
                : cardState === "done"
                  ? "Case file saved. Both exhibits, the verdict and the wanted level."
                  : "A retry restores the exhibit exactly as the camera recorded it."}
            </p>
          </div>
        </div>
      </div>

      <MusicCredit />
    </main>
  );
}

/**
 * The bed's attribution.
 *
 * The track is CC BY: commercial use is granted, attribution is required, and
 * for a web app the deployed page is the medium the credit has to appear in —
 * carrying it only in the README does not satisfy that. It sits here, at the
 * bottom of the last screen of a run, because this is the one place in the game
 * with nothing else competing for attention; it was pulled from the cold open
 * for arguing with the pitch, and putting it back there is not the fix.
 *
 * If the bed is ever swapped for a CC0 track this whole block goes away with
 * the credit fields in `music.ts` — that is the cleaner ending, since CC0
 * waives attribution entirely.
 */
function MusicCredit() {
  if (!MUSIC.artist || !MUSIC.license) return null;
  return (
    <footer className="mt-auto border-t border-line px-4 py-3 text-center font-mono text-[8.5px] leading-relaxed text-ghost">
      Music{" "}
      <span className="text-faint">{MUSIC.title}</span> by{" "}
      <a
        href={MUSIC.artistUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-faint underline decoration-line underline-offset-2 hover:text-dim"
      >
        {MUSIC.artist}
      </a>
      {MUSIC.viaLabel ? (
        <>
          {" "}
          via{" "}
          <a
            href={MUSIC.viaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-faint underline decoration-line underline-offset-2 hover:text-dim"
          >
            {MUSIC.viaLabel}
          </a>
        </>
      ) : null}
      {" · "}
      <a
        href={MUSIC.licenseUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-faint underline decoration-line underline-offset-2 hover:text-dim"
      >
        {MUSIC.license}
      </a>
    </footer>
  );
}

/** The dossier's one-word answer to "did the tampering work". */
const TAMPERING_VERDICT: Record<ForensicResult["outcome"], string> = {
  ACCEPTED: "SUCCESSFUL",
  INSUFFICIENT: "INCONCLUSIVE",
  TAMPERING: "DETECTED",
  IDENTIFIED: "FAILED",
};

const OUTCOME_TONE: Record<
  ForensicResult["outcome"],
  "clear" | "amber" | "danger"
> = {
  ACCEPTED: "clear",
  INSUFFICIENT: "amber",
  TAMPERING: "danger",
  IDENTIFIED: "danger",
};

const RATING_TEXT = {
  clear: "text-clear",
  amber: "text-amber",
  magenta: "text-magenta",
  danger: "text-danger",
} as const;

/**
 * The grade, stamped. One letter is the most legible thing on the card at a
 * glance, which is what a shared screenshot is read at.
 */
function RatingRow({ rating }: { rating: OperatorRating }) {
  const color = RATING_TEXT[rating.tone];
  return (
    <div>
      <div className="u-label text-[8.5px] text-faint">OPERATOR RATING</div>
      <div className="mt-1 flex items-center gap-3.5">
        <span
          className={`outcome-slam u-display grid size-[54px] shrink-0 place-items-center border-2 text-[38px] leading-none ${color}`}
          style={{ animationDelay: "380ms" }}
        >
          {rating.grade}
        </span>
        <div className="min-w-0">
          <div className={`u-display text-[19px] leading-tight ${color}`}>
            {rating.title}
          </div>
          <p className="mt-0.5 font-mono text-[9.5px] leading-relaxed text-dim">
            {rating.line}
          </p>
        </div>
      </div>
    </div>
  );
}

function CardRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "clear" | "amber" | "danger";
}) {
  const color = { clear: "text-clear", amber: "text-amber", danger: "text-danger" }[
    tone
  ];
  return (
    <div>
      <div className="u-label text-[8.5px] text-faint">{label}</div>
      <div className={`u-display mt-0.5 text-[19px] leading-tight ${color}`}>
        {value}
      </div>
    </div>
  );
}
