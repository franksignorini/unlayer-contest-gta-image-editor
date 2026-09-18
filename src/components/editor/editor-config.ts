/**
 * React Image Editor configuration.
 *
 * The editor is re-skinned entirely through its own supported surface —
 * `translations`, `theme`, per-tool `icon` — so nothing here depends on the
 * library's internals. Two hard-won constraints drive the naming:
 *
 * 1. Tool rail labels truncate by PIXEL WIDTH, not character count. Uppercase
 *    is wide: a 7-character uppercase label renders as "DEGRA…". So rail names
 *    are five characters at most, and the full evocative verb lives in our own
 *    tool legend beside the editor.
 * 2. Changing any `options` key other than theme/locale/translations destroys
 *    and recreates the editor. The object below is a module constant so it is
 *    referentially stable for the lifetime of a case.
 */

import type { ImageEditorOptions } from "@unlayer/react-image-editor";
import type { ImageEditorToolConfig } from "@unlayer/types";
import { TOOL_ICONS } from "./tool-icons";
import type { EditorTool } from "@/types";

/**
 * The panel close control's label.
 *
 * Exported because it is also a handle. The editor renders it as the `title`
 * of the one button that exists only while a tool panel is open, and closing
 * that panel is what commits a previewed edit to the canvas — so this string
 * is how `commit.ts` finds the control without reaching for a class name.
 * Changing it here changes both, which is the point.
 */
export const CLOSE_PANEL_LABEL = "CLOSE";

/**
 * The history controls' labels — handles for the same reason CLOSE is one.
 *
 * The editor ships no keyboard bindings, and under a three-minute clock a
 * player who reaches for Ctrl+Z and gets nothing has just lost the time it
 * takes to work out why. `useEditorShortcuts` finds these two buttons by the
 * `title` the editor renders from the entries below and clicks them, so the
 * shortcut and the toolbar always drive the same control.
 */
export const UNDO_LABEL = "REVERT";
export const REDO_LABEL = "REAPPLY";

/**
 * The SCRUB panel's effects heading — a handle too. DEFOCUS and MOSAIC, the
 * two sliders the whole game turns on, sit under it at the very foot of a
 * panel that opens on a preset grid and six colour sliders. `useJumpToDegrade`
 * finds the heading by this string to offer a way straight down to them.
 */
export const DEGRADE_LABEL = "DEGRADE";

/**
 * The DEFOCUS slider's label, and the SCRUB panel's "no treatment" preset —
 * handles as well as copy, for the terminal's DEFOCUS projection.
 *
 * On a clean exhibit the editor keeps a filter preview out of `getImage()`, so
 * the terminal models the blur itself (lib/forensics/projection). That is only
 * honest while DEFOCUS is the ONLY thing the panel is doing, so `readScrubPanel`
 * finds the slider by this label and checks the preset titled NONE is still the
 * pressed one. If the library stops rendering either, the reader reports "not
 * modelled" and the rail simply waits for the commit, as it always did.
 */
export const DEFOCUS_LABEL = "DEFOCUS";
export const NO_TREATMENT_LABEL = "NONE";

/**
 * The toolbar's flatten control — the terminal's one window onto whether the
 * canvas holds overlay objects, which is what decides whether `getImage()` can
 * see an open panel's preview at all.
 *
 * Verified against editor 2.9.0: `getImage()` returns its cached base image
 * while there are no bars, markings, plants or strokes on the canvas, and
 * re-renders the live canvas — open filter preview included — once there are.
 * The editor disables this control on exactly the same condition. So a
 * disabled FLATTEN LAYERS means the rail cannot read a SCRUB preview and the
 * DEFOCUS projection should stand in; an enabled one means the rail already
 * reads it and a projection would blur the blur a second time.
 */
export const FLATTEN_LABEL = "FLATTEN LAYERS";

/**
 * Every string the editor shows, rewritten into the fiction.
 *
 * Keys verified against the shipping bundle — `cdn.unlayer.com/image-editor/
 * <version>/editor.js`, currently editor 2.7.0 — not against the type package,
 * which lags it. The editor is on its own release cadence behind a `latest`
 * loader, so THIS LIST GOES STALE ON ITS OWN: 2.7.0 added a whole Adjust panel
 * (contrast, gamma, saturation, vibrance, hue, pixelate) and a preset strip,
 * and every one of those strings was showing in plain English inside the
 * fiction until they were added here.
 *
 * To re-check after an editor release, diff the bundle's own key list against
 * this object:
 *
 *   fetch('https://cdn.unlayer.com/image-editor/<version>/editor.js')
 *     .then(r => r.text())
 *     .then(t => [...new Set(
 *       [...t.matchAll(/"(image_editor\.[a-z0-9_.]+)"/g)].map(m => m[1])
 *     )].sort())
 *
 * Keys the bundle no longer defines are silently ignored, so a stale entry
 * costs nothing but says something untrue about the editor — they are removed
 * rather than kept "just in case".
 */
