/**
 * The examiner's notes — why the verdict came out the way it did, and what the
 * operator could do about it.
 *
 * The verdict screen used to be all *what*: a headline, three gauges and a
 * table of points. A player who filed a black bar over the plate read
 * EVIDENCE TAMPERING DETECTED over "the forensic system detected
 * inconsistencies", and had to reverse-engineer the model from a column of
 * percentages to learn that the bar itself was the finding. Most people do not
 * do that. They conclude the game is arbitrary and close the tab.
 *
 * So this reads the finished result and says it in words, in the department's
 * voice: the one identifier still carrying the case (with what the examiner
 * read off it), the single tamper signal that cost the most integrity, and a
 * handler's line on the next attempt.
 *
 * Every note is derived from the numbers that decided the outcome — the
 * largest `integrityCosts` term, the largest `contribution` — never from a
 * parallel heuristic. A debrief that disagreed with the score would be worse
 * than none.
 */

import type {
  ForensicResult,
  Mission,
  TamperSignals,
  TargetFinding,
} from "@/types";
import { SCORING, integrityCosts } from "./score";
import { contribution } from "./display";

export type NoteTone = "clear" | "amber" | "danger" | "cyan";

export interface ExaminerNote {
  tone: NoteTone;
  /** Short uppercase tag, e.g. 'STILL READS'. */
  tag: string;
  title: string;
  body: string;
}

export interface Debrief {
  notes: ExaminerNote[];
  /** The handler's line: what to do differently, or why nothing needs to be. */
  next: string;
}

/** Legibility at which the recovery pass reads a region back out. */
export const RESOLVE_LEGIBILITY = 45;

/** Below this many integrity points, a signal is not worth a note. */
const NOTABLE_COST = 4;

const T = SCORING.thresholds;

/**
 * How the examiner describes each tamper signal when it is the worst one.
 *
 * Two registers. `body` is for a signal that sank the exhibit; `mild` is for
 * one that was noticed and survived. Printing "does not erase every scale of
 * it" over a defocus that cost nine points, on a filing that passed, is the
 * report overstating its own finding.
 */
const SIGNAL_NOTES: Record<
  keyof TamperSignals,
  { title: string; body: string; mild: string }
> = {
  hardEdges: {
    title: "STRAIGHT-EDGED ALTERATION",
    body: "Hard, axis-aligned edges that no lens produces. A cover announces itself long before anyone asks what is under it.",
    mild: "A few straight edges that do not belong to the scene. Within tolerance, but on file.",
  },
  flatBlocks: {
    title: "ZERO-VARIANCE FILL",
    body: "Regions with no grain and no noise where the camera recorded detail. Nothing a sensor captures is that flat.",
    mild: "A small patch flatter than the sensor should produce. Not enough to call it a fill.",
  },
  foreignDetail: {
    title: "FOREIGN CONTENT",
    body: "Structure the camera never recorded — painted, stamped or pasted over the scene.",
    mild: "Some detail that does not match the capture. Could be compression; noted.",
  },
  histogramShift: {
    title: "EXPOSURE REGRADED",
    body: "The tonal range no longer matches the camera's calibration on file.",
    mild: "Exposure has drifted from the camera's calibration, inside what a bad night explains.",
  },
  frameLoss: {
    title: "EXHIBIT REFRAMED",
    body: "The capture's native dimensions are on record. Part of the frame is missing, and a missing part is a question.",
    mild: "The frame has been trimmed from its recorded dimensions. Minor, and on file.",
  },
  detailLoss: {
    title: "FRAME-WIDE DEFOCUS",
    body: "No fine structure survives anywhere in the frame. A bad lens softens a picture; it does not erase every scale of it.",
    mild: "Fine detail is down across the whole frame — the kind of softness a poor camera could explain.",
  },
  alteredFraction: {
    title: "WIDESPREAD PIXEL CHANGE",
    body: "Most of the frame differs from the capture on file.",
    mild: "Much of the frame differs slightly from the capture on file.",
  },
};

function heaviest(findings: TargetFinding[]): TargetFinding | null {
  let best: TargetFinding | null = null;
  for (const f of findings) {
    if (f.croppedOut) continue;
    if (
      !best ||
      contribution(f.weight, f.legibility) >
        contribution(best.weight, best.legibility)
    ) {
      best = f;
    }
  }
  return best;
}

