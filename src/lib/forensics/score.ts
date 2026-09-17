/**
 * The scoring model.
 *
 * Every tunable number lives in SCORING. The design intent is a genuine tension
 * with no dominant strategy:
 *
 *   - Hiding evidence lowers `identification` (good — they can't place you).
 *   - Every crude way of hiding it lowers `integrity` (bad — they can see the
 *     file was worked on).
 *
 * So a solid black bar over a face beats facial recognition and guarantees
 * TAMPERING DETECTED, while a delicate blur keeps the photograph plausible but
 * leaves identity behind. Good play is spending a limited integrity budget on
 * the evidence that actually matters in *this* case.
 */

import type {
  EvidenceModification,
  ForensicResult,
  ModificationKind,
  Outcome,
  TamperSignals,
  TargetFinding,
  TargetTreatment,
} from "@/types";
import { clamp, clamp01 } from "./image";

export const SCORING = {
  /**
   * Working resolution for ALL analysis, live rail and final verdict alike.
   * There is deliberately no second, cheaper resolution — see the note on
   * `ForensicAnalyzer.create`.
   */
  workWidth: 512,
  /**
   * Evidence regions are resampled to this square before comparison, from the
   * SOURCE image rather than the working frame. Large enough that a mosaic
   * keeps its flat block interiors — at 44 the second resampling smoothed them
   * into something indistinguishable from texture, and pixelation scored as
   * though nothing had been hidden.
   */
  patchSize: 88,
  /** Block size for variance/foreign-detail sweeps, in working pixels. */
  blockSize: 16,

  /**
   * How a region's remaining legibility is composed. Detail dominates: a face
   * that has lost its fine structure is unusable to recognition even if the
   * colours still roughly match.
   */
  legibility: {
    detail: 0.85,
    // Light on purpose. Matching the original's colour and layout is weak
    // identification on its own, and weighting it higher put a hard floor
    // under every target: a region blurred into nothing still scored ~20,
    // which on some cases sat above the pass threshold all by itself.
    similarity: 0.15,
  },

  /** Pixel delta above which a pixel counts as materially changed. */
  alteredThreshold: 12,

  /** Gradient magnitude above which an edge counts as "hard". */
  hardEdgeThreshold: 58,
  /**
   * An introduced edge only reads as *drawn* when it is strongly axis aligned:
   * sharp across one axis while the perpendicular gradient stays below
   * `hardEdgeThreshold * axisDominance`.
   */
  axisDominance: 0.5,
  /**
   * Edge detection reports a border a couple of pixels thick, so the perimeter
   * a compact alteration "should" have is scaled by this before comparison.
   */
  hardEdgePerimeterScale: 2.2,

  /**
   * Confidence ramps. Crudeness is a ratio measured over the edited area, so a
   * handful of stray pixels could otherwise read as total tampering. Full
   * weight needs at least this much actual editing.
   */
  crudenessMinPixels: 220,
  crudenessMinBlocks: 5,
  /**
   * A block only counts as "replaced" — and so only enters the crudeness
   * ratio — when at least this fraction of its pixels changed. Blocks
   * straddling the border of a redaction are half original content and would
   * otherwise dilute the score.
   */
  blockReplacedFraction: 0.6,

  /** Original variance above / edited variance below → a flat fill. */
  flatBlockOrigVariance: 40,
  flatBlockEditVariance: 5,
  /** Edited variance above origVar * k + b → content that wasn't there. */
  foreignVarianceFactor: 2.2,
  foreignVarianceBias: 34,

  /** Integrity is 100 minus these, each scaled by its 0..1 signal. */
  integrityPenalty: {
    hardEdges: 46,
    // Weighted above hard edges on purpose: a region of literally zero
    // variance where the camera recorded detail is the least ambiguous
    // artifact there is. Introduced edges can hide among a scene's own
    // straight lines; destroyed variance cannot be explained away.
    flatBlocks: 48,
    foreignDetail: 30,
    histogramShift: 26,
    frameLoss: 60,
    // Deliberately light: sheer quantity of change is a weak tell on its own.
    // A heavy blur alters most of the frame but is not, by itself, crude.
    alteredFraction: 10,
    // The defocus tell, and the reason the SCRUB slider is a decision rather
    // than a lever you pull to the end. Every filter in the editor is global,
    // so the only way to soften a face is to soften the photograph — and a
    // surveillance still with no fine structure anywhere is as plainly worked
    // on as one with a bar across it. Weighted just under a redaction: a
    // defocus destroys as much, but it is at least the kind of damage a bad
    // camera could also do.
    //
    // Sized so the window is comfortable rather than a knife-edge: at 44 the
    // half-travel play cleared `integrityLow` by a single point on two cases,
    // which is not a window, it is a coincidence. The overcooked end still
    // lands well under the threshold.
    detailLoss: 40,
  },

  /**
   * Detail loss is charged on a steep curve, and the steepness is doing real
   * work rather than expressing a preference.
   *
   * The raw signal saturates early: measured across the five cases, a quarter
   * turn of DEFOCUS already destroys ~70% of the frame's structure, half turn
   * ~90%, and full travel ~98%. Charged anywhere near linearly, the entire top
   * half of the slider is one undifferentiated blob about five points of
   * integrity wide — which is not enough to hold "enough" and "too much"
   * apart, and left one case winnable only by a single point.
   *
   * A fourth power spreads that 0.90–0.98 band across ~11 points instead, so
   * the window has margin on both sides. It also makes a light re-encode
   * almost free, which is correct: softening an exhibit slightly is what real
   * recompression does, while erasing every scale of structure in it is not
   * something that happens by accident.
   */
  detailLossCurve: 4,

  /**
   * Frame loss is charged on a curve, not linearly. Trimming an edge is
   * unremarkable; a heavy reframe of an exhibit whose native dimensions are on
   * record is itself strong evidence of manipulation.
   */
  frameLossCurve: 0.7,

  suspicion: {
    fromIntegrity: 0.72,
    fromAltered: 0.28,
  },

  thresholds: {
    /** At or below this identification, there is nothing actionable. */
    identificationLow: 30,
    /** At or above this, they have you. */
    identificationHigh: 58,
    /** Below this integrity, the alteration itself is the finding. */
    integrityLow: 55,
    /** Identification this high is the catastrophic ending. */
    identificationDamning: 78,
  },

  /** Region treatment classification. */
  treatment: {
    redactedUniformity: 0.82,
    redactedDetail: 0.14,
    /** Absolute patch variance at or under which a region reads as a fill. */
    redactedVariance: 6,
    obscuredDetail: 0.32,
    degradedDetail: 0.74,
    replacedVarianceFactor: 2.0,
  },
} as const;

