/**
 * Committing a pending tool panel.
 *
 * The editor has no "apply" in its API. While a filter-style panel is open its
 * effect is a preview, flattened into the exhibit only when the panel closes.
 * On a canvas with no overlay objects `getImage()` returns the exhibit
 * byte-identical to how it was before the panel opened; once a bar, marking,
 * plant or stroke is on it, `getImage()` re-renders the live canvas and the
 * preview shows — but it is still not part of the exhibit until the close.
 * `hasChanges()` latches true on the first edit and cannot tell any of this
 * apart.
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
import {
  CLOSE_PANEL_LABEL,
  DEFOCUS_LABEL,
  FLATTEN_LABEL,
  NO_TREATMENT_LABEL,
} from "./editor-config";

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
 * Close the open panel, which is what lands its work on the exhibit.
 *
 * The terminal's own APPLY control. The editor's close is a 14px glyph in the
 * panel's corner, and nothing about it says "this is how the blur you are
 * looking at reaches the photograph" — so the one control that commits a SCRUB
 * was the one a new player never found. Same control, same click; this only
 * puts it where the player is already reading. Returns whether one was open.
 */
export function closePanel(root: ParentNode | null): boolean {
  const control = closeControl(root);
  control?.click();
  return control !== null;
}

/**
 * Whether `getImage()` can see an open panel's preview right now: true when the
 * canvas holds overlay objects (the export is a live re-render), false when it
 * does not (the export is the cached base), null when that cannot be told.
 *
 * Read off the flatten control's `disabled` state — see FLATTEN_LABEL for why
 * that is the same condition.
 */
export function exportShowsPreview(root: ParentNode | null): boolean | null {
  const flatten = controlByTitle(root, FLATTEN_LABEL);
  return flatten ? !flatten.disabled : null;
}

/** What the SCRUB panel is set to, as far as the DEFOCUS projection cares. */
export interface ScrubReading {
  /** The DEFOCUS slider's value, 0..100. */
  defocus: number;
  /**
   * DEFOCUS is the only thing the panel is doing: no preset but NONE, and
   * every other slider at rest. Only then does the model in
   * lib/forensics/projection describe what will land.
   */
  modelled: boolean;
  /**
   * The preview is invisible to `getImage()` — the canvas holds no overlay
   * objects, so the export is still the cached base. When this is false the
   * live read already scores the preview, and projecting on top of it would
   * blur an already-blurred frame.
   */
  hidden: boolean;
}

/**
 * The slider a label belongs to — the nearest enclosing row that holds exactly
 * one range input. Walks outward from our own label text, the same way
 * `openPanelLabel` does, so no class name or position is involved.
 */
function sliderFor(label: HTMLElement): HTMLInputElement | null {
  let scope: HTMLElement | null = label.parentElement;
  for (let depth = 0; scope && depth < 4; depth++) {
    const ranges = scope.querySelectorAll<HTMLInputElement>("input[type=range]");
    if (ranges.length === 1) return ranges[0];
    if (ranges.length > 1) return null;
    scope = scope.parentElement;
  }
  return null;
}

/**
 * Read the SCRUB panel, or null when it is not the panel on screen.
 *
 * Found through strings we set — the DEFOCUS label and the NONE preset's
 * title — never through the library's own attributes. Anything that cannot be
 * confirmed reads as `modelled: false`, which costs the player a projection and
 * never shows them a wrong one.
 */
export function readScrubPanel(root: ParentNode | null): ScrubReading | null {
  if (!root || !isPanelOpen(root)) return null;
  const target = DEFOCUS_LABEL.toUpperCase();
  let defocusInput: HTMLInputElement | null = null;
  for (const el of root.querySelectorAll<HTMLElement>("span, label")) {
    if (el.closest("button")) continue;
    if ((el.textContent ?? "").trim().toUpperCase() !== target) continue;
    defocusInput = sliderFor(el);
    if (defocusInput) break;
  }
  if (!defocusInput) return null;

  const defocus = Number(defocusInput.value);
  if (!Number.isFinite(defocus)) return null;

  const untreated =
    controlByTitle(root, NO_TREATMENT_LABEL)?.getAttribute("aria-pressed") ===
    "true";
  const othersAtRest = [
    ...root.querySelectorAll<HTMLInputElement>("input[type=range]"),
  ].every((r) => r === defocusInput || Number(r.value) === 0);

  return {
    defocus,
    modelled: untreated && othersAtRest,
    hidden: exportShowsPreview(root) === false,
  };
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
