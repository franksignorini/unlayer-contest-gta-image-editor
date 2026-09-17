"use client";

/**
 * Live forensic readout while the player edits.
 *
 * The library exposes no per-edit events, so the only way to know what the
 * player did is to watch the canvas. We read `getImage()`, skip when the data
 * URL is unchanged (decoding is the expensive step, comparison is not), and run
 * the analysis off the interaction path.
 *
 * The analysis run here is the SAME one the verdict runs — same resolution,
 * same constants. The rail used to run a cheaper, lower-resolution variant and
 * could therefore project a different outcome from the one the player was
 * eventually graded on. Throttling is the only lever now; scoring is not.
 *
 * Two library behaviours shape this:
 *   - `getImage()` is null until the exhibit has decoded.
 *   - `getImage()` only reflects COMMITTED edits. While a tool panel is open
 *     the effect is a live preview, so the readout moves when an operation
 *     actually lands, not while it is being previewed.
 *
 * "Has this exhibit been altered" is answered from the canvas too, not from
 * `hasChanges()`. That latches true for the rest of the session on the first
 * edit — and the editor counts merely opening a tool panel as one, so the rail
 * announced ALTERED over an exhibit whose every meter still read pristine. The
 * editor's PNG is byte-stable while the canvas is unchanged (the skip above
 * relies on exactly that), so any difference from a settled baseline is a
 * real, committed edit — and an undo back to the original correctly reads as
 * unaltered again.
 *
 * "Settled" is the catch. The FIRST frame read is not always the frame the
 * canvas settles on: on a loaded machine the editor can hand back an export
 * that differs by a few bytes from the one it produces a second later, and the
 * rail then flipped to ALTERED over an exhibit nobody had touched, every meter
 * still reading 100%. Reproduced at 1440x900 with the CPU busy — exactly the
 * judge's laptop running a screen recorder. So the baseline follows the canvas
 * until the player first reaches into the editor. Nothing can be altered
 * without a pointer or a key landing in it, so nothing real is ever absorbed.
 *
 * And reading is not free, which is why reads follow the player rather than
 * the clock. `getImage()` hands back a cached export while the canvas is
 * untouched, but once it holds a single edit every call re-renders and
 * re-encodes the whole exhibit — ~50ms on the main thread, measured on the
 * running editor, whether or not anything changed. Polled blind every 1.5s,
 * that was a hitch on every beat for the rest of the case after the player's
 * first move, landing in the middle of slider drags and shape moves. Now:
 * nothing is read while a pointer is held down inside the editor, a release or
 * a click asks for a read straight away, and a few seconds with no input stops
 * reading altogether — nothing can change the canvas without one.
 */

import type { ImageEditorInstance } from "@unlayer/react-image-editor";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { EvidenceModification, ForensicResult, Mission } from "@/types";
import { ForensicAnalyzer } from "@/lib/forensics/analyze";
import { deriveModifications } from "@/lib/forensics/score";
import { safeGetImage } from "./commit";

/** How often the canvas is read while the player is working. */
const POLL_MS = 1100;

/**
 * How soon after a release, click or key the canvas is read. Long enough for a
 * shape or a closed panel to land, short enough that the rail reads as a
 * reaction to the move rather than a report that turns up later.
 */
const SETTLE_MS = 180;

/**
 * With no input inside the editor for this long, reading stops until the next
 * one. Generous on purpose: a filter can take a moment to flatten into the
 * canvas after its panel closes — and every detected change extends the
 * window, so a change that lands in two steps is still followed.
 */
const IDLE_AFTER_MS = 5000;

interface Options {
  mission: Mission;
  editor: ImageEditorInstance | null;
  /** Case start time, for modification timestamps. */
  openedAt: number | null;
  /** The editor's own DOM — the first input inside it freezes the baseline. */
  containerRef: RefObject<HTMLElement | null>;
  onResult(result: ForensicResult, added: EvidenceModification[]): void;
  onDirtyChange(dirty: boolean): void;
}