/* ------------------------------------------------------------------ *
 * Aggregation
 * ------------------------------------------------------------------ */

/** Weighted identification confidence across a case's evidence targets. */
export function identificationFrom(findings: TargetFinding[]): number {
  const total = findings.reduce((s, f) => s + f.weight, 0);
  if (total <= 0) return 0;
  const acc = findings.reduce((s, f) => s + f.weight * f.legibility, 0);
  return clamp(acc / total, 0, 100);
}

/**
 * What each tamper signal cost, in points of integrity.
 *
 * The one place the penalty maths lives. `integrityFrom` is their sum, and the
 * verdict's examiner notes rank findings by these same numbers — so the note
 * that says "this is what gave you away" is always the largest term in the
 * score that actually decided the outcome, never a guess alongside it.
 */
export function integrityCosts(
  signals: TamperSignals
): Record<keyof TamperSignals, number> {
  const p = SCORING.integrityPenalty;
  return {
    hardEdges: signals.hardEdges * p.hardEdges,
    flatBlocks: signals.flatBlocks * p.flatBlocks,
    foreignDetail: signals.foreignDetail * p.foreignDetail,
    histogramShift: signals.histogramShift * p.histogramShift,
    frameLoss: Math.pow(signals.frameLoss, SCORING.frameLossCurve) * p.frameLoss,
    detailLoss:
      Math.pow(signals.detailLoss, SCORING.detailLossCurve) * p.detailLoss,
    alteredFraction: signals.alteredFraction * p.alteredFraction,
  };
}

