"use client";

/**
 * Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z, because the editor ships neither.
 *
 * The library renders REVERT and REAPPLY as toolbar buttons and binds no keys
 * to them. That is a reasonable default for an editor embedded in a form; it
 * is the wrong one here, where the player has three minutes, both hands on the
 * exhibit, and thirty years of muscle memory telling them Ctrl+Z takes the
 * last thing back. Pressing it and getting nothing does not read as "this app
 * has no undo" — it reads as "the last thing I did is stuck", and the player
 * spends clock working out which.
 *
 * It drives the editor's own controls rather than any private history, found
 * by the `title` the editor renders from our `translations` entries. So the
 * shortcut can never diverge from the buttons, and if the library ever stops
 * rendering those titles the shortcut simply stops firing — the toolbar is
 * still right there.
 */

import { useEffect } from "react";
import type { RefObject } from "react";
import { audio } from "@/lib/audio/engine";
import { controlByTitle } from "./commit";
import { REDO_LABEL, UNDO_LABEL } from "./editor-config";

/**
 * Never steal the shortcut from a field the player is typing in — the editor's
 * own text tool and the sticker search are both plain inputs, and undo inside
 * them belongs to the browser.
 */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.isContentEditable === true
  );
}

export function useEditorShortcuts(
  root: RefObject<HTMLDivElement | null>,
  /** Off until the editor has mounted; there is nothing to drive before that. */
  enabled: boolean
) {
  useEffect(() => {
    if (!enabled) return;

    const onKey = (event: KeyboardEvent) => {
      // Alt+Ctrl+Z is a different shortcut on some platforms; leave it alone.
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

      const key = event.key.toLowerCase();
      const redo = key === "y" || (key === "z" && event.shiftKey);
      const undo = key === "z" && !event.shiftKey;
      if ((!undo && !redo) || isTyping(event.target)) return;

      const control = controlByTitle(
        root.current,
        redo ? REDO_LABEL : UNDO_LABEL
      );
      // Not found, or nothing left in that direction: let the key through
      // rather than swallowing it into a no-op.
      if (!control || control.disabled) return;

      event.preventDefault();
      control.click();
      audio.cue("click");
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [root, enabled]);
}