export function buildDebrief(
  mission: Mission,
  result: ForensicResult
): Debrief {
  const notes: ExaminerNote[] = [];
  const top = heaviest(result.findings);
  const topPoints = top ? contribution(top.weight, top.legibility) : 0;
  const topTarget = top
    ? mission.targets.find((t) => t.id === top.targetId)
    : undefined;

  // 1. What still identifies them — named, and read out.
  const resolved = result.findings
    .filter((f) => !f.croppedOut && f.legibility >= RESOLVE_LEGIBILITY)
    .sort(
      (a, b) =>
        contribution(b.weight, b.legibility) -
        contribution(a.weight, a.legibility)
    );
  if (top && topTarget && resolved.length) {
    const others = resolved.length - 1;
    notes.push({
      // A low-weight target can still resolve on a clean filing; that is worth
      // knowing, not worth alarming anyone over.
      tone: result.outcome === "ACCEPTED" ? "amber" : "danger",
      tag: "STILL READS",
      title: `${topTarget.label.toUpperCase()} · ${Math.round(topPoints)} PTS`,
      body: `${Math.round(top.legibility)}% legible. Read by the examiner as “${topTarget.resolvedAs}”.${
        others > 0
          ? ` ${others} more identifier${others > 1 ? "s" : ""} also resolved.`
          : ""
      }`,
    });
  } else if (top && topTarget && result.identification > T.identificationLow) {
    // Nothing resolves on its own, and they still have enough. The partials
    // are the finding — say so, or "nothing reads" sits over a failed case.
    notes.push({
      tone: "amber",
      tag: "ADDS UP",
      title: `PARTIALS · ${Math.ceil(result.identification)} OF ${T.identificationLow} ALLOWED`,
      body: `No single identifier resolves, but together they clear the referral target. ${topTarget.label} carries the most: ${Math.round(topPoints)} pts at ${Math.round(top.legibility)}% legible.`,
    });
  } else {
    const cropped = result.findings.filter((f) => f.croppedOut).length;
    notes.push({
      tone: "clear",
      tag: "NOTHING READS",
      title: "NO IDENTIFIER RECOVERED",
      body: `Every target under ${RESOLVE_LEGIBILITY}% legible${
        cropped ? `, ${cropped} out of frame entirely` : ""
      }. Recovery came back empty.`,
    });
  }

  // 2. What gave the edit away — the largest term in the integrity score.
  const costs = integrityCosts(result.signals);
  const ranked = (Object.keys(costs) as (keyof TamperSignals)[])
    .filter((k) => k !== "alteredFraction")
    .sort((a, b) => costs[b] - costs[a]);
  const worst = ranked[0];
  const failedIntegrity = result.integrity < T.integrityLow;
  if (worst && costs[worst] >= NOTABLE_COST) {
    const copy = SIGNAL_NOTES[worst];
    notes.push({
      tone: failedIntegrity ? "danger" : "amber",
      tag: failedIntegrity ? "GAVE YOU AWAY" : "NOTED",
      title: `${copy.title} · −${Math.round(costs[worst])} INTEGRITY`,
      body: failedIntegrity ? copy.body : copy.mild,
    });
  } else {
    notes.push({
      tone: "clear",
      tag: "PASSES",
      title: "NO STRUCTURED EDITING FOUND",
      body: "Nothing in the frame reads as worked on. The photograph holds up as a capture.",
    });
  }

  return { notes, next: nextAttempt(result, costs, top, topTarget?.label) };
}

/**
 * The handler's line. Every branch is a move the editor can actually make, and
 * every one is backed by /forensics-check: a quarter turn of DEFOCUS plus one
 * bar over the heaviest target files cleaner than half a turn alone, on every
 * case.
 */
function nextAttempt(
  result: ForensicResult,
  costs: Record<keyof TamperSignals, number>,
  top: TargetFinding | null,
  topLabel: string | undefined
): string {
  const s = result.signals;
  const cover = costs.hardEdges + costs.flatBlocks + costs.foreignDetail;
  const name = topLabel?.toUpperCase() ?? "THE HEAVIEST TARGET";

  switch (result.outcome) {
    case "ACCEPTED":
      if (result.integrity >= 80) {
        return "Textbook. Nobody at intake will look at this twice.";
      }
      return s.detailLoss >= 0.85 && cover < NOTABLE_COST
        ? "Filed clean, but soft. Next time: a quarter turn of DEFOCUS, then one BLOCK bar over whatever still reads — a far more believable photograph."
        : "Filed clean. A lighter hand on the frame-wide work would leave a photograph nobody questions.";

    case "TAMPERING":
      if (costs.frameLoss >= Math.max(cover, costs.detailLoss)) {
        return "The crop is the finding. Don't cut evidence out — SCRUB › DEFOCUS softens it in place.";
      }
      if (cover >= costs.detailLoss) {
        return "The cover is the finding. Start with SCRUB › DEFOCUS (it's under DEGRADE) around a quarter turn, then cover only the one target still reading.";
      }
      return "You scrubbed past the window. Pull DEFOCUS back toward half travel — enough to beat recognition, not enough to erase the photograph.";

    case "INSUFFICIENT":
      return top && s.detailLoss >= 0.5
        ? `Close. ${name} alone is carrying the case — one BLOCK bar over just that, on top of the defocus, gets you under the line.`
        : "Close. Soften the whole frame a little more with SCRUB › DEFOCUS, or cover the heaviest identifier outright.";

    case "IDENTIFIED":
      return s.detailLoss < 0.3 && cover < NOTABLE_COST
        ? "Recognition had a clean read. Open SCRUB and drag DEFOCUS (under DEGRADE) toward half travel — it softens every identifier at once."
        : `${name} still resolves. Soften the frame further, or put a BLOCK bar over that one target.`;
  }
}