export function integrityFrom(signals: TamperSignals): number {
  const penalty = Object.values(integrityCosts(signals)).reduce(
    (sum, cost) => sum + cost,
    0
  );
  return clamp(100 - penalty, 0, 100);
}

export function suspicionFrom(
  integrity: number,
  signals: TamperSignals
): number {
  const s = SCORING.suspicion;
  return clamp(
    (100 - integrity) * s.fromIntegrity +
      signals.alteredFraction * 100 * s.fromAltered,
    0,
    100
  );
}

export function classifyTreatment(input: {
  croppedOut: boolean;
  detailRatio: number;
  uniformity: number;
  varianceRatio: number;
  /** The edited patch's own luminance variance, in absolute terms. */
  patchVariance: number;
}): TargetTreatment {
  const t = SCORING.treatment;
  if (input.croppedOut) return "cropped";
  // Uniformity is relative, and a heavy defocus collapses a small target's
  // variance by 95% too — so on its own it called a whole-frame blur a
  // REDACTION on the plate and the associate, in red, in the rail and the log,
  // on the one strategy the game is built to reward. What a bar leaves that a
  // blur does not is a patch with essentially no variance left at all.
  if (
    input.uniformity >= t.redactedUniformity &&
    input.detailRatio <= t.redactedDetail &&
    input.patchVariance <= t.redactedVariance
  ) {
    return "redacted";
  }
  if (input.varianceRatio >= t.replacedVarianceFactor && input.detailRatio > t.obscuredDetail) {
    return "replaced";
  }
  if (input.detailRatio <= t.obscuredDetail) return "obscured";
  if (input.detailRatio <= t.degradedDetail) return "degraded";
  return "untouched";
}

/* ------------------------------------------------------------------ *
 * Outcome
 * ------------------------------------------------------------------ */

export function decideOutcome(
  identification: number,
  integrity: number
): Outcome {
  const t = SCORING.thresholds;
  // Being identified is the worst case and overrides everything else — a
  // pristine-looking photograph that still shows your face is not a success.
  if (identification >= t.identificationHigh) return "IDENTIFIED";
  if (integrity < t.integrityLow) return "TAMPERING";
  if (identification <= t.identificationLow) return "ACCEPTED";
  return "INSUFFICIENT";
}

/**
 * The ceiling.
 *
 * Six, not five. GTA's classic-era maximum, and the thing the player is left
 * with when a run goes as badly as it can: five stars is a warrant, six is the
 * whole city. Keeping it here means the reducer, the star row and the exported
 * case card can never disagree about how many there are.
 */
export const WANTED_MAX = 6;

/**
 * What each rung is called. The number alone does not say what has happened to
 * you — "3" is abstract, "ACTIVE PURSUIT" is not.
 */
const WANTED_LABELS = [
  "NO ACTIVE INTEREST",
  "FLAGGED",
  "PERSON OF INTEREST",
  "ACTIVE PURSUIT",
  "ALL UNITS ALERTED",
  "WARRANT ISSUED",
  "CITYWIDE MANHUNT",
] as const;

export function wantedLabel(level: number): string {
  const i = Math.max(0, Math.min(WANTED_MAX, Math.round(level)));
  return WANTED_LABELS[i];
}

export function wantedDeltaFor(
  outcome: Outcome,
  identification: number
): number {
  switch (outcome) {
    case "ACCEPTED":
      return 0;
    case "INSUFFICIENT":
      return 1;
    case "TAMPERING":
      return 2;
    case "IDENTIFIED":
      return identification >= SCORING.thresholds.identificationDamning ? 5 : 4;
  }
}

export interface OutcomeCopy {
  headline: string;
  caseStatus: string;
  body: string;
  tone: "clear" | "warn" | "danger" | "critical";
}

/**
 * The verdict's second paragraph, which has to agree with the numbers under it.
 *
 * ACCEPTED is the outcome that needs this. A player can win two ways — file a
 * photograph that never showed anything, or file one they scrubbed down until
 * it no longer does — and the flat copy described only the first. It read "the
 * submitted exhibit is consistent with an unaltered capture" directly above an
 * EXHIBIT INTEGRITY of 63% and a SUSPICION of 40%, which is the department
 * calling its own report a liar.
 *
 * The thresholds here are deliberately not the ones the outcome is decided on.
 * These only choose words; the verdict is already settled by the time this is
 * read.
 */
