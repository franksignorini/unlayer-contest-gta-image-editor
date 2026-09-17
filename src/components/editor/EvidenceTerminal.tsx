"use client";

/**
 * The terminal — the centrepiece screen.
 *
 * Composition rule: the exhibit dominates. The rails are equipment bolted
 * around it, and they never take space from it at wide sizes. The editor is
 * given a hard minimum height so its own tool rail is never crushed.
 *
 * At lg and up the screen is bounded to exactly the viewport and does not
 * scroll. That is not tidiness — the editor's tool panels are tall (SCRUB
 * alone carries a preset grid and ten sliders), and in an unbounded column the
 * library grows to fit them instead of scrolling them. On a 1280x800 laptop
 * that pushed the photograph almost entirely below the fold: the player was
 * dragging DEFOCUS with the exhibit out of sight. Bounded, the library's own
 * `overflow-y-auto` panel body does the scrolling, which is what it was built
 * to do, and the exhibit never moves.
 */

import type { ImageEditorInstance } from "@unlayer/react-image-editor";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  EvidenceModification,
  ForensicResult,
  Mission,
  Submission,
} from "@/types";
import { audio } from "@/lib/audio/engine";
import { SoundToggle, useSoundEnabled } from "@/components/audio/SoundToggle";
import {
  DeadlineClock,
  DeadlineDrain,
  deadlineStage,
  type DeadlineStage,
} from "@/components/hud/DeadlineClock";
import { SuspectId } from "@/components/hud/SuspectId";
import { ImageEditorFrame } from "./ImageEditorFrame";
import { commitAndRead } from "./commit";
import { CaseRail } from "./CaseRail";
import { RailSpine } from "./RailSpine";
import { ForensicRail } from "./ForensicRail";
import { SubmitBar, type WipeState } from "./SubmitBar";
import { FILING_MS, FilingOverlay } from "./FilingOverlay";
import { prefersReducedMotion } from "@/components/ui/primitives";
import { buildEditorOptions } from "./editor-config";
import { useEditorShortcuts } from "./useEditorShortcuts";
import { useLiveForensics } from "./useLiveForensics";
import { useToolPanel, useWideTerminal } from "./useToolPanel";

interface Props {
  mission: Mission;
  openedAt: number | null;
  live: ForensicResult | null;
  modifications: EvidenceModification[];
  dirty: boolean;
  onLiveResult(result: ForensicResult, added: EvidenceModification[]): void;
  onDirtyChange(dirty: boolean): void;
  /** The exhibit was wiped back to the capture; the ticker starts again. */
  onWiped(): void;
  onSubmit(submission: Submission): void;
}