const EN_TRANSLATIONS: Record<string, string> = {
  // Tool rail + panel headings. Five characters max — see note above.
  "image_editor.tools.crop": "CUT",
  "image_editor.tools.resize": "FRAME",
  "image_editor.tools.filter": "SCRUB",
  "image_editor.tools.draw": "PAINT",
  "image_editor.tools.text": "FAKE",
  "image_editor.tools.shapes": "BLOCK",
  "image_editor.tools.stickers": "PLANT",
  "image_editor.tools.frame": "EDGE",
  "image_editor.tools.corners": "CORNER",

  // Toolbar — these have room for real phrasing.
  "image_editor.toolbar.save": "COMMIT TO EVIDENCE",
  "image_editor.toolbar.cancel": "DISCARD",
  "image_editor.toolbar.undo": UNDO_LABEL,
  "image_editor.toolbar.redo": REDO_LABEL,
  "image_editor.toolbar.zoom_in": "MAGNIFY",
  "image_editor.toolbar.zoom_out": "WIDEN",
  "image_editor.toolbar.fit_to_screen": "FIT FRAME",
  "image_editor.toolbar.close": CLOSE_PANEL_LABEL,
  "image_editor.toolbar.flatten": FLATTEN_LABEL,

  // Layer / object names, as an examiner would log them.
  "image_editor.labels.image": "EXHIBIT",
  "image_editor.labels.text": "FALSE MARKING",
  "image_editor.labels.shape": "REDACTION",
  "image_editor.labels.sticker": "PLANTED OBJECT",
  "image_editor.labels.drawing": "OVERPAINT",

  // Filter panel — group headings and the preset strip.
  "image_editor.filters.presets": "TREATMENTS",
  "image_editor.filters.adjust": "SIGNAL",
  "image_editor.filters.group.light": "LIGHT",
  "image_editor.filters.group.color": "COLOUR",
  "image_editor.filters.group.effects": DEGRADE_LABEL,

  // Filter sliders, in forensic language.
  "image_editor.filters.blur": DEFOCUS_LABEL,
  "image_editor.filters.pixelate": "MOSAIC",
  "image_editor.filters.brightness": "EXPOSURE",
  "image_editor.filters.contrast": "CONTRAST",
  "image_editor.filters.gamma": "GAMMA",
  "image_editor.filters.saturation": "SATURATION",
  "image_editor.filters.vibrance": "VIBRANCE",
  "image_editor.filters.hue": "COLOUR CAST",
  "image_editor.filters.grayscale": "DESATURATE",
  "image_editor.filters.noise": "SENSOR NOISE",
  "image_editor.filters.sharpen": "RESOLVE",

  // Presets. These are film stocks and photo-app looks out of the box, which
  // reads as a phone filter menu rather than a forensic terminal — renamed to
  // the kind of pass an examiner or a forger would actually run.
  "image_editor.filters.none": NO_TREATMENT_LABEL,
  "image_editor.filters.black_white": "MONOCHROME",
  "image_editor.filters.sepia": "AGED STOCK",
  "image_editor.filters.vintage": "ARCHIVE",
  "image_editor.filters.polaroid": "INSTANT",
  "image_editor.filters.kodachrome": "COLOUR NEG",
  "image_editor.filters.technicolor": "BROADCAST",
  "image_editor.filters.brownie": "LOW GRADE",
  "image_editor.filters.invert": "NEGATIVE",
  "image_editor.filters.emboss": "RELIEF",

  "image_editor.actions.reset": "RESTORE",

  // PAINT panel.
  "image_editor.draw.brush": "BRUSH",
  "image_editor.draw.type": "TYPE",
  "image_editor.draw.size": "WIDTH",
  "image_editor.draw.color": "COLOUR",
  "image_editor.draw.custom_color": "CUSTOM",
  "image_editor.draw.brush_pencil": "PENCIL",
  "image_editor.draw.brush_circle": "ROUND",
  "image_editor.draw.brush_square": "SQUARE",
  "image_editor.draw.brush_diamond": "DIAMOND",
  "image_editor.draw.brush_spray": "SPRAY",
  "image_editor.draw.brush_eraser": "LIFT",
  "image_editor.draw.brush_hline": "H-STROKE",
  "image_editor.draw.brush_vline": "V-STROKE",

  // CUT panel.
  "image_editor.crop.aspect_ratio": "ASPECT",
  "image_editor.crop.aspect_free": "FREE",
  "image_editor.crop.aspect_original": "AS FILED",
  "image_editor.crop.aspect_square": "SQUARE",
  "image_editor.crop.rotate_flip": "ROTATE / FLIP",
  "image_editor.crop.straighten": "LEVEL",
  "image_editor.corners.radius": "CORNER RADIUS",
  // Rendered as the CUT panel's button titles — the only sentence-case English
  // left in the panel until they were caught.
  "image_editor.rotate.rotate_left": "ROTATE LEFT",
  "image_editor.rotate.rotate_right": "ROTATE RIGHT",
  "image_editor.rotate.flip_horizontal": "MIRROR",
  "image_editor.rotate.flip_vertical": "INVERT",

  // FAKE panel. Its preset names are a social-media caption menu out of the
  // box — "Meme", "Bubbles", "Neon" — which is the loudest break in the whole
  // fiction, because FAKE is the tool that forges a camera's own markings.
  "image_editor.text.new": "NEW MARKING",
  // What the editor stamps onto the exhibit when a marking is added. Stock, it
  // was "Double click to edit" — printed across a surveillance still. Worded
  // as the overlay a forger would actually type, so the default already plays.
  "image_editor.text.default_text": "CAM 00 · SIGNAL LOST",
  "image_editor.text.font": "TYPEFACE",
  "image_editor.text.size": "SIZE",
  "image_editor.text.style": "STYLE",
  "image_editor.text.bold": "HEAVY",
  "image_editor.text.italic": "SLANT",
  "image_editor.text.underline": "UNDERLINE",
  "image_editor.text.strikethrough": "STRIKE",
  "image_editor.text.align": "ALIGN",
  "image_editor.text.align_left": "LEFT",
  "image_editor.text.align_center": "CENTRE",
  "image_editor.text.align_right": "RIGHT",
  "image_editor.text.background": "BACKING",
  "image_editor.text.more": "MORE ({count})",
  "image_editor.text.less": "LESS",
  "image_editor.text.group.basic": "OVERLAY",
  "image_editor.text.group.handwriting": "HANDWRITTEN",
  "image_editor.text.group.effects": "TREATED",
  "image_editor.text.preset.heading": "HEADER",
  "image_editor.text.preset.subheading": "SUBHEADER",
  "image_editor.text.preset.body": "CAPTION",
  "image_editor.text.preset.marker": "MARKER",
  "image_editor.text.preset.script": "SIGNATURE",
  "image_editor.text.preset.bubbles": "GRAFFITI",
  "image_editor.text.preset.sketch": "PENCIL",
  "image_editor.text.preset.meme": "TABLOID",
  "image_editor.text.preset.outline": "OUTLINE",
  "image_editor.text.preset.highlight": "TAPE",
  "image_editor.text.preset.shadow": "SHADOW",
  "image_editor.text.preset.neon": "NEON",
  "image_editor.text.preset.typewriter": "TELETYPE",

  // Layer ordering, on the object toolbar that floats over a placed bar,
  // marking or plant.
  "image_editor.arrange.bring_to_front": "TO FRONT",
  "image_editor.arrange.bring_forward": "FORWARD",
  "image_editor.arrange.send_backward": "BACKWARD",
  "image_editor.arrange.send_to_back": "TO BACK",

  // FRAME panel.
  "image_editor.resize.width": "WIDTH",
  "image_editor.resize.height": "HEIGHT",
  "image_editor.resize.lock_aspect": "LOCK RATIO",

  // BLOCK panel. `rectangle` is the redaction bar, so it is named as one.
  "image_editor.shapes.rectangle": "BAR",
  "image_editor.shapes.circle": "DISC",
  "image_editor.shapes.ellipse": "OVAL",
  "image_editor.shapes.triangle": "WEDGE",
  "image_editor.shapes.line": "RULE",
  "image_editor.shapes.arrow": "ARROW",
  "image_editor.shapes.curved_arrow": "CURVED ARROW",
  "image_editor.shapes.star": "STAR",
  "image_editor.shapes.shield": "SHIELD",
  "image_editor.shapes.decagon": "DECAGON",
  "image_editor.shapes.fill": "FILL",
  "image_editor.shapes.filled": "SOLID",
  "image_editor.shapes.empty": "NONE",
  "image_editor.shapes.transparent": "CLEAR",
  "image_editor.shapes.gradient": "GRADIENT",
  "image_editor.shapes.color": "COLOUR",
  "image_editor.shapes.opacity": "OPACITY",
  "image_editor.shapes.outline": "OUTLINE",
  "image_editor.shapes.outline_width": "WIDTH",
  "image_editor.shapes.shadow": "SHADOW",
  "image_editor.shapes.shadow_blur": "SOFTNESS",
  "image_editor.shapes.shadow_offset_x": "OFFSET X",
  "image_editor.shapes.shadow_offset_y": "OFFSET Y",
  "image_editor.shapes.duplicate": "DUPLICATE",
  "image_editor.shapes.delete": "DELETE",
  "image_editor.shapes.search": "SEARCH",
  "image_editor.shapes.more": "MORE",
  "image_editor.shapes.less": "LESS",

  // EDGE panel. The stock names are picture-frame timbers; they read as a
  // photo-printing app rather than a terminal.
  "image_editor.frame.presets": "TREATMENTS",
  "image_editor.frame.adjust": "ADJUST",
  "image_editor.frame.color": "COLOUR",
  "image_editor.frame.size": "WIDTH",
  "image_editor.frame.basic": "PLAIN",
  "image_editor.frame.ebony": "BLACKOUT",
  "image_editor.frame.oak": "WARM",
  "image_editor.frame.pine": "PALE",
  "image_editor.frame.rainbow": "SPECTRUM",
  "image_editor.frame.grunge1": "DEGRADED A",
  "image_editor.frame.grunge2": "DEGRADED B",
  "image_editor.frame.art1": "MASK A",
  "image_editor.frame.art2": "MASK B",

  // PLANT panel.
  "image_editor.stickers.search": "SEARCH",
  "image_editor.stickers.empty": "NO MATCHES",
  "image_editor.stickers.more": "MORE",
  "image_editor.stickers.less": "LESS",
  "image_editor.stickers.category.emoticons": "FACES",
  "image_editor.stickers.category.doodles": "MARKINGS",
  "image_editor.stickers.category.transportation": "VEHICLES",
  "image_editor.stickers.category.landmarks": "LANDMARKS",
  "image_editor.stickers.category.beach": "COASTAL",
  "image_editor.stickers.category.clouds": "WEATHER",
  "image_editor.stickers.category.bubbles": "OBSCURA",
  "image_editor.stickers.category.stars": "SHAPES",

  // The shared button bundle backs some controls too.
  "buttons.save": "COMMIT TO EVIDENCE",
  "buttons.cancel": "DISCARD",
};

