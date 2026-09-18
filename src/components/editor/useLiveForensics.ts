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
 *   - `getImage()` is the editor's cached base image while the canvas holds
 *     no overlay objects, and a live re-render of the canvas once it does. So
 *     on a clean exhibit an open filter panel's preview never reaches it (see
 *     the projection note below), and with a bar or a marking placed it does.
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
 *
 * One case the canvas cannot answer, and it is the most important one. On an
 * exhibit with no overlay objects the editor's export is its cached base image,
 * so an open SCRUB panel's preview never reaches `getImage()` — and a clean
 * exhibit is where every player starts, reaching for exactly the slider the
 * terminal tells them to. So when a read comes back unchanged while DEFOCUS is
 * the only thing in play, the preview is modelled instead (see
 * lib/forensics/projection) and reported separately as a `projection`, never
 * as `live`: it is what WILL land, and it is replaced by the real read the
 * moment the panel commits. The ticker, the dirty flag and `committedSeq` only
 * ever describe the exhibit itself.
 */

import type { ImageEditorInstance } from "@unlayer/react-image-editor";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { EvidenceModification, ForensicResult, Mission } from "@/types";
import { ForensicAnalyzer } from "@/lib/forensics/analyze";
import { loadImage } from "@/lib/forensics/image";
import { renderDefocus } from "@/lib/forensics/projection";
import { deriveModifications } from "@/lib/forensics/score";
import { safeGetImage, type ScrubReading } from "./commit";

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

/**
 * How long a projection is held after its panel closes, waiting for the commit
 * it describes to reach the export — and how often the export is re-read in
 * that window. Held rather than dropped so the rail does not snap back to the
 * old exhibit for the few frames the flatten takes, then forward again.
 */
const LANDING_GRACE_MS = 2500;
const LANDING_POLL_MS = 120;

/**
 * Whether two analyses describe the same exhibit, as far as anything on screen
 * can tell — every gauge, every target, every signal within rounding noise.
 */
function sameReading(a: ForensicResult, b: ForensicResult): boolean {
  const close = (x: number, y: number) => Math.abs(x - y) < 1e-3;
  if (
    !close(a.identification, b.identification) ||
    !close(a.integrity, b.integrity) ||
    !close(a.suspicion, b.suspicion)
  ) {
    return false;
  }
  const signals = Object.keys(a.signals) as (keyof ForensicResult["signals"])[];
  if (signals.some((k) => !close(a.signals[k], b.signals[k]))) return false;
  return a.findings.every((f, i) => {
    const g = b.findings[i];
    return g && g.targetId === f.targetId && close(f.legibility, g.legibility);
  });
}

/** A modelled SCRUB preview: what the rail will read once the panel commits. */
export interface Projection {
  result: ForensicResult;
  /** The DEFOCUS setting it models. */
  defocus: number;
}

interface Options {
  mission: Mission;
  editor: ImageEditorInstance | null;
  /** Case start time, for modification timestamps. */
  openedAt: number | null;
  /** The editor's own DOM — the first input inside it freezes the baseline. */
  containerRef: RefObject<HTMLElement | null>;
  onResult(result: ForensicResult, added: EvidenceModification[]): void;
  onDirtyChange(dirty: boolean): void;
  /**
   * Reads the SCRUB panel, or null when it is not the panel on screen. Only
   * consulted when a read came back unchanged — i.e. when whatever the player
   * is previewing has not reached `getImage()`.
   */
  readScrub?: () => ScrubReading | null;
}

