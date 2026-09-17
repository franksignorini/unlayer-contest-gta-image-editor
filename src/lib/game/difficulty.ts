/**
 * Case difficulty, derived rather than authored.
 *
 * Nothing in a mission declares how hard it is, and nothing should: a hand-set
 * number drifts the moment a region or a weight is edited. Difficulty is read
 * back out of the configuration instead, from the two things that actually
 * decide how hard a case plays:
 *
 *   coverage — the combined area of the evidence regions against the frame.
 *              The game's tension is hiding evidence without the picture
 *              looking handled, so the more of the frame that has to change,
 *              the more collateral damage is unavoidable.
 *   spread   — how evenly the weight sits across targets. One dominant target
 *              can be solved with a single careful edit; four even ones force
 *              the player to divide a fixed integrity budget four ways.
 *
 * The score is then ranked against the other cases rather than compared to
 * absolute thresholds, because "hard" only means anything relative to the rest
 * of the set — and ranking keeps the labels spread however the cases are tuned.
 */

import type { Mission } from "@/types";
import { MISSIONS } from "@/data/missions";

/** 1 (lightest) to 5 (heaviest), shown as a five-dot rating. */
export type EvidenceLoad = 1 | 2 | 3 | 4 | 5;

function rawScore(mission: Mission): number {
  const frame = mission.imageSize.width * mission.imageSize.height;
  const coverage =
    mission.targets.reduce((sum, t) => sum + t.region.w * t.region.h, 0) / frame;
  const spread = 1 - Math.max(...mission.targets.map((t) => t.weight));
  // Coverage is a small fraction, so it is scaled to sit on the same order as
  // the other two terms. The weights only need to be sane relative to each
  // other; the result is ranked, never read as an absolute.
  return coverage * 100 + spread * 2 + mission.targets.length * 0.2;
}

/**
 * Every case, lightest first.
 *
 * This is the order the index presents and the order "another case" walks, not
 * the order the missions happen to be written in. Authored order ran LIGHT,
 * MODERATE, CRITICAL, HEAVY, SEVERE — a player working down the list met the
 * hardest exhibit in the set third, with two cases of experience, and had no
 * way to know that was what had happened. Case numbers stay as filed, because
 * a case number is a file reference and renumbering them would invalidate
 * every stored record; the rank is what moves.
 *
 * Computed once at module load. Case configuration is static, so recomputing
 * per render would be pure waste.
 */
export const MISSIONS_BY_LOAD: readonly Mission[] = [...MISSIONS].sort(
  (a, b) => rawScore(a) - rawScore(b)
);

const LOAD_BY_ID: ReadonlyMap<string, EvidenceLoad> = (() => {
  const map = new Map<string, EvidenceLoad>();
  MISSIONS_BY_LOAD.forEach((mission, i) => {
    // Spread ranks evenly across 1..5 regardless of how many cases exist.
    const load =
      Math.round(1 + (i / Math.max(1, MISSIONS_BY_LOAD.length - 1)) * 4);
    map.set(mission.id, Math.min(5, Math.max(1, load)) as EvidenceLoad);
  });
  return map;
})();

export function evidenceLoad(mission: Mission): EvidenceLoad {
  return LOAD_BY_ID.get(mission.id) ?? 3;
}

const LABELS: Record<EvidenceLoad, string> = {
  1: "LIGHT",
  2: "MODERATE",
  3: "HEAVY",
  4: "SEVERE",
  5: "CRITICAL",
};

export function evidenceLoadLabel(load: EvidenceLoad): string {
  return LABELS[load];
}