export function outcomeBody(outcome: Outcome, result: ForensicResult): string {
  if (outcome !== "ACCEPTED") return OUTCOME_COPY[outcome].body;
  // A clean pass can still be a visibly soft photograph — a quarter turn of
  // DEFOCUS files at ~85 integrity with most of the frame's fine structure
  // gone. "Consistent with an unaltered capture" over that picture contradicted
  // the examiner's own FRAME-WIDE DEFOCUS note printed directly beneath it.
  if (result.integrity >= 78 && result.signals.detailLoss >= 0.5) {
    return "No actionable evidence found. The exhibit is soft across the whole frame — within what a municipal camera produces, and not worth a second look. Nothing in it supports an identification.";
  }
  if (result.integrity >= 78) return OUTCOME_COPY.ACCEPTED.body;
  if (result.integrity >= 55) {
    return "No actionable evidence found. The exhibit shows degradation consistent with a poor capture — noted, not pursued. Nothing in it supports an identification.";
  }
  return "No actionable evidence found. The exhibit is in poor condition and its evidentiary value is marginal, but there is nothing in it to identify anyone by. Filed without further action.";
}

export const OUTCOME_COPY: Record<Outcome, OutcomeCopy> = {
  ACCEPTED: {
    headline: "EVIDENCE ACCEPTED",
    caseStatus: "CLOSED",
    body: "No actionable evidence found. The submitted exhibit is consistent with an unaltered capture and contains no identifiable subject.",
    tone: "clear",
  },
  INSUFFICIENT: {
    headline: "INSUFFICIENT EVIDENCE",
    caseStatus: "SUSPENDED",
    body: "The investigation cannot establish probable cause on the exhibit as submitted. Partial identifiers remain but fall below the threshold for referral.",
    tone: "warn",
  },
  TAMPERING: {
    headline: "EVIDENCE TAMPERING DETECTED",
    caseStatus: "ESCALATED",
    body: "The forensic system detected inconsistencies in the exhibit. Chain of custody is compromised and the file has been referred for internal review.",
    tone: "danger",
  },
  IDENTIFIED: {
    headline: "IDENTIFICATION CONFIRMED",
    caseStatus: "REFERRED FOR ARREST",
    body: "Subject identified from the submitted exhibit. Recognition confidence exceeds the referral threshold. A warrant request has been generated.",
    tone: "critical",
  },
};

/* ------------------------------------------------------------------ *
 * Modification log
 * ------------------------------------------------------------------ */

const KIND_LABEL: Record<ModificationKind, string> = {
  "detail-loss": "DETAIL",
  redaction: "REDACTION",
  "foreign-content": "FOREIGN",
  exposure: "EXPOSURE",
  reframe: "REFRAME",
};

let modSeq = 0;

function mod(
  at: number,
  kind: ModificationKind,
  label: string,
  impact: number,
  targetId?: string
): EvidenceModification {
  modSeq += 1;
  return { id: `m${modSeq}`, at, kind, label, impact, targetId };
}

/**
 * Turn the delta between two successive analyses into log lines.
 *
 * This is how the terminal "knows what the player did": the library exposes no
 * per-edit events, so each committed operation is inferred by comparing the new
 * analysis against the previous one.
 */