/** All eight tools, so the editor is fully exercised in every case. */
const ALL_TOOLS: EditorTool[] = [
  "crop",
  "resize",
  "filter",
  "draw",
  "text",
  "shapes",
  "stickers",
  "frame",
];

/**
 * What each tool means in the fiction, and what it costs. Rendered in our own
 * legend panel — this is where the full verbs live, since the rail can't hold
 * them.
 *
 * ORDER MATTERS, and it is not ours. The legend's whole claim is that it
 * describes the rail beside the exhibit, so it is listed in the order the
 * editor actually renders that rail — filter, crop, resize, draw, text,
 * shapes, stickers, frame — rather than in ours. Sorted by cost, as it was,
 * the third row of the legend described the sixth button in the rail, and a
 * player reading down one while looking down the other was quietly misled
 * about which tool costs what. The rail order is the library's; re-check it
 * after an editor release, the same as the translation keys.
 */
export interface ToolBriefing {
  tool: EditorTool;
  /** The label as it appears in the editor's rail. */
  rail: string;
  /** The full name we use in our chrome. */
  verb: string;
  effect: string;
  cost: "low" | "medium" | "high";
  /**
   * When this tool's work reaches the exhibit. Verified against the running
   * editor: the filter-style panels hold their effect back as a preview until
   * the panel closes, while anything placed on the canvas — a bar, a stroke, a
   * marking, a sticker — lands the moment it is made.
   *
   * "Reaches the exhibit" is about what gets filed, not about what the rail can
   * see: once the canvas holds an overlay object, `getImage()` re-renders the
   * live canvas and an open filter preview shows up in it (FLATTEN_LABEL has
   * the detail). It still only becomes part of the exhibit when the panel
   * closes, which is what the submit bar's APPLY does.
   */
  lands: "on-close" | "at-once";
  /**
   * Shown in the submit bar while this tool's panel is open and nothing from
   * it has landed yet. Only the at-once tools carry one: for the rest, the
   * PREVIEW ONLY notice is the thing to say.
   */
  panelHint?: string;
}

