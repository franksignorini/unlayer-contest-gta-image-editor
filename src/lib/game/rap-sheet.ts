/**
 * The rap sheet — what the department still holds on you when you close the tab.
 *
 * Until now a session evaporated on reload: five cases, five unrelated runs, and
 * a wanted level that reset every time. That made the six stars decoration. This
 * makes them the score.
 *
 * The important design decision here is that **the wanted level is derived from
 * the record, not accumulated as you go**. Each case contributes exactly one
 * entry, and re-filing a case *replaces* its entry rather than adding to it. So:
 *
 *   - a botched case is not permanent — go back, file it better, and your stars
 *     come down, which turns the rap sheet into something the player can work
 *     against rather than just watch get worse;
 *   - retrying can never inflate the total, which an accumulating counter did
 *     (three attempts at one case used to cost three times the stars);
 *   - the stored record is the single source of truth, so nothing can drift out
 *     of sync with what is displayed.
 *
 * Storage is best-effort. Private browsing, a cleared profile or a schema bump
 * all resolve to "no record", never to a crash — a judge opening this in a
 * locked-down browser must still get a working game.
 */

import type { CaseRecord, Outcome } from "@/types";
import { MISSIONS } from "@/data/missions";
import { WANTED_MAX } from "@/lib/forensics/score";

const STORAGE_KEY = "vice-evidence:rap-sheet";

/**
 * Bump when the shape of `CaseRecord` changes. A mismatch discards the stored
 * record rather than trying to migrate it: this is a game score, not user data,
 * and a wrong migration is worse than a clean slate.
 */
const SCHEMA_VERSION = 1;

export type CaseRecords = Record<string, CaseRecord>;

interface StoredSheet {
  version: number;
  records: CaseRecords;
}

const isRecord = (v: unknown): v is CaseRecord => {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Partial<CaseRecord>;
  return (
    typeof r.missionId === "string" &&
    typeof r.outcome === "string" &&
    typeof r.identification === "number" &&
    typeof r.integrity === "number" &&
    typeof r.wantedDelta === "number" &&
    typeof r.filedAt === "number"
  );
};

/** Never throws, and never returns a shape the reducer has to defend against. */
export function loadRapSheet(): CaseRecords {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<StoredSheet>;
    if (parsed?.version !== SCHEMA_VERSION) return {};

    const out: CaseRecords = {};
    for (const [id, value] of Object.entries(parsed.records ?? {})) {
      // Drop anything malformed, and anything naming a case that no longer
      // exists — missions are config and a case can be renamed or removed.
      if (isRecord(value) && MISSIONS.some((m) => m.id === id)) out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveRapSheet(records: CaseRecords): void {
  try {
    const payload: StoredSheet = { version: SCHEMA_VERSION, records };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* Private mode, or a full quota. The session still plays; it just forgets. */
  }
}

export function clearRapSheet(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Nothing to do — the caller resets state either way. */
  }
}

/**
 * The wanted level the record adds up to.
 *
 * Summing entries rather than incrementing a counter is what makes a retry able
 * to *lower* the total. Capped, so the ceiling is the ceiling however many
 * cases are on file.
 */
export function deriveWantedLevel(records: CaseRecords): number {
  const total = Object.values(records).reduce((n, r) => n + r.wantedDelta, 0);
  return Math.max(0, Math.min(WANTED_MAX, total));
}

export function filedCount(records: CaseRecords): number {
  return Object.keys(records).length;
}

export function isComplete(records: CaseRecords): boolean {
  return MISSIONS.every((m) => records[m.id]);
}

/** How each outcome reads as a line on a permanent record. */
const OUTCOME_MARK: Record<Outcome, { short: string; tone: CareerTone }> = {
  ACCEPTED: { short: "CLOSED", tone: "clear" },
  INSUFFICIENT: { short: "SUSPENDED", tone: "warn" },
  TAMPERING: { short: "ESCALATED", tone: "danger" },
  IDENTIFIED: { short: "WARRANT", tone: "critical" },
};

export type CareerTone = "clear" | "warn" | "danger" | "critical";

export function outcomeMark(outcome: Outcome) {
  return OUTCOME_MARK[outcome];
}

export interface CareerVerdict {
  headline: string;
  body: string;
  tone: CareerTone;
}

/**
 * The closing judgement, once every case is on file.
 *
 * Read off the wanted level rather than counting clean outcomes, because that
 * is the number the player has been watching all along — the ending has to be
 * the thing they were playing against, not a second scoring system revealed at
 * the end.
 */
export function careerVerdict(records: CaseRecords): CareerVerdict {
  const wanted = deriveWantedLevel(records);
  if (wanted === 0) {
    return {
      headline: "NO RECORD",
      body: "Five exhibits filed, nothing actionable on any of them. As far as this department is concerned you were never in frame.",
      tone: "clear",
    };
  }
  if (wanted <= 2) {
    return {
      headline: "OPEN FILE",
      body: "Enough survived the intake to keep a file open. Nothing that would hold up, but they know there is something to look for.",
      tone: "warn",
    };
  }
  if (wanted <= 4) {
    return {
      headline: "ACTIVE SUBJECT",
      body: "The department is building a case rather than reviewing one. Your name is attached to more than one exhibit.",
      tone: "danger",
    };
  }
  if (wanted < WANTED_MAX) {
    return {
      headline: "WARRANT ISSUED",
      body: "Recognition confidence held across multiple files. A judge signed it this morning.",
      tone: "critical",
    };
  }
  return {
    headline: "CITYWIDE MANHUNT",
    body: "Every unit in Vice City has your face on the dash. There is no version of this where you keep driving.",
    tone: "critical",
  };
}