export function useLiveForensics({
  mission,
  editor,
  openedAt,
  containerRef,
  onResult,
  onDirtyChange,
}: Options) {
  const [analysing, setAnalysing] = useState(false);
  /**
   * Bumped every time a genuinely new committed exhibit has been analysed.
   *
   * The terminal needs to know whether an open tool panel is holding its
   * effect back as a preview, and the tools differ: shapes, text and brush
   * strokes land on the canvas immediately, while the filter panels do not.
   * Rather than ask the DOM which panel is open, the terminal watches this —
   * if it has not moved since the panel opened, nothing has landed. It is a
   * counter rather than the data URL itself so that nothing forces a render
   * with a multi-megabyte string in it.
   */
  const [committedSeq, setCommittedSeq] = useState(0);

  // Keep callbacks in refs so the polling effect doesn't restart on every
  // render of the parent.
  const onResultRef = useRef(onResult);
  const onDirtyRef = useRef(onDirtyChange);
  useEffect(() => {
    onResultRef.current = onResult;
    onDirtyRef.current = onDirtyChange;
  });

  const analyzerRef = useRef<ForensicAnalyzer | null>(null);
  const lastDataUrl = useRef<string | null>(null);
  const lastResult = useRef<ForensicResult | null>(null);
  /** The exhibit as the editor renders it before the player touches anything. */
  const baselineDataUrl = useRef<string | null>(null);
  /** The player has reached into the editor; the baseline stops following. */
  const touched = useRef(false);
  /**
   * Asks the loop for a read soon. Owned by the polling effect; exposed so a
   * change made from outside the editor — DISCARD's wipe is confirmed in our
   * own submit bar, not inside the editor — is still picked up.
   */
  const kickRef = useRef<() => void>(() => {});

  // Build the analyser once per case. Construction pre-computes every derived
  // view of the original, which is the costly half of the work.
  useEffect(() => {
    let cancelled = false;
    analyzerRef.current = null;
    lastDataUrl.current = null;
    lastResult.current = null;
    baselineDataUrl.current = null;
    touched.current = false;
    ForensicAnalyzer.create(mission)
      .then((a) => {
        if (!cancelled) analyzerRef.current = a;
      })
      .catch((err) => {
        console.error("[vice-evidence] live analyser unavailable", err);
      });
    return () => {
      cancelled = true;
    };
  }, [mission]);

  useEffect(() => {
    const root = containerRef.current;
    if (!editor || !root) return;
    let cancelled = false;
    let busy = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    /** A pointer went down inside the editor and has not come back up. */
    let held = false;
    let lastActivity = performance.now();
    /** A read was asked for while an analysis was still running. */
    let kickedWhileBusy = false;

    const schedule = (ms: number) => {
      if (cancelled) return;
      clearTimeout(timer);
      timer = setTimeout(tick, ms);
    };

    const kick = () => {
      lastActivity = performance.now();
      if (busy) kickedWhileBusy = true;
      else schedule(SETTLE_MS);
    };
    kickRef.current = kick;

    async function tick() {
      timer = undefined;
      if (cancelled) return;

      const analyzer = analyzerRef.current;
      if (!analyzer || busy) {
        schedule(POLL_MS);
        return;
      }

      // Before the first touch the export is cached, so reading it is free —
      // and the baseline has to keep following the canvas regardless. After
      // it, reads stay off the interaction path.
      if (touched.current) {
        // Mid-gesture: the release asks for a read. The timer is only a
        // backstop for a release that never arrives.
        if (held) {
          schedule(POLL_MS);
          return;
        }
        // Nothing has happened inside the editor for a while, so nothing can
        // have changed. Stop until something does; the next input kicks.
        if (performance.now() - lastActivity > IDLE_AFTER_MS) return;
      }

      const dataUrl = safeGetImage(editor);

      // Until the player first touches the editor, whatever the canvas holds
      // IS the untouched exhibit; after that, everything is measured against
      // it. See the note at the top of this file for why `hasChanges()` cannot
      // answer this, and why the first read alone is not a safe baseline.
      if (dataUrl) {
        if (!touched.current) baselineDataUrl.current = dataUrl;
        onDirtyRef.current(dataUrl !== baselineDataUrl.current);
      }

      // Null before decode; identical means nothing was committed since the
      // last read, so there is nothing to re-analyse.
      if (!dataUrl || dataUrl === lastDataUrl.current) {
        schedule(POLL_MS);
        return;
      }

      busy = true;
      setAnalysing(true);
      try {
        const result = await analyzer.analyze(dataUrl);
        if (cancelled) return;
        const at = openedAt ? Date.now() - openedAt : 0;
        const added = deriveModifications(lastResult.current, result, at);
        lastDataUrl.current = dataUrl;
        lastResult.current = result;
        // A change can land in more than one step, so a detected change keeps
        // the loop awake as though the player had just moved.
        lastActivity = performance.now();
        setCommittedSeq((n) => n + 1);
        onResultRef.current(result, added);
      } catch (err) {
        console.error("[vice-evidence] live analysis failed", err);
      } finally {
        busy = false;
        if (!cancelled) {
          setAnalysing(false);
          schedule(kickedWhileBusy ? SETTLE_MS : POLL_MS);
          kickedWhileBusy = false;
        }
      }
    }

    // Capture phase, so a control that stops propagation still counts. `click`
    // and `input` as well as the raw pointer and key: assistive tech and
    // scripted drivers activate controls without ever sending a pointerdown.
    // The first of any of them freezes the baseline.
    const onPointerDown = () => {
      touched.current = true;
      held = true;
      lastActivity = performance.now();
    };
    const onInput = () => {
      touched.current = true;
      kick();
    };
    // On the window, not the editor: a drag that ends outside the editor still
    // ends, and the release is exactly when a shape or a stroke has landed.
    const onRelease = () => {
      if (!held) return;
      held = false;
      kick();
    };
    const kinds = ["keydown", "click", "input", "change"];
    root.addEventListener("pointerdown", onPointerDown, true);
    for (const kind of kinds) root.addEventListener(kind, onInput, true);
    window.addEventListener("pointerup", onRelease, true);
    window.addEventListener("pointercancel", onRelease, true);
    window.addEventListener("blur", onRelease);

    // A short lead-in lets the exhibit decode before the first read.
    schedule(400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      kickRef.current = () => {};
      root.removeEventListener("pointerdown", onPointerDown, true);
      for (const kind of kinds) root.removeEventListener(kind, onInput, true);
      window.removeEventListener("pointerup", onRelease, true);
      window.removeEventListener("pointercancel", onRelease, true);
      window.removeEventListener("blur", onRelease);
    };
  }, [editor, openedAt, containerRef]);

  /** Read the canvas soon, for a change made from outside the editor. */
  const poke = useCallback(() => kickRef.current(), []);

  return { analysing, committedSeq, poke };
}