export function EvidenceTerminal({
  mission,
  openedAt,
  live,
  modifications,
  dirty,
  onLiveResult,
  onDirtyChange,
  onWiped,
  onSubmit,
}: Props) {
  const [editor, setEditor] = useState<ImageEditorInstance | null>(null);
  const [remaining, setRemaining] = useState(mission.timeLimitSeconds);
  const submitted = useRef(false);
  const editorRoot = useRef<HTMLDivElement | null>(null);
  const soundOn = useSoundEnabled();
  /** Last whole second we sounded, so the 250ms timer only beats once a second. */
  const lastBeat = useRef(-1);
  /** The editor's DISCARD, waiting on a second press in the submit bar. */
  const [wipe, setWipe] = useState<WipeState>("idle");
  /** Set the moment the exhibit is submitted: the handoff is on screen. */
  const [filing, setFiling] = useState<Submission["trigger"] | null>(null);

  // Memoised per case: a fresh object identity here would remount the editor
  // and destroy the player's work.
  const options = useMemo(
    () => buildEditorOptions(mission.tools),
    [mission.tools]
  );

  // The log gets a voice: a cue only when the analyser actually noticed
  // something change, which is the same signal the modification ticker uses.
  const handleLiveResult = useCallback(
    (result: ForensicResult, added: EvidenceModification[]) => {
      if (added.length) audio.cue("commit");
      onLiveResult(result, added);
    },
    [onLiveResult]
  );

  // Ctrl/Cmd+Z and its redo, driving the editor's own REVERT / REAPPLY.
  useEditorShortcuts(editorRoot, editor !== null);

  const { analysing, committedSeq, poke } = useLiveForensics({
    mission,
    editor,
    openedAt,
    containerRef: editorRoot,
    onResult: handleLiveResult,
    onDirtyChange,
  });

  const submit = useCallback(
    async (trigger: Submission["trigger"]) => {
      if (submitted.current) return;
      submitted.current = true;
      audio.cue("submit");
      setFiling(trigger);
      const filingStarted = performance.now();

      // Close any open tool panel FIRST. Until it closes, the effect the player
      // is looking at is a preview the canvas has never seen, and `getImage()`
      // returns the exhibit untouched — so a run that ends with a panel open
      // files a pristine capture and throws the whole edit away silently. That
      // is not a hypothetical: a 55% defocus submitted on the deadline scored a
      // pixel delta of 0.00%. See commit.ts.
      //
      // Fall back to the untouched original if the canvas still can't be read —
      // the exhibit gets filed regardless, which is exactly the threat the
      // clock makes.
      const dataUrl = await commitAndRead(editor, editorRoot.current);

      // The read is usually instant; the handoff is not. Hold the dispatch
      // until the collapse has been seen to finish, or the analysis screen
      // cuts in over the top of it.
      const hold = filingHoldMs() - (performance.now() - filingStarted);
      if (hold > 0) await new Promise((resolve) => setTimeout(resolve, hold));

      onSubmit({
        dataUrl: dataUrl ?? mission.image,
        trigger,
        submittedAt: Date.now(),
      });
    },
    [editor, mission.image, onSubmit]
  );

  // DISCARD asks first, and says so when there is nothing to discard — a
  // control that silently does nothing is the one the player stops trusting.
  const handleDiscard = useCallback(() => {
    audio.cue("click");
    setWipe(dirty ? "armed" : "nothing");
  }, [dirty]);

  const confirmWipe = useCallback(() => {
    setWipe("idle");
    if (!editor) return;
    try {
      editor.reset();
    } catch {
      // Torn down mid-press: nothing left to wipe.
      return;
    }
    audio.cue("power-off");
    onWiped();
    // The wipe is confirmed out here in the submit bar, so the editor saw no
    // input for it — the rail has to be told the canvas just changed.
    poke();
  }, [editor, onWiped, poke]);

  // Either state lapses on its own. An armed wipe left hanging would sit in
  // the one strip the player reads for PREVIEW ONLY and the deadline warning.
  useEffect(() => {
    if (wipe === "idle") return;
    const id = setTimeout(() => setWipe("idle"), wipe === "armed" ? 6000 : 2600);
    return () => clearTimeout(id);
  }, [wipe]);

  // The latest submit, for the clock. Depending on `submit` directly restarted
  // the clock whenever its identity changed — and it changes when the editor
  // finishes mounting, so on a cold load the digits ran down for as long as
  // the toolchain took to arrive and then jumped back to the full limit.
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });

  // The clock arms when the exhibit is actually editable: the toolchain comes
  // from a CDN, and seconds spent watching MOUNTING EXHIBIT are not seconds the
  // player had with the photograph. The fallback keeps the promise the failure
  // state makes — a terminal that never comes up still files the capture.
  const [mountTimedOut, setMountTimedOut] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setMountTimedOut(true), CLOCK_ARM_FALLBACK_MS);
    return () => clearTimeout(id);
  }, []);
  const armed = editor !== null || mountTimedOut;

  // The clock. At zero the exhibit is filed in whatever state it is in.
  useEffect(() => {
    if (!armed) return;
    // No reset of `remaining` here: GameShell keys this component per case, so
    // a new case mounts fresh with the correct initial value.
    const startedAt = Date.now();
    const id = setInterval(() => {
      // Filed: the clock stops where it stood, and so does its heartbeat —
      // the handoff is playing over it.
      if (submitted.current) return;
      const left =
        mission.timeLimitSeconds - (Date.now() - startedAt) / 1000;
      setRemaining(left);

      // One beat per whole second, escalating with the stage: a calm room is
      // silent, then it starts ticking, then it develops a pulse. Driven from
      // here rather than from a second timer so the sound and the digits can
      // never drift apart.
      const second = Math.ceil(left);
      if (left > 0 && second !== lastBeat.current) {
        lastBeat.current = second;
        const stage = deadlineStage(left, mission.timeLimitSeconds);
        if (stage === "elevated") audio.cue("tick", 0.25);
        else if (stage === "urgent") audio.cue("heart", 0.35);
        else if (stage === "critical") audio.cue("heart", 1);
      }

      if (left <= 0) {
        clearInterval(id);
        void submitRef.current("timeout");
      }
    }, 250);
    return () => clearInterval(id);
  }, [armed, mission.timeLimitSeconds]);

  const { pending, panelOpen, panelTool } = useToolPanel(
    editor,
    editorRoot,
    committedSeq
  );
  /** The player asked for the case rail back while this panel is open. */
  const [railHeld, setRailHeld] = useState(false);
  // A held rail was asked for during that panel, not for the case. Reset
  // during render on the edge, rather than from an effect a frame late.
  const [heldFor, setHeldFor] = useState(panelOpen);
  if (heldFor !== panelOpen) {
    setHeldFor(panelOpen);
    if (!panelOpen) setRailHeld(false);
  }

  const stage = deadlineStage(remaining, mission.timeLimitSeconds);

  /**
   * Focus layout: while a tool panel is open the case rail folds to a spine.
   *
   * The editor's panel takes ~290px out of the exhibit column, and the exhibit
   * is width-bound, so the photograph paid for it directly: with SCRUB open it
   * was 362px wide on a 1280x800 laptop and 194px at 1024 — the player was
   * dragging DEFOCUS over a thumbnail. The rail is reference material the
   * player has already read by the time they pick a tool, and the targets stay
   * on screen in the identification strip, so it is the column that yields.
   *
   * Still one row and still three tracks, only the first one narrows — see
   * the grid note in CLAUDE.md for why that matters. The spine gives it back
   * on a click, for as long as that panel stays open.
   */
  const wide = useWideTerminal();
  const railCollapsed = wide && panelOpen && !railHeld;

  // The bed plays across the whole game; the terminal is what puts pressure on
  // it. Keyed on `soundOn` too, so enabling audio mid-case applies the current
  // stage straight away rather than waiting for the next one — before that the
  // engine has no graph to ramp.
  //
  // Reset on the way out: the analysis screen inherits this bed, and it should
  // not inherit the panic the player left the terminal in.
  useEffect(() => {
    audio.setTension(
      { calm: 0, elevated: 0.3, urgent: 0.65, critical: 1 }[stage]
    );
    return () => audio.setTension(0);
  }, [stage, soundOn]);

  return (
    <div
      className={`u-grid flex min-h-dvh flex-col bg-void lg:h-dvh lg:min-h-0 lg:overflow-hidden ${
        stage === "critical"
          ? "u-screen-alarm"
          : stage === "urgent"
            ? "shadow-[inset_0_0_140px_-45px_var(--color-danger)]"
            : ""
      }`}
    >
      <TerminalHeader mission={mission} remaining={remaining} stage={stage} />

      {/* The loop still completes on a small screen, but the exhibit needs
          room to work — say so rather than letting it feel broken. */}
      <p className="u-label border-b border-amber/30 bg-amber/5 px-3 py-2 text-[9px] leading-relaxed text-amber lg:hidden">
        TERMINAL BUILT FOR A LARGER DISPLAY — THE EXHIBIT NEEDS ROOM TO WORK
      </p>

      <div
        // The column snaps rather than animates. Every change of width is a
        // resize of the editor's canvas, and the canvas is cleared on resize
        // and redrawn a frame later — so a 300ms slide was a 300ms flicker of
        // the exhibit, caught blank mid-transition. One snap is one resize,
        // landing on the same beat as the panel's own.
        className={`grid min-h-0 flex-1 gap-2.5 p-2.5 lg:grid-rows-[minmax(0,1fr)] ${
          railCollapsed
            ? "lg:grid-cols-[30px_minmax(0,1fr)_232px] xl:grid-cols-[30px_minmax(0,1fr)_268px]"
            : "lg:grid-cols-[196px_minmax(0,1fr)_232px] xl:grid-cols-[248px_minmax(0,1fr)_268px]"
        }`}
      >
        {/* left rail */}
        {/* Taken out of flow from lg up. The rail is reference material — the
            case file, the manifest, the tool legend — and it is the tallest
            thing in the row, so in flow it alone decides how far the terminal
            scrolls. Out of flow, the row follows the exhibit, and the rail
            scrolls inside whatever height that leaves.

            Pinned at its full width rather than filling the track, so folding
            the track clips the rail instead of reflowing it at 30px wide. */}
        {/* Below lg the columns stack, and in source order the exhibit came
            after the whole case rail — a phone player started the clock and
            then scrolled past ~1500px of reference material to reach the
            photograph. Stacked, the exhibit leads, the live rail follows it,
            and the reference material closes the page. */}
        <div className="relative min-h-0 max-lg:order-last lg:overflow-hidden">
          <div
            inert={railCollapsed}
            className={`h-full lg:absolute lg:inset-y-0 lg:left-0 lg:w-[196px] lg:transition-opacity lg:duration-200 xl:w-[248px] ${
              railCollapsed ? "lg:opacity-0" : "lg:opacity-100"
            }`}
          >
            <CaseRail mission={mission} />
          </div>
          {railCollapsed && (
            <RailSpine mission={mission} onOpen={() => setRailHeld(true)} />
          )}
        </div>

        {/* the exhibit */}
        <div className="flex min-h-0 flex-col gap-2.5 max-lg:order-first">
          {/* Above the canvas, never over it: the editor has to stay
              pixel-true and clickable. */}
          <SuspectId mission={mission} live={live} />
          <ImageEditorFrame
            image={mission.image}
            options={options}
            onReady={setEditor}
            onCommit={() => submit("editor-save")}
            onDiscard={handleDiscard}
            containerRef={editorRoot}
            minHeight={520}
          />
          <SubmitBar
            stage={stage}
            dirty={dirty}
            pending={pending}
            panelTool={panelTool}
            live={live}
            wipe={wipe}
            onConfirmWipe={confirmWipe}
            onCancelWipe={() => setWipe("idle")}
            onSubmit={() => submit("manual")}
          />
        </div>

        {/* right rail */}
        <div className="min-h-0">
          <ForensicRail
            mission={mission}
            live={live}
            modifications={modifications}
            analysing={analysing}
            dirty={dirty}
          />
        </div>
      </div>

      {filing && <FilingOverlay trigger={filing} />}
    </div>
  );
}

