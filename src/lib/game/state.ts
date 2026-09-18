/**
 * The phase machine.
 *
 * One reducer owns the whole experience. Screens never navigate themselves —
 * they dispatch, and the phase decides what renders. That keeps the dramatic
 * ordering (edit → submit → analyse → verdict → dossier) in one readable place.
 */

import type {
  EvidenceModification,
  ForensicResult,
  GameState,
  Submission,
} from "@/types";
import {
  type CaseRecords,
  deriveWantedLevel,
} from "@/lib/game/rap-sheet";
import { MISSIONS_BY_LOAD } from "@/lib/game/difficulty";
import { operatorRating, type Grade } from "@/lib/game/rating";
import type { CaseRecord } from "@/types";

export const initialState: GameState = {
  phase: "intro",
  missionId: null,
  live: null,
  dirty: false,
  modifications: [],
  submission: null,
  result: null,
  wantedLevel: 0,
  records: {},
  caseOpenedAt: null,
};

export type GameAction =
  | { type: "intro-complete" }
  /** Cold open replayed from the boot screen. */
  | { type: "replay-intro" }
  | { type: "boot-complete" }
  /** Chosen at the briefing; also used by "another case". */
  | { type: "select-case"; missionId: string }
  | { type: "open-case"; missionId: string; at: number }
  /** A fresh live analysis landed while editing. */
  | { type: "live-analysis"; result: ForensicResult; added: EvidenceModification[] }
  | { type: "set-dirty"; dirty: boolean }
  /** DISCARD confirmed: the exhibit is back to the capture. */
  | { type: "exhibit-wiped" }
  | { type: "submit"; submission: Submission }
  | { type: "analysis-complete"; result: ForensicResult }
  /** Stored record restored on mount. Never dispatched on the server. */
  | { type: "hydrate"; records: CaseRecords }
  /** The player wiped their record. */
  | { type: "clear-record" }
  | { type: "view-dossier" }
  | { type: "retry" }
  | { type: "back-to-briefing" };

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "intro-complete":
      return state.phase === "intro" ? { ...state, phase: "boot" } : state;

    case "replay-intro":
      return state.phase === "boot" ? { ...state, phase: "intro" } : state;

    case "boot-complete":
      // A returning player lands on the next case they have not filed — the
      // same pick the dossier's "next case" makes — rather than on the first
      // case in the index, which they may have closed already. A fresh record
      // makes that the lightest case, as before.
      return state.phase === "boot"
        ? {
            ...state,
            phase: "briefing",
            missionId: state.missionId ?? nextCaseId(state),
          }
        : state;

    case "select-case":
      return { ...state, missionId: action.missionId };

    case "open-case":
      // Opening a case always starts from a clean evidence state.
      return {
        ...state,
        phase: "terminal",
        missionId: action.missionId,
        live: null,
        dirty: false,
        modifications: [],
        submission: null,
        result: null,
        caseOpenedAt: action.at,
      };

    case "live-analysis":
      if (state.phase !== "terminal") return state;
      return {
        ...state,
        live: action.result,
        modifications: action.added.length
          ? // Newest first, and bounded — this is a ticker, not an audit trail.
            [...action.added.reverse(), ...state.modifications].slice(0, 40)
          : state.modifications,
      };

    case "exhibit-wiped":
      // The ticker describes the exhibit on screen. After a wipe every line in
      // it describes an edit that no longer exists.
      return state.phase === "terminal"
        ? { ...state, modifications: [] }
        : state;

    case "set-dirty":
      return state.dirty === action.dirty
        ? state
        : { ...state, dirty: action.dirty };

    case "submit":
      if (state.phase !== "terminal") return state;
      return { ...state, phase: "analysis", submission: action.submission };

    case "analysis-complete": {
      if (state.phase !== "analysis") return state;
      // One entry per case, replaced on a retry. The wanted level is then read
      // back off the whole record, so filing a case better genuinely lowers it.
      const records: CaseRecords = state.missionId
        ? {
            ...state.records,
            [state.missionId]: {
              missionId: state.missionId,
              outcome: action.result.outcome,
              identification: action.result.identification,
              integrity: action.result.integrity,
              wantedDelta: action.result.wantedDelta,
              filedAt: Date.now(),
            },
          }
        : state.records;
      return {
        ...state,
        phase: "verdict",
        result: action.result,
        records,
        wantedLevel: deriveWantedLevel(records),
      };
    }

    case "hydrate":
      // Only ever applied to a fresh session, so a restored record cannot
      // overwrite a case the player has already filed in this sitting.
      return state.phase === "intro" || state.phase === "boot"
        ? {
            ...state,
            records: action.records,
            wantedLevel: deriveWantedLevel(action.records),
          }
        : state;

    case "clear-record":
      return { ...state, records: {}, wantedLevel: 0 };

    case "view-dossier":
      return state.phase === "verdict" ? { ...state, phase: "dossier" } : state;

    case "retry":
      if (!state.missionId) return state;
      return {
        ...state,
        phase: "terminal",
        live: null,
        dirty: false,
        modifications: [],
        submission: null,
        result: null,
        caseOpenedAt: Date.now(),
      };

    case "back-to-briefing":
      return {
        ...state,
        phase: "briefing",
        live: null,
        dirty: false,
        modifications: [],
        submission: null,
        result: null,
        caseOpenedAt: null,
      };
  }
}

/**
 * The next unplayed case, for the dossier's "another case" action.
 *
 * Walks the set lightest first, the same order the index presents, so a player
 * who keeps pressing the button gets a curve rather than the order the missions
 * happen to be written in.
 */
export function nextCaseId(state: GameState): string {
  const unplayed = MISSIONS_BY_LOAD.find((m) => !state.records[m.id]);
  if (unplayed) return unplayed.id;

  // Everything is on file. The button used to wrap round to the lightest case
  // — usually the one just filed — when the case worth going back for is the
  // weakest filing on the record: re-filing it is what takes stars off.
  const weakest = MISSIONS_BY_LOAD.filter((m) => m.id !== state.missionId)
    .map((m) => ({ id: m.id, standing: filingStanding(state.records[m.id]) }))
    .sort((a, b) => a.standing - b.standing)[0];
  return (weakest ?? { id: MISSIONS_BY_LOAD[0].id }).id;
}

const GRADE_ORDER: Record<Grade, number> = { F: 0, D: 1, C: 2, B: 3, A: 4, S: 5 };

/** Grade first, integrity within it — the same order the rating reads in. */
function filingStanding(record: CaseRecord | undefined): number {
  if (!record) return -1;
  const { grade } = operatorRating(record.outcome, record.integrity);
  return GRADE_ORDER[grade] * 1000 + record.integrity;
}
