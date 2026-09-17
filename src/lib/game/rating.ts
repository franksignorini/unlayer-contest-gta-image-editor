/**
 * The operator rating — how well a filing was done, not just whether it passed.
 *
 * The dossier used to close on a "FORENSIC SCORE" of 79%: a blend of the two
 * gauges printed nowhere else in the run and explained nowhere at all. A juror
 * who had just read IDENTIFICATION 11% and INTEGRITY 64% met a third number
 * with no way to check it, on the one screen meant to be shared.
 *
 * A grade answers the question the player is actually asking at that point —
 * "was that good?" — and it is derived from the outcome first, so a letter can
 * never flatter a failed case. Within ACCEPTED it reads integrity, which is
 * exactly the difference between the two ways to win: half a turn of DEFOCUS
 * files a B; a quarter turn and one bar over the heaviest target files an A
 * or better on four of the five cases (see /forensics-check,
 * `light-defocus-then-cover`). The rating is how the game says the skilled
 * line is the better one without a tutorial saying it.
 *
 * Computed from `outcome` and `integrity` only, so a stored `CaseRecord` rates
 * exactly the same as the live result it was filed from.
 */

import type { Outcome } from "@/types";

export type Grade = "S" | "A" | "B" | "C" | "D" | "F";

export interface OperatorRating {
  grade: Grade;
  title: string;
  /** One line in the department's voice. */
  line: string;
  tone: "clear" | "amber" | "magenta" | "danger";
}

/** Integrity an ACCEPTED filing needs for each grade. */
const GRADE_S = 80;
const GRADE_A = 68;

export function operatorRating(
  outcome: Outcome,
  integrity: number
): OperatorRating {
  switch (outcome) {
    case "ACCEPTED":
      if (integrity >= GRADE_S) {
        return {
          grade: "S",
          title: "GHOST",
          line: "Nobody will ever know you were in frame.",
          tone: "clear",
        };
      }
      if (integrity >= GRADE_A) {
        return {
          grade: "A",
          title: "CLEAN HANDS",
          line: "A believable photograph of nobody in particular.",
          tone: "clear",
        };
      }
      return {
        grade: "B",
        title: "SOFT FOCUS",
        line: "Free — but the photograph looks like it went through something.",
        tone: "clear",
      };
    case "INSUFFICIENT":
      return {
        grade: "C",
        title: "LOOSE ENDS",
        line: "Not enough to hold you. Enough to keep looking.",
        tone: "amber",
      };
    case "TAMPERING":
      return {
        grade: "D",
        title: "HEAVY HANDED",
        line: "You hid it. You also showed them exactly where.",
        tone: "magenta",
      };
    case "IDENTIFIED":
      return {
        grade: "F",
        title: "IN THE SYSTEM",
        line: "The photograph did its job. You did not.",
        tone: "danger",
      };
  }
}
