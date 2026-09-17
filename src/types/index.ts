/**
 * Shared shapes for VICE EVIDENCE.
 *
 * Mission configuration is data; the forensic engine consumes it and produces a
 * ForensicResult; the UI only ever renders a result. No component computes
 * scoring maths.
 */

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ */

/** A box in the source image's own pixel space. */
export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * How the submitted image maps back onto the original. Recovered by the
 * alignment pass when the player crops or resizes.
 */
export interface FrameTransform {
  /** The region of the ORIGINAL that survives in the submission. */
  crop: PixelRect;
  /** Proportion of the original frame that is gone (0 = intact). */
  frameLoss: number;
  /** True when dimensions changed and alignment had to be estimated. */
  estimated: boolean;
  /** Residual match error of the chosen alignment, 0..1. Lower is better. */
  error: number;
}

/* ------------------------------------------------------------------ *
 * Missions
 * ------------------------------------------------------------------ */

export type EvidenceKind =
  | "face"
  | "plate"
  | "witness"
  | "weapon"
  | "vehicle"
  | "mark"
  | "object"
  | "location"
  | "mask";

export type EditorTool =
  | "crop"
  | "resize"
  | "filter"
  | "draw"
  | "text"
  | "shapes"
  | "stickers"
  | "frame";

/** One incriminating thing the camera captured. */
export interface EvidenceTarget {
  id: string;
  /** Full name, used in the briefing and the forensic report. */
  label: string;
  /** Six characters or fewer — this goes in the narrow live rail. */
  short: string;
  kind: EvidenceKind;
  /**
   * Contribution to the identification score, 0..1. Relative within a mission.
   * A `mask` target sits near zero: the police already can't use it, so a
   * player who spends integrity hiding it has wasted the effort.
   */
  weight: number;
  /** Where it is, in source-image pixels. Emitted by scripts/generate-evidence.mjs. */
  region: PixelRect;
  /** Why it matters. Shown at case select. */
  note: string;
  /**
   * What the examiner reads off this region when enough detail survives the
   * edit — a plate number, a name, a weapon class.
   *
   * This is the threat made concrete. "PLATE RESOLVED 78%" is a statistic;
   * "BIX 9Q4" is the thing that puts the player in a cell. Short and
   * uppercase: it is printed as a monospace readout during pixel recovery.
   *
   * IT MUST MATCH THE ACTUAL PIXELS. The recovery pass shows the region
   * magnified beside this line, so a value the exhibit does not support is
   * visibly a lie and takes the credibility of the whole forensic model with
   * it. Where the region carries readable text — a plate, signage, a race
   * number — transcribe it from the capture, never invent it. Where it carries
   * none, name the identification instead of a fabricated serial.
   */
  resolvedAs: string;
}

/**
 * A high-fidelity attachment in the case file.
 *
 * These are the clean, on-file photographs the department already holds. They
 * are deliberately *not* editable: the grainy CCTV still is what the police
 * have, and these are what they will compare it against. That contrast is the
 * point — a reference portrait on file is what gives "keep your face legible
 * and they will match you" its teeth.
 */
export interface CaseReference {
  src: string;
  /** Which dossier slot this fills. */
  role: "subject" | "material";
  /** Panel heading, e.g. 'SUBJECT REFERENCE'. */
  label: string;
  /** Archive code, for dossier texture. */
  code: string;
  /** One-line caption in departmental voice. */
  caption: string;
  /** The evidence target this reference would be matched against. */
  matchesTargetId?: string;
}

export interface Mission {
  /** Case number as shown to the player, e.g. 'VC-001'. */
  id: string;
  /** Asset slug, matches public/evidence/<slug>.png. */
  slug: string;
  title: string;
  crime: string;
  location: string;
  cameraId: string;
  timestamp: string;
  image: string;
  imageSize: { width: number; height: number };
  /** Narrative shown at case select. */
  briefing: string;
  /** Flavour line printed on the dossier card. */
  closingLine: string;
  targets: EvidenceTarget[];
  /** Exactly two on-file attachments shown in the case's intelligence annex. */
  references: CaseReference[];
  /** Tools available for this case. Omitted tools are enabled. */
  tools?: Partial<Record<EditorTool, boolean>>;
  timeLimitSeconds: number;
}

/* ------------------------------------------------------------------ *
 * Forensic analysis
 * ------------------------------------------------------------------ */

/** Per-target analysis of what survived the edit. */
export interface TargetFinding {
  targetId: string;
  label: string;
  short: string;
  kind: EvidenceKind;
  weight: number;
  /** 0..100 — how identifiable this evidence still is. */
  legibility: number;
  /** Surviving high-frequency detail relative to the original, 0..1. */
  detailRatio: number;
  /** Structural similarity to the original patch, 0..1. */
  similarity: number;
  /** Variance collapse — 1 means the region is a flat fill. */
  uniformity: number;
  /** The region left the frame entirely. */
  croppedOut: boolean;
  /** How the analyser characterises what was done here. */
  treatment: TargetTreatment;
}

export type TargetTreatment =
  | "untouched"
  | "degraded"
  | "obscured"
  | "redacted"
  | "replaced"
  | "cropped";