/**
 * How long the clock waits for the editor before running anyway. Generous: a
 * cold CDN fetch on a conference connection is the case it exists for.
 */
const CLOCK_ARM_FALLBACK_MS = 15_000;

/** Reduced motion gets the stamp for a moment, not the whole collapse. */
function filingHoldMs(): number {
  return prefersReducedMotion() ? 450 : FILING_MS;
}

/**
 * The header carries the clock.
 *
 * It is sticky because the terminal is taller than most viewports: a deadline
 * that scrolls out of view is a deadline the player stops feeling. Centred in
 * a three-column grid so the digits hold the same spot no matter how wide the
 * identity and status blocks run.
 */
function TerminalHeader({
  mission,
  remaining,
  stage,
}: {
  mission: Mission;
  remaining: number;
  stage: DeadlineStage;
}) {
  return (
    <header
      className={`sticky top-0 z-30 shrink-0 border-b bg-panel/95 backdrop-blur-sm ${
        stage === "critical"
          ? "border-danger/70"
          : stage === "urgent"
            ? "border-danger/45"
            : "border-line"
      }`}
    >
      <DeadlineDrain
        remaining={remaining}
        total={mission.timeLimitSeconds}
        stage={stage}
      />

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-3.5 py-2">
        <div className="flex items-baseline gap-3">
          <span className="u-display text-[15px] text-bone">VICE EVIDENCE</span>
          <span className="u-label hidden text-[9px] text-ghost lg:inline">
            EVIDENCE INTAKE — UNAUTHORISED SESSION
          </span>
        </div>

        <DeadlineClock remaining={remaining} stage={stage} />

        <div className="flex items-center justify-end gap-3">
          <span className="u-label hidden text-[9px] text-faint xl:inline">
            {mission.cameraId}
          </span>
          <span className="u-label text-[9px] text-magenta">
            WRITE ACCESS ACTIVE
          </span>
          <SoundToggle />
        </div>
      </div>
    </header>
  );
}
