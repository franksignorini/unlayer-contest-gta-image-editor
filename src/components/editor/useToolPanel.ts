"use client";

/**
 * What the editor's tool panel is doing — the three questions the terminal
 * needs answered about it, none of which the library reports.
 *
 *   panelOpen  — is a panel open at all. Drives the focus layout.
 *   panelTool  — which one, by the heading rendered from our own rail label.
 *   pending    — is the player looking at something the exhibit has not
 *                actually received yet.
 *
 * `pending` is not "a panel is open", and treating it as one was wrong in the
 * direction that matters: shapes, text and brush strokes land on the canvas the
 * moment they are made, so the notice sat there insisting nothing had happened
 * while the forensic rail visibly moved in front of the player. So it asks the
 * question it can answer cheaply — has a new committed exhibit been analysed
 * since this panel opened — from the live analyser's own counter, so nothing
 * here re-encodes the canvas, and the notice clears on exactly the beat the
 * rail moves rather than a moment either side of it.
 */

import type { ImageEditorInstance } from "@unlayer/react-image-editor";
import type { RefObject } from "react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isPanelOpen, openPanelLabel } from "./commit";
import { RAIL_LABELS } from "./editor-config";

export function useToolPanel(
  editor: ImageEditorInstance | null,
  editorRoot: RefObject<HTMLDivElement | null>,
  committedSeq: number
) {
  const [pending, setPending] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTool, setPanelTool] = useState<string | null>(null);
  /** Latest analysed commit count, and the count when the open panel opened. */
  const seqRef = useRef(0);
  const seqAtPanelOpen = useRef<number | null>(null);

  useEffect(() => {
    seqRef.current = committedSeq;
  }, [committedSeq]);

  useEffect(() => {
    if (!editor) return;
    const root = editorRoot.current;
    let frame = 0;
    const check = () => {
      frame = 0;
      if (!isPanelOpen(root)) {
        seqAtPanelOpen.current = null;
        setPending(false);
        setPanelOpen(false);
        setPanelTool(null);
        return;
      }
      seqAtPanelOpen.current ??= seqRef.current;
      setPending(seqRef.current === seqAtPanelOpen.current);
      setPanelOpen(true);
      setPanelTool(openPanelLabel(root, RAIL_LABELS));
    };
    // The poll alone answered up to 250ms late, and the focus layout made that
    // visible: the panel squeezed the exhibit, then a beat later the rail
    // folded and gave the room back — a bounce on every tool click. Opening a
    // panel IS a DOM change inside the editor, so that runs the check on the
    // next frame; the poll stays as the backstop for `committedSeq`, which
    // moves without touching the DOM.
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    const observer = root ? new MutationObserver(schedule) : null;
    if (root) observer?.observe(root, { childList: true, subtree: true });
    const id = setInterval(check, 250);
    return () => {
      clearInterval(id);
      observer?.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [editor, editorRoot]);

  return { pending, panelOpen, panelTool };
}

/**
 * Whether the terminal is on its three-column layout (Tailwind's `lg`).
 *
 * The focus layout is a column-width change, so below `lg` — where the rails
 * stack — there is nothing to fold, and the rail must not be made inert
 * underneath a player who has scrolled down to read it.
 */
const WIDE_QUERY = "(min-width: 64rem)";

function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useWideTerminal(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false
  );
}
