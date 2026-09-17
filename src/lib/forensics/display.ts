/**
 * Display bands for the forensic readouts.
 *
 * The live rail and the verdict report each used to carry their own copy of
 * these numbers, and the copies had drifted from the model. Integrity was
 * coloured on 70/45 while the outcome actually turns on `integrityLow` (55),
 * so an exhibit at 50 rendered amber — "caution" — when it had already failed
 * the tampering check, and one at 65 rendered amber when it was comfortably
 * safe. The panel could not say what was passing because nothing in the view
 * layer knew what passing meant.
 *
 * So every band here derives from SCORING.thresholds. There are no literals in
 * this file that a rule change could leave behind.
 */

import { SCORING } from "./score";

export type Tone = "clear" | "amber" | "danger";

const T = SCORING.thresholds;

/**
 * How far above the tampering floor still counts as too close for comfort.
 *
 * This one is a presentation choice rather than a rule — the outcome knows
 * only the floor — so it is expressed as a margin on the floor rather than a
 * second threshold that could drift away from it.
 */
const INTEGRITY_MARGIN = 12;

/**
 * Identification, read the way the player has to read it: hot is bad news.
 *
 * The bands are the outcome boundaries themselves. At or above
 * `identificationHigh` they have you; at or below `identificationLow` there is
 * nothing actionable; the amber band between the two is INSUFFICIENT, which is
 * neither a win nor the end of the world.
 */
export function identificationTone(v: number): Tone {
  if (v >= T.identificationHigh) return "danger";
  if (v > T.identificationLow) return "amber";
  return "clear";
}

/** Below `integrityLow` the alteration itself becomes the finding. */
export function integrityTone(v: number): Tone {
  if (v < T.integrityLow) return "danger";
  if (v < T.integrityLow + INTEGRITY_MARGIN) return "amber";
  return "clear";
}

/**
 * A target's share of the identification score, in the same points as the
 * headline: `weight * legibility`, and every target's share sums to it exactly.
 *
 * This is the number that decides where effort should go, and ranking rows by
 * raw legibility hides it. On VC-003 a driver's face at 46% legible (weight
 * .42) costs 19 points while banded notes at 100% legible (weight .20) cost
 * 20 — the same problem, while the colours said one was fine and the other was
 * not.
 */
export function contribution(weight: number, legibility: number): number {
  return weight * legibility;
}

/**
 * A share is judged against the whole acceptance budget, because the budget is
 * what it spends. A single target at or over `identificationLow` has lost the
 * case on its own no matter what else is hidden.
 */
export function contributionTone(points: number): Tone {
  if (points >= T.identificationLow) return "danger";
  if (points >= T.identificationLow / 2) return "amber";
  return "clear";
}

/**
 * The most any one target in this case can contribute, used as the common
 * scale for the per-exhibit bars. Shares are small numbers against a 0..100
 * track — drawn raw they are all stubs — but drawn against the heaviest target
 * they stay comparable between rows, which is the only comparison that matters.
 */
export function contributionScale(weights: number[]): number {
  return Math.max(1, ...weights.map((w) => w * 100));
}

/**
 * The two headline figures as printed.
 *
 * Rounded to nearest, they contradicted the verdict printed beside them in two
 * ways. The margin caption did its own rounding, so an integrity of 63.6 read
 * "64%" over "8% ABOVE THE 55% FLOOR" — arithmetic any juror can do in their
 * head. And inside half a point of a threshold the figure itself lied: 54.6
 * printed as 55% directly above BELOW THE 55% FLOOR.
 *
 * So each is rounded in the direction its outcome is decided. Identification
 * fails above its target, so it rounds up; integrity fails below its floor, so
 * it rounds down. A printed figure then always lands on the same side of the
 * line as the verdict, and every caption is computed from the printed figure.
 */
export function shownIdentification(v: number): number {
  return Math.max(0, Math.min(100, Math.ceil(v)));
}

export function shownIntegrity(v: number): number {
  return Math.max(0, Math.min(100, Math.floor(v)));
}

/** "UNDER THE 30% TARGET" / "12% OVER THE 30% TARGET", from the printed figure. */
export function identificationCaption(v: number, under = "UNDER"): string {
  const shown = shownIdentification(v);
  return shown <= T.identificationLow
    ? `${under} THE ${T.identificationLow}% REFERRAL TARGET`
    : `${shown - T.identificationLow}% OVER THE ${T.identificationLow}% TARGET`;
}

/** "9% ABOVE THE 55% FLOOR" / "BELOW THE 55% FLOOR", from the printed figure. */
export function integrityCaption(v: number, floorName = "FLOOR"): string {
  const shown = shownIntegrity(v);
  return shown >= T.integrityLow
    ? `${shown - T.integrityLow}% ABOVE THE ${T.integrityLow}% ${floorName}`
    : `BELOW THE ${T.integrityLow}% ${floorName} — THE EDIT IS THE FINDING`;
}

/** The acceptance target: identification at or under this is a clean file. */
export const IDENTIFICATION_TARGET = T.identificationLow;
/** At or above this, the exhibit identifies you and nothing else is read. */
export const IDENTIFICATION_FAIL = T.identificationHigh;
/** Below this, the alteration is the finding. */
export const INTEGRITY_FLOOR = T.integrityLow;

/** Boundaries to rule off on the identification meter. */
export const IDENTIFICATION_MARKS = [
  T.identificationLow,
  T.identificationHigh,
];
/** Boundary to rule off on the integrity meter. */
export const INTEGRITY_MARKS = [T.integrityLow];
