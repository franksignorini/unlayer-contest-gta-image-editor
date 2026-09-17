/**
 * Committing a pending tool panel.
 *
 * The editor has no "apply" in its API. While a tool panel is open its effect
 * is a live preview only: `getImage()` returns the exhibit byte-identical to
 * how it was before the panel opened, and the effect is flattened into the
 * canvas when the panel closes. `hasChanges()` latches true on the first edit
 * and cannot tell the two apart.
 *
 * That combination costs the player their entire run. Drag DEFOCUS, watch the
 * photograph go soft, run out of clock — and what gets filed is the untouched
 * capture, at 100% identification, with no indication that anything was lost.
 * Measured, not theorised: a 55% defocus submitted on the deadline scored a
 * pixel delta of exactly 0.00%.
 *
 * So the panel is closed for the player before the canvas is read. The control
 * is found by the `title` the editor renders from OUR OWN `translations` entry
 * (`image_editor.toolbar.close`), not by a class name or a DOM position —
 * which is why this stays on the supported surface: we set that string, so we
 * are allowed to look for it. If the editor ever stops rendering it, every
 * function here degrades to "no panel is open" and submission behaves exactly
 * as it does today.
 */

import type { ImageEditorInstance } from "@unlayer/react-image-editor";
import { CLOSE_PANEL_LABEL } from "./editor-config";

/** How long to wait for a closed panel to flatten into the canvas. */
const COMMIT_TIMEOUT_MS = 1400;
const COMMIT_POLL_MS = 60;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The exhibit as currently committed, or null before it has decoded. */
export function safeGetImage(editor: ImageEditorInstance | null): string | null {
  if (!editor) return null;
  try {
    return editor.getImage();
  } catch {
    // The instance can be torn down between the check and the call.
    return null;
  }
}

/**
 * An editor control, found by the `title` the editor renders from one of our
 * own `translations` entries.
 *
 * This is the whole of how anything here reaches into the editor's DOM: we set
 * those strings, so looking for them is staying on the supported surface, and
 * a library that stopped rendering them leaves every caller with `null` rather
 * than with a wrong element.
 */
export function controlByTitle(
  root: ParentNode | null,
  label: string
): HTMLButtonElement | null {
  if (!root) return null;
  const target = label.trim().toUpperCase();
  for (const button of root.querySelectorAll("button")) {
    const title = (button.getAttribute("title") ?? "").trim().toUpperCase();
    if (title === target) return button;
  }
  return null;
}

/**
 * A panel section heading, found by the text the editor renders from one of
 * our own `translations` entries — the same rule as `controlByTitle`, applied
 * to a heading rather than a button's title.
 */
export function sectionHeading(
  root: ParentNode | null,
  label: string
): HTMLElement | null {
  if (!root) return null;
  const target = label.trim().toUpperCase();
  for (const heading of root.querySelectorAll<HTMLElement>("h2, h3, h4, h5")) {
    if ((heading.textContent ?? "").trim().toUpperCase() === target) {
      return heading;
    }
  }
  return null;
}

/**
 * The open panel's close control, if a panel is open.
 *
 * Exactly one button carries this title, and only while a panel is open —
 * verified against the running editor across SCRUB, PAINT and the rest.
 */
function closeControl(root: ParentNode | null): HTMLButtonElement | null {
  return controlByTitle(root, CLOSE_PANEL_LABEL);
}

/** Whether a tool panel is open, i.e. whether an edit is being previewed. */
export function isPanelOpen(root: ParentNode | null): boolean {
  return closeControl(root) !== null;
}

/**
 * Which tool's panel is open, by the heading the editor renders from our own
 * rail label — or null when none is, or when the heading cannot be found.
 *
 * Walks outward from the close control and takes the nearest ancestor holding
 * one of the labels as plain text. Text inside a button is skipped, because the
 * tool rail carries the very same labels on its buttons and sits only a few
 * levels further out: without that rule a missing heading would resolve to
 * whichever rail button came first, which is a wrong answer rather than none.
 */
export function openPanelLabel(
  root: ParentNode | null,
  labels: readonly string[]
): string | null {
  const wanted = new Set(labels.map((l) => l.trim().toUpperCase()));
  let scope: HTMLElement | null = closeControl(root)?.parentElement ?? null;
  for (let depth = 0; scope && depth < 4; depth++) {
    for (const el of scope.querySelectorAll<HTMLElement>("span, h2, h3, h4")) {
      if (el.closest("button")) continue;
      const text = (el.textContent ?? "").trim().toUpperCase();
      if (wanted.has(text)) return text;
    }
    scope = scope.parentElement;
  }
  return null;
}

/**
 * Flatten any open tool panel, then read the exhibit.
 *
 * Polls rather than sleeping a fixed interval: the flatten is usually done
 * inside a couple of frames, and a submission that stalls for a second and a
 * half every time would be its own problem. The timeout is the backstop, not
 * the expected path.
 */
export async function commitAndRead(
  editor: ImageEditorInstance | null,
  root: ParentNode | null
): Promise<string | null> {
  const before = safeGetImage(editor);
  const control = closeControl(root);
  if (!control) return before;

  control.click();

  const deadline = Date.now() + COMMIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await wait(COMMIT_POLL_MS);
    const now = safeGetImage(editor);
    // A panel closed without a change flattens to the same bytes; that is a
    // real answer, but indistinguishable from "not landed yet", so it costs
    // the full timeout. Nothing is lost by that — there was nothing to lose.
    if (now && now !== before) return now;
  }
  return safeGetImage(editor) ?? before;
}