export function deriveModifications(
  previous: ForensicResult | null,
  next: ForensicResult,
  at: number
): EvidenceModification[] {
  const out: EvidenceModification[] = [];
  const prevIntegrity = previous?.integrity ?? 100;
  const integrityDelta = next.integrity - prevIntegrity;

  for (const f of next.findings) {
    const before = previous?.findings.find((p) => p.targetId === f.targetId);
    const wasLegible = before?.legibility ?? 100;
    const drop = wasLegible - f.legibility;

    if (f.croppedOut && !before?.croppedOut) {
      out.push(
        mod(
          at,
          "reframe",
          `${f.short} REMOVED FROM FRAME`,
          integrityDelta,
          f.targetId
        )
      );
      continue;
    }
    // 6 points is above the noise floor of re-encoding the same picture.
    if (drop >= 6) {
      const kind: ModificationKind =
        f.treatment === "redacted"
          ? "redaction"
          : f.treatment === "replaced"
            ? "foreign-content"
            : "detail-loss";
      out.push(
        mod(
          at,
          kind,
          `${f.short} · ${KIND_LABEL[kind]} -${Math.round(drop)}%`,
          integrityDelta,
          f.targetId
        )
      );
    }
  }

  const prevSignals = previous?.signals;
  const foreignDelta =
    next.signals.foreignDetail - (prevSignals?.foreignDetail ?? 0);
  const edgeDelta = next.signals.hardEdges - (prevSignals?.hardEdges ?? 0);

  // A cover moves the whole-frame signals too. One dark bar over the shooters
  // shifts the histogram and wipes out a block of fine structure, and the log
  // used to report that bar as GLOBAL EXPOSURE SHIFT 7% and FRAME DEFOCUS 17%
  // — naming two operations the player never performed, directly under the one
  // they did. Shapes, stickers and strokes commit on their own, a filter
  // commits when its panel closes, so one poll almost never carries both: when
  // a local cover is what changed, it is what gets named.
  const localCover =
    edgeDelta >= 0.05 ||
    foreignDelta >= 0.04 ||
    out.some((m) => m.kind === "redaction" || m.kind === "foreign-content");

  const exposureDelta =
    next.signals.histogramShift - (prevSignals?.histogramShift ?? 0);
  if (exposureDelta >= 0.05 && !localCover) {
    out.push(
      mod(
        at,
        "exposure",
        `GLOBAL EXPOSURE SHIFT ${Math.round(next.signals.histogramShift * 100)}%`,
        integrityDelta
      )
    );
  }

  // The defocus tell gets its own line. Without it a player who softens the
  // whole exhibit sees a list of per-target detail losses and no mention of the
  // thing that is actually costing them the case.
  const defocusDelta = next.signals.detailLoss - (prevSignals?.detailLoss ?? 0);
  if (defocusDelta >= 0.05 && !localCover) {
    out.push(
      mod(
        at,
        "detail-loss",
        `FRAME DEFOCUS ${Math.round(next.signals.detailLoss * 100)}%`,
        integrityDelta
      )
    );
  }

  if (foreignDelta >= 0.04) {
    out.push(
      mod(at, "foreign-content", "FOREIGN CONTENT INTRODUCED", integrityDelta)
    );
  }

  if (edgeDelta >= 0.05 && !out.some((m) => m.kind === "redaction")) {
    out.push(mod(at, "redaction", "HARD EDGE INTRODUCED", integrityDelta));
  }

  // A crop that removes no target still changes the exhibit's framing, and the
  // examiner notices that on its own.
  const frameDelta = next.signals.frameLoss - (prevSignals?.frameLoss ?? 0);
  if (frameDelta >= 0.02 && !out.some((m) => m.kind === "reframe")) {
    out.push(
      mod(
        at,
        "reframe",
        `FRAME REDUCED ${Math.round(next.signals.frameLoss * 100)}%`,
        integrityDelta
      )
    );
  }

  // Something changed the picture but none of the specific detectors fired.
  // Only growth counts: an undo or a DISCARD shrinks the delta, and logging
  // that as "PIXEL DELTA 0.0%" reads as a new alteration of nothing.
  if (
    !out.length &&
    next.signals.alteredFraction - (prevSignals?.alteredFraction ?? 0) >= 0.01
  ) {
    out.push(
      mod(
        at,
        "detail-loss",
        `PIXEL DELTA ${(next.signals.alteredFraction * 100).toFixed(1)}%`,
        integrityDelta
      )
    );
  }

  return out;
}

export function resultIsMeaningfullyDifferent(
  a: ForensicResult | null,
  b: ForensicResult
): boolean {
  if (!a) return true;
  return (
    Math.abs(a.identification - b.identification) >= 0.5 ||
    Math.abs(a.integrity - b.integrity) >= 0.5 ||
    a.findings.some((f, i) => f.croppedOut !== b.findings[i]?.croppedOut)
  );
}

export { clamp, clamp01 };