export function useLiveForensics({
  mission,
  editor,
  openedAt,
  containerRef,
  onResult,
  onDirtyChange,
  readScrub,
}: Options) {
  const [analysing, setAnalysing] = useState(false);
  const [projection, setProjection] = useState<Projection | null>(null);
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
  const readScrubRef = useRef(readScrub);
  useEffect(() => {
    onResultRef.current = onResult;
    onDirtyRef.current = onDirtyChange;
    readScrubRef.current = readScrub;
  });

  /**
   * The projection on screen, and the exhibit it was modelled on — so an
   * unchanged panel over an unchanged exhibit is not modelled twice.
   */
  const projectionRef = useRef<(Projection & { base: string }) | null>(null);
  /** The committed exhibit, decoded once for however many projections use it. */
  const decodedBase = useRef<{ url: string; image: HTMLImageElement } | null>(
    null
  );

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
    projectionRef.current = null;
    decodedBase.current = null;
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
    /** When the panel behind an on-screen projection was seen to close. */
    let landingSince: number | null = null;

    const publishProjection = (next: (Projection & { base: string }) | null) => {
      projectionRef.current = next;
      setProjection(next ? { result: next.result, defocus: next.defocus } : null);
    };

    const baseImage = async (url: string): Promise<HTMLImageElement> => {
      const cached = decodedBase.current;
      if (cached && cached.url === url) return cached.image;
      const image = await loadImage(url);
      decodedBase.current = { url, image };
      return image;
    };

    /**
     * The read came back unchanged. If that is because a DEFOCUS preview is
     * being held out of the export, score the preview as modelled. Returns how
     * soon to read again, or null for the normal cadence.
     */
    async function project(
      analyzer: ForensicAnalyzer,
      dataUrl: string | null
    ): Promise<number | null> {
      const reading = readScrubRef.current?.() ?? null;
      const shown = projectionRef.current;

      if (!reading) {
        if (!shown) return null;
        // The panel has gone, and the commit the projection describes is on
        // its way into the export. Hold the projection for that read instead
        // of snapping the rail back to the old exhibit for the frames between.
        landingSince ??= performance.now();
        if (performance.now() - landingSince > LANDING_GRACE_MS) {
          publishProjection(null);
          return null;
        }
        return LANDING_POLL_MS;
      }
      landingSince = null;

      if (
        !dataUrl ||
        !reading.modelled ||
        !reading.hidden ||
        reading.defocus <= 0
      ) {
        if (shown) publishProjection(null);
        return null;
      }
      if (shown && shown.defocus === reading.defocus && shown.base === dataUrl) {
        return null;
      }

      busy = true;
      setAnalysing(true);
      try {
        const base = await baseImage(dataUrl);
        if (cancelled) return null;
        const result = analyzer.analyzeSource(renderDefocus(base, reading.defocus));
        publishProjection({ result, defocus: reading.defocus, base: dataUrl });
      } catch (err) {
        console.error("[vice-evidence] DEFOCUS projection failed", err);
      } finally {
        busy = false;
        if (!cancelled) setAnalysing(false);
      }
      // The slider can have moved again while that ran.
      const again = kickedWhileBusy;
      kickedWhileBusy = false;
      return again ? SETTLE_MS : null;
    }

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
      // last read, so there is nothing to re-analyse — though there may be a
      // preview the export cannot see, which is the projection's job.
      if (!dataUrl || dataUrl === lastDataUrl.current) {
        const next = touched.current ? await project(analyzer, dataUrl) : null;
        if (!cancelled) schedule(next ?? POLL_MS);
        return;
      }

      busy = true;
      setAnalysing(true);
      try {
        const result = await analyzer.analyze(dataUrl);
        if (cancelled) return;
        const at = openedAt ? Date.now() - openedAt : 0;
        const added = deriveModifications(lastResult.current, result, at);
        // New bytes are not always a new exhibit. Once the canvas holds an
        // overlay object every export is a fresh re-render, and opening a
        // panel re-encodes the same pixels differently — so the counter only
        // moves when the reading does. Counting bytes flipped PREVIEW ONLY off
        // the instant SCRUB opened over a placed bar, before anything had been
        // dragged. Nor is the first read a commit: it is the baseline, and a
        // player quick enough to open SCRUB before it landed saw the notice
        // announce that something had reached the exhibit.
        const moved =
          lastResult.current !== null &&
          !sameReading(lastResult.current, result);
        lastDataUrl.current = dataUrl;
        lastResult.current = result;
        // A change can land in more than one step, so a detected change keeps
        // the loop awake as though the player had just moved.
        lastActivity = performance.now();
        if (moved) setCommittedSeq((n) => n + 1);
        onResultRef.current(result, added);
        // The exhibit itself has moved, so whatever was projected has either
        // landed or been abandoned. Dropped in the same batch as the real
        // result, so the rail goes from one straight to the other.
        landingSince = null;
        if (projectionRef.current) publishProjection(null);
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

  return { analysing, committedSeq, poke, projection };
}