export const TOOL_BRIEFINGS: ToolBriefing[] = [
  {
    tool: "filter",
    rail: "SCRUB",
    verb: "SCRUB",
    // The only subtle tool in the rail, and the only global one — there is no
    // way to soften one face, only the photograph. Which is exactly why it has
    // a ceiling: an exhibit with no fine structure left anywhere is as plainly
    // worked on as one with a bar across it. Spend enough, not all of it.
    effect:
      "Defocus, mosaic and regrade the whole frame — DEFOCUS is under DEGRADE, at the foot of the panel. Subtle until it isn't: scrub too far and the scrubbing is the finding.",
    cost: "medium",
    lands: "on-close",
  },
  {
    tool: "crop",
    rail: "CUT",
    verb: "EXCISE",
    effect: "Remove evidence from frame entirely. Costs frame integrity.",
    cost: "high",
    lands: "on-close",
  },
  {
    tool: "resize",
    rail: "FRAME",
    verb: "REFRAME",
    effect: "Change the frame itself. Alters the exhibit's dimensions on record.",
    cost: "medium",
    lands: "on-close",
  },
  {
    tool: "draw",
    rail: "PAINT",
    verb: "OVERPAINT",
    effect: "Paint directly over evidence. Effective, and it leaves a mark.",
    cost: "medium",
    lands: "at-once",
    panelHint:
      "Strokes land on the exhibit as you draw them. Opaque paint hides what it covers — and reads as paint.",
  },
  {
    tool: "text",
    rail: "FAKE",
    verb: "FALSIFY",
    // Priced from the running editor: one default marking, untouched, took
    // VC-001 from 100 to 54 integrity — under the floor on its own. Everything
    // inside a marking is content the camera never recorded.
    effect:
      "Overwrite timestamps and camera markings with your own. Every letter is content the camera never recorded.",
    cost: "high",
    lands: "at-once",
    panelHint:
      "A marking lands on the exhibit the moment it is added. Drag it into place, double-click it to type your own.",
  },
  {
    tool: "shapes",
    rail: "BLOCK",
    verb: "REDACT",
    effect: "Hard cover. Beats recognition outright, screams tampering.",
    cost: "high",
    lands: "at-once",
    panelHint:
      "Pick a shape and it lands on the exhibit at once — drag and size it over a target. One small bar is a detail; a big one is a confession.",
  },
  {
    tool: "stickers",
    rail: "PLANT",
    verb: "IMPLANT",
    effect: "Introduce objects that were never there. Reads as foreign content.",
    cost: "high",
    lands: "at-once",
    panelHint:
      "A planted object lands at once — drag it over what has to go. Anything the camera never saw reads as foreign content.",
  },
  {
    tool: "frame",
    rail: "EDGE",
    verb: "MASK",
    // Priced from the running editor, not guessed. This was "LOW COST, cheap
    // cover near the borders" while the tool was dead (see `offline` below);
    // once its frames actually loaded, all nine left identification at 100%
    // on VC-001 and took integrity to between 0 and 65. A frame paints over a
    // third of the picture and hides nothing in the middle of it.
    effect:
      "Frames the whole exhibit. Covers only what sits at the very edge — and a border on a CCTV still is its own finding.",
    cost: "high",
    lands: "on-close",
  },
];

