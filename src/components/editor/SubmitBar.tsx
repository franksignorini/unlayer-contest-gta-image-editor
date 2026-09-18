"use client";

/**
 * The submit bar is pinned to the bottom of the exhibit column.
 *
 * A player who has to go looking for the control that ends the run has already
 * lost time they were not told they were spending. Sticky rather than fixed so
 * it stays inside the exhibit column and never covers the rails.
 *
 * It also carries the one piece of state the editor will not tell the player
 * itself: whether what they are looking at has actually landed on the exhibit.
 * SCRUB, CUT, FRAME and EDGE hold their work back until their panel closes, and
 * the editor's close is a small glyph in the panel's corner that says nothing
 * about committing anything. So whenever one of those panels is open the bar
 * says what state the preview is in and offers APPLY — the same close, where
 * the player is already reading. Submitting closes the panel too, so nothing is
 * lost either way, but the player should see the difference rather than find
 * out from the verdict.
 *
 * And it is where the editor's own DISCARD asks for confirmation. That control
 * used to do nothing at all — the wrapper exposes `onCancel` and nothing was
 * listening — which under a clock reads as "the terminal is broken". It now
 * wipes the exhibit back to the capture, but only on a second, deliberate
 * press here: one stray click on a toolbar button must not cost a whole run.
 */

import type { ForensicResult } from "@/types";
import { Button } from "@/components/ui/primitives";
import type { DeadlineStage } from "@/components/hud/DeadlineClock";
import { TOOL_BRIEFINGS } from "./editor-config";

/** Where the DISCARD confirmation is. */
export type WipeState = "idle" | "armed" | "nothing";

