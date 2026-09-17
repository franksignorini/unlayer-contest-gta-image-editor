/**
 * Bespoke iconography for the editor's own tool rail.
 *
 * `features.imageEditor.tools[tool].icon` is typed only as `string`, with no
 * indication of whether it wants a URL, an icon name, or markup — and this
 * library fails silently when you guess wrong. It was verified empirically
 * against the running editor: a data-URI SVG is accepted and rendered in place
 * of the stock glyph.
 *
 * This is the last part of the editor that still looked like somebody else's
 * component. The tools were already renamed into the fiction through the
 * translation layer; drawing the glyphs to match is what stops the rail reading
 * as an embed. Every one is our own artwork on the library's supported surface —
 * no CSS override, nothing reaching into its internals.
 *
 * Two constraints the drawings have to respect:
 *
 *   fixed colour — the icon is delivered as an image, so it cannot inherit the
 *     rail's active/hover tint the way the stock glyphs do. They are drawn in a
 *     light neutral close to `--color-bone` so they sit correctly in the dark
 *     theme in every state, and selection is still signalled by the rail's own
 *     label and background treatment.
 *   legible at 18px — these render small. Thick strokes, few marks, no detail
 *     that survives only at 24px.
 */

/** Close to --color-bone. Hardcoded because this is baked into an image. */
const INK = "#d5dce6";

/** Shared attributes so every glyph has the same weight and optical size. */
const A =
  `xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ` +
  `stroke="${INK}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"`;

/**
 * One glyph per tool, named by what the tool does *in the fiction* rather than
 * by the library's name for it.
 */
const GLYPHS = {
  /** SCRUB — wash detail out. A lens half lost to defocus. */
  filter: `<svg ${A}><circle cx="12" cy="12" r="8.6"/><path d="M12 3.4a8.6 8.6 0 0 1 0 17.2" fill="${INK}" stroke="none"/><path d="M3.6 9.2h4M3.4 12h3M3.9 14.9h3.4" opacity="0.55"/></svg>`,

  /** EXCISE — take it out of frame. Crop marks. */
  crop: `<svg ${A}><path d="M6.4 2.6v15h15"/><path d="M2.6 6.4h15v15"/></svg>`,

  /** REFRAME — change the frame itself. */
  resize: `<svg ${A}><rect x="3" y="3" width="18" height="18" rx="1.4"/><path d="M9 15 15 9M15 9h-3.4M15 9v3.4"/></svg>`,

  /** OVERPAINT — paint directly over evidence. A nib. */
  draw: `<svg ${A}><path d="M4 20.2l1.1-4 9.6-9.6 2.9 2.9-9.6 9.6z"/><path d="M14.7 6.6l2.1-2.1a1.6 1.6 0 0 1 2.3 0l.6.6a1.6 1.6 0 0 1 0 2.3l-2.1 2.1"/><path d="M4 20.2l2.4-.9"/></svg>`,

  /** FALSIFY — overwrite the camera's own markings. */
  text: `<svg ${A}><path d="M5 6.4V4.6h14v1.8M12 4.6v14.8M9 19.4h6"/></svg>`,

  /** REDACT — hard cover. The bar itself, which is exactly what it does. */
  shapes: `<svg ${A}><rect x="2.8" y="8.4" width="18.4" height="7.2" rx="0.8" fill="${INK}" stroke="none"/><path d="M2.8 5.2h18.4M2.8 18.8h18.4" opacity="0.5"/></svg>`,

  /** IMPLANT — introduce something that was never there. */
  stickers: `<svg ${A}><path d="M12 21.4s6.6-5.6 6.6-10.4a6.6 6.6 0 1 0-13.2 0C5.4 15.8 12 21.4 12 21.4z"/><path d="M9.6 10.8h4.8M12 8.4v4.8"/></svg>`,

  /** MASK — edge treatment. A frame inside a frame. */
  frame: `<svg ${A}><rect x="2.8" y="2.8" width="18.4" height="18.4" rx="1.2"/><rect x="7.4" y="7.4" width="9.2" height="9.2" rx="0.8" opacity="0.55"/></svg>`,
} as const;

export type IconTool = keyof typeof GLYPHS;

/**
 * Percent-encoded rather than base64: the markup stays readable in devtools and
 * in the network panel, which matters the one time one of these does not render
 * and somebody has to work out why.
 */
function toDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const TOOL_ICONS: Record<IconTool, string> = Object.fromEntries(
  Object.entries(GLYPHS).map(([tool, svg]) => [tool, toDataUri(svg)])
) as Record<IconTool, string>;