/** Signals that the file was worked on, independent of what was hidden. */
export interface TamperSignals {
  /** Introduced axis-aligned hard edges — the redaction-bar detector, 0..1. */
  hardEdges: number;
  /** Blocks whose variance collapsed to nothing, 0..1. */
  flatBlocks: number;
  /** Blocks carrying materially more detail than the original, 0..1. */
  foreignDetail: number;
  /** Global luminance mean/spread drift, 0..1. */
  histogramShift: number;
  /** Proportion of the original frame lost to cropping, 0..1. */
  frameLoss: number;
  /** Proportion of pixels materially changed, 0..1. */
  alteredFraction: number;
  /** Fine structure destroyed across the whole frame — the defocus tell, 0..1. */
  detailLoss: number;
}

export type Outcome =
  | "ACCEPTED"
  | "INSUFFICIENT"
  | "TAMPERING"
  | "IDENTIFIED";

export interface ForensicResult {
  /** 0..100 weighted identification confidence across the case's targets. */
  identification: number;
  /** 0..100 how authentic the photograph still looks. */
  integrity: number;
  /** 0..100 how loudly the file announces it was altered. */
  suspicion: number;
  findings: TargetFinding[];
  signals: TamperSignals;
  transform: FrameTransform;
  outcome: Outcome;
  /** Stars added to the player's wanted level, 0..5. */
  wantedDelta: number;
  /** Milliseconds the analysis took — shown in the report for texture. */
  elapsedMs: number;
}

/* ------------------------------------------------------------------ *
 * Modification log
 * ------------------------------------------------------------------ */

export type ModificationKind =
  | "detail-loss"
  | "redaction"
  | "foreign-content"
  | "exposure"
  | "reframe";

/**
 * One thing the terminal noticed the player do. Derived by diffing successive
 * analyses — the editor exposes no per-edit events, so this is inferred from
 * pixels rather than reported by the library.
 */
export interface EvidenceModification {
  id: string;
  /** Milliseconds since the case was opened. */
  at: number;
  kind: ModificationKind;
  targetId?: string;
  /** Pre-formatted log line, e.g. 'REGION SUSPECT FACE · DETAIL -62%'. */
  label: string;
  /** Signed integrity delta this change accounted for. */
  impact: number;
}

/* ------------------------------------------------------------------ *
 * Game state
 * ------------------------------------------------------------------ */

export type GamePhase =
  | "intro"
  | "boot"
  | "briefing"
  | "terminal"
  | "analysis"
  | "verdict"
  | "dossier";

export interface Submission {
  /** The edited PNG data URL the player committed. */
  dataUrl: string;
  /** Why submission happened — the verdict copy leans on this. */
  trigger: "manual" | "editor-save" | "timeout";
  submittedAt: number;
}

/**
 * One line on the player's permanent record.
 *
 * Exactly one per case: re-filing a case replaces its entry rather than adding
 * another, which is what lets a retry lower the wanted level instead of only
 * ever raising it.
 */
export interface CaseRecord {
  missionId: string;
  outcome: Outcome;
  identification: number;
  integrity: number;
  /** This case's contribution to the wanted level. */
  wantedDelta: number;
  /** Epoch ms — absolute, so it survives a reload. */
  filedAt: number;
}

export interface GameState {
  phase: GamePhase;
  missionId: string | null;
  /** Live analysis while editing, or null before the first snapshot. */
  live: ForensicResult | null;
  /** Pending (uncommitted) edits exist in the editor. */
  dirty: boolean;
  modifications: EvidenceModification[];
  submission: Submission | null;
  /** Final analysis of the submitted image. */
  result: ForensicResult | null;
  /**
   * Derived from `records`, never incremented directly — see lib/game/rap-sheet.
   * Kept on state so every screen reads one value rather than recomputing it.
   */
  wantedLevel: number;
  /** The permanent record, keyed by mission id. Persisted across sessions. */
  records: Record<string, CaseRecord>;
  caseOpenedAt: number | null;
}

/* ------------------------------------------------------------------ *
 * Cold-open intro
 * ------------------------------------------------------------------ */

/** How a card announces itself. Purely presentational. */
export type IntroEffect = "flash" | "glitch" | "title";

/** How large the words are. Three sizes only — this is a title card, not a page. */
export type IntroScale = "hero" | "statement" | "title";

/** One black-screen title card in the opening sequence. */
export interface IntroCard {
  id: string;
  /** One entry per rendered line. Words animate in individually. */
  lines: string[];
  /** Small monospace line under the statement. */
  sub?: string;
  /** Substring of `sub` to spotlight. Must appear in `sub` verbatim. */
  subEmphasis?: string;
  scale: IntroScale;
  effect?: IntroEffect;
  /** Id of the plate behind this card. Omitted means pure black. */
  backdrop?: string;
  /**
   * Gap before each line after the first lands, in ms. Raise it when the lines
   * are meant to read as separate beats rather than one sentence.
   */
  lineBeatMs?: number;
  /** Time on screen, including the exit beat. */
  ms: number;
}

/**
 * A gameplay still shown behind the intro, heavily graded down. These are
 * atmosphere, never exhibits — nothing in the game reads their pixels.
 */
export interface IntroBackdrop {
  id: string;
  /** Path under /public, produced by scripts/prepare-backdrops.mjs. */
  src: string;
  /** CSS object-position — keeps the subject in frame when the plate crops. */
  focus: string;
  /** Slow drift direction, alternated so consecutive plates don't move alike. */
  drift: "in" | "out";
}