/** Every rail label, for finding which panel is open by its heading. */
export const RAIL_LABELS = TOOL_BRIEFINGS.map((t) => t.rail);

/**
 * Build the options object for a case.
 *
 * Memoise the result per mission — a new object identity on re-render would
 * remount the editor and destroy the player's work.
 */
export function buildEditorOptions(
  tools?: Partial<Record<EditorTool, boolean>>
): ImageEditorOptions {
  // Every tool carries our own glyph. `icon` is typed only as `string` and the
  // library fails silently on a bad value — a data URI was verified against the
  // running editor before this was built. See tool-icons.ts.
  const toolConfig: Record<string, ImageEditorToolConfig> = {};
  for (const t of ALL_TOOLS) {
    toolConfig[t] = { enabled: tools?.[t] ?? true, icon: TOOL_ICONS[t] };
  }

  return {
    theme: "dark",
    // NOT `offline: true`, though this runs as a closed terminal. In editor
    // 2.7.0 offline mode also switches off the bundle's asset resolver — every
    // path under `assets/` resolves to an empty string — so EDGE's frames,
    // PLANT's stickers and FAKE's handwriting faces all rendered as broken
    // images and applied nothing. Two of the eight tools in the rail were dead
    // with no error anywhere. AI is switched off below, and with no projectId
    // the editor makes no API calls; what it does fetch is its own static
    // assets, from the same CDN as the bundle.
    locale: "en",
    translations: { en: EN_TRANSLATIONS },
    features: {
      imageEditor: { enabled: true, tools: toolConfig },
      ai: false,
    },
  };
}