export function SubmitBar({
  stage,
  dirty,
  pending,
  panelOpen,
  panelTool,
  projectedDefocus,
  live,
  wipe,
  onApply,
  onConfirmWipe,
  onCancelWipe,
  onSubmit,
}: {
  stage: DeadlineStage;
  dirty: boolean;
  /** A panel is open and nothing from it has reached the rail yet. */
  pending: boolean;
  panelOpen: boolean;
  /** Rail label of the open tool panel, when it could be read. */
  panelTool: string | null;
  /**
   * The DEFOCUS setting the rail is currently projecting, when it is showing a
   * modelled preview rather than the exhibit. See useLiveForensics.
   */
  projectedDefocus: number | null;
  /** What the rail is showing — the exhibit, or the projection over it. */
  live: ForensicResult | null;
  wipe: WipeState;
  /** Close the open panel, landing its work on the exhibit. */
  onApply(): void;
  onConfirmWipe(): void;
  onCancelWipe(): void;
  onSubmit(): void;
}) {
  const pressured = stage === "urgent" || stage === "critical";
  // BLOCK, PAINT, FAKE and PLANT land on the canvas the moment they are used,
  // so PREVIEW ONLY over one of their panels was simply false — and it sat
  // there telling the player nothing would happen while the rail moved. Those
  // panels get what is actually useful at that moment instead: how the tool
  // lands, and what it costs. An unreadable heading falls back to the preview
  // notice, which is the cautious reading.
  const briefing = panelTool
    ? TOOL_BRIEFINGS.find((t) => t.rail === panelTool)
    : undefined;
  const lands = briefing?.lands ?? "on-close";
  const holding = panelOpen && lands === "on-close";
  const projected = projectedDefocus !== null;

  return (
    <div
      className={`sticky bottom-0 z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 border px-3 py-2.5 backdrop-blur-sm ${
        wipe === "armed"
          ? "border-magenta/60 bg-[color-mix(in_srgb,var(--color-magenta)_9%,var(--color-panel))]/95"
          : stage === "critical"
            ? "border-danger/70 bg-[color-mix(in_srgb,var(--color-danger)_12%,var(--color-panel))]/95"
            : stage === "urgent"
              ? "border-danger/45 bg-[color-mix(in_srgb,var(--color-danger)_7%,var(--color-panel))]/95"
              : "border-line bg-panel/95"
      }`}
    >
      {wipe === "armed" ? (
        // Outranks everything: it is a question, and the run is paused on it.
        <div className="flex flex-wrap items-center gap-3">
          <p className="max-w-[46ch] font-mono text-[9.5px] leading-relaxed text-bone">
            <span className="u-label text-[9.5px] text-magenta">
              DISCARD EVERY ALTERATION?
            </span>{" "}
            The exhibit goes back to exactly what the camera recorded. The
            clock keeps running.
          </p>
          <div className="flex gap-2">
            <Button
              variant="danger"
              onClick={onConfirmWipe}
              className="px-3 py-1.5 text-[9.5px]"
            >
              WIPE IT
            </Button>
            <Button onClick={onCancelWipe} className="px-3 py-1.5 text-[9.5px]">
              KEEP
            </Button>
          </div>
        </div>
      ) : wipe === "nothing" ? (
        <p className="max-w-[52ch] font-mono text-[9.5px] leading-relaxed text-dim">
          <span className="u-label text-[9.5px] text-cyan">NOTHING TO DISCARD</span>{" "}
          — the exhibit is still exactly as the camera recorded it.
        </p>
      ) : holding ? (
        // Outranks the pressure line: under a deadline it is the more urgent
        // of the two, because it is the one the player can still act on.
        // The basis is what lets the bar wrap: without one, a phone gave the
        // notice whatever the two buttons left over — about 80px, seven
        // lines tall. With the case rail folded, a desktop column still
        // holds all of it on one row.
        <div className="flex min-w-0 flex-1 basis-80 items-center gap-3">
          <p
            className={`flex max-w-[54ch] items-center gap-2 font-mono text-[9.5px] leading-relaxed ${
              projected ? "text-cyan" : pending ? "text-amber" : "text-dim"
            }`}
          >
            <span
              className={`size-1.5 shrink-0 ${
                projected ? "bg-cyan" : pending ? "animate-blink bg-amber" : "bg-dim"
              }`}
            />
            {projected ? (
              <span>
                <span className="u-label text-[9.5px]">
                  PREVIEW · DEFOCUS {projectedDefocus}
                </span>{" "}
                — the rail is projecting it. Nothing reaches the exhibit until
                you apply it.
              </span>
            ) : pending ? (
              // Worded to be true before anything has been dragged as well as
              // after: the notice shows the moment a panel opens.
              <span>
                <span className="u-label text-[9.5px]">PREVIEW ONLY</span> —
                the exhibit has not received this yet. Apply it and the
                forensic rail reads it.
              </span>
            ) : (
              <span>
                <span className="u-label text-[9.5px]">PREVIEW</span> — this
                treatment is set on the exhibit when the panel closes.
              </span>
            )}
          </p>
          <Button
            variant="signal"
            onClick={onApply}
            className="shrink-0 px-3 py-1.5 text-[9.5px]"
          >
            APPLY ✓
          </Button>
        </div>
      ) : pending && lands === "at-once" && briefing?.panelHint ? (
        <p className="flex max-w-[58ch] items-center gap-2 font-mono text-[9.5px] leading-relaxed text-dim">
          <span className="size-1.5 shrink-0 bg-cyan" />
          <span>
            <span className="u-label text-[9.5px] text-cyan">
              {briefing.rail} · LANDS AT ONCE
            </span>{" "}
            — {briefing.panelHint}
          </span>
        </p>
      ) : (
        <p
          className={`max-w-[52ch] font-mono text-[9.5px] leading-relaxed ${
            pressured ? "text-danger/90" : dirty ? "text-faint" : "text-dim"
          }`}
        >
          {pressured ? (
            "Intake is about to pull the exhibit. Whatever is on the canvas gets filed."
          ) : dirty ? (
            "Exhibit altered. The rail reads the canvas as it currently stands."
          ) : (
            // The first thing a new player reads with the clock already
            // running. It used to restate the obvious — the exhibit is
            // unaltered — and leave the first move to be found; the two moves
            // the model rewards are named here instead, in the rail's words.
            <>
              Untouched — every identifier reads. Start with{" "}
              <span className="text-cyan">SCRUB › DEFOCUS</span> to soften the
              frame, or <span className="text-cyan">BLOCK</span> one target,
              and watch the strip above go dark.
            </>
          )}
        </p>
      )}

      <div className="flex items-center gap-3">
        {live && (
          <div className="hidden text-right md:block">
            <div className="u-label text-[8.5px] text-faint">
              {projected ? "IF APPLIED" : "PROJECTED OUTCOME"}
            </div>
            {/* Keyed on the outcome so a change lands as a slam rather than a
                recolour. Crossing into ACCEPTED is the moment the player has
                done enough — it happened as a quiet change of text colour in
                the corner of the screen, which is how it got missed. */}
            <div
              key={live.outcome}
              className={`outcome-slam u-label text-[11px] ${
                live.outcome === "ACCEPTED"
                  ? "text-clear [text-shadow:0_0_12px_var(--color-clear)]"
                  : live.outcome === "INSUFFICIENT"
                    ? "text-amber"
                    : "text-danger"
              }`}
            >
              {live.outcome}
            </div>
          </div>
        )}
        <Button
          variant="primary"
          onClick={onSubmit}
          className={`px-6 py-3 ${pressured ? "u-cta" : ""}`}
        >
          SUBMIT EVIDENCE
        </Button>
      </div>
    </div>
  );
}
