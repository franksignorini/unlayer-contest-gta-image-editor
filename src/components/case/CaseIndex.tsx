"use client";

/**
 * The case index.
 *
 * Five separate jobs, not a list of files. Each row has to answer three
 * questions at a glance — which case is this, how hard is it, and have I
 * already done it — because the player picks from here and the choice should
 * feel like choosing a level rather than scrolling a directory.
 */

import Image from "next/image";
import type { CaseRecord, Mission } from "@/types";
import { MISSIONS } from "@/data/missions";
import {
  MISSIONS_BY_LOAD,
  evidenceLoad,
  evidenceLoadLabel,
} from "@/lib/game/difficulty";
import { outcomeMark } from "@/lib/game/rap-sheet";
import { operatorRating } from "@/lib/game/rating";
import { formatClock, Meter } from "@/components/ui/primitives";

export function CaseIndex({
  selectedId,
  records,
  onSelect,
}: {
  selectedId: string;
  records: Record<string, CaseRecord>;
  onSelect(id: string): void;
}) {
  const solved = Object.keys(records).length;

  return (
    <nav aria-label="Case index" className="flex flex-col gap-2">
      <div className="border border-line bg-panel/60 px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="u-label text-[9.5px] text-dim">CASE INDEX</span>
          <span className="font-mono text-[10px] text-bone">
            {solved}
            <span className="text-faint">/{MISSIONS.length} FILED</span>
          </span>
        </div>
        <div className="mt-2">
          <Meter
            value={(solved / MISSIONS.length) * 100}
            tone={solved === MISSIONS.length ? "clear" : "magenta"}
            height={3}
            ticks={false}
          />
        </div>
        <p className="u-label mt-2 text-[8px] leading-relaxed text-ghost">
          LIGHTEST FIRST · ANY ORDER · EACH RUNS ONCE THE FILE IS OPEN
        </p>
      </div>

      {/* Lightest first. The number on a row is its rank in the set, not its
          case number — those are printed side by side and mean different
          things. */}
      {MISSIONS_BY_LOAD.map((mission, i) => (
        <CaseRow
          key={mission.id}
          mission={mission}
          index={i + 1}
          active={mission.id === selectedId}
          record={records[mission.id]}
          onSelect={() => onSelect(mission.id)}
        />
      ))}
    </nav>
  );
}

function CaseRow({
  mission,
  index,
  active,
  record,
  onSelect,
}: {
  mission: Mission;
  index: number;
  active: boolean;
  /** Undefined until the case has been filed at least once. */
  record?: CaseRecord;
  onSelect(): void;
}) {
  const load = evidenceLoad(mission);
  const filed = record !== undefined;

  return (
    <button
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={`group relative flex gap-3 border p-2 pl-3 text-left transition-colors ${
        active
          ? "border-magenta/60 bg-magenta/[0.07]"
          : "border-line bg-panel/50 hover:border-line-live hover:bg-panel-2/50"
      }`}
    >
      {/* Selection reads as a marker down the edge rather than a border tint,
          which survives the row also being marked as filed. */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-[3px] transition-colors ${
          active ? "bg-magenta" : filed ? "bg-clear/40" : "bg-transparent"
        }`}
      />

      <div className="flex shrink-0 flex-col items-center gap-1.5">
        <span
          className={`u-display text-[19px] leading-none tabular-nums ${
            active ? "text-magenta" : filed ? "text-clear/70" : "text-faint"
          }`}
        >
          {String(index).padStart(2, "0")}
        </span>
        <div className="relative size-[52px] overflow-hidden border border-line bg-pit">
          <Image
            src={mission.image}
            alt=""
            fill
            sizes="52px"
            className={`object-cover transition-opacity ${
              active ? "opacity-95" : "opacity-70 group-hover:opacity-90"
            }`}
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={`u-label text-[11px] ${active ? "text-magenta" : "text-bone"}`}
          >
            {mission.id}
          </span>
          <CaseStatus active={active} record={record} />
        </div>

        <div className="u-label mt-0.5 truncate text-[9.5px] text-dim">
          {mission.title}
        </div>
        <div className="mt-0.5 truncate font-mono text-[8.5px] text-ghost">
          {mission.cameraId}
        </div>

        <div className="mt-auto flex items-center gap-2.5 pt-2">
          <LoadDots load={load} />
          <span className="u-label text-[7.5px] text-faint">
            {evidenceLoadLabel(load)}
          </span>
          <span className="ml-auto font-mono text-[8.5px] text-faint tabular-nums">
            {/* "5ID" read as a code nobody had been given the key to. */}
            {mission.targets.length} TARGETS · {formatClock(mission.timeLimitSeconds)}
          </span>
        </div>
      </div>
    </button>
  );
}

/**
 * A filed row reports *how* it went, not just that it went. "FILED" told the
 * player nothing they could act on; the outcome tells them which case is worth
 * going back for — which is the whole point of a record that can be improved.
 */
function CaseStatus({
  active,
  record,
}: {
  active: boolean;
  record?: CaseRecord;
}) {
  if (record) {
    const mark = outcomeMark(record.outcome);
    const tone = {
      clear: "text-clear",
      warn: "text-amber",
      danger: "text-magenta",
      critical: "text-danger",
    }[mark.tone];
    return (
      <span className={`u-label shrink-0 text-[7.5px] ${tone}`}>
        {mark.short}{" "}
        <span className="text-[9px]">
          · {operatorRating(record.outcome, record.integrity).grade}
        </span>
      </span>
    );
  }
  return (
    <span
      className={`u-label shrink-0 text-[7.5px] ${
        active ? "text-amber" : "text-ghost group-hover:text-dim"
      }`}
    >
      {active ? "▸ SELECTED" : "OPEN"}
    </span>
  );
}

/** Five dots — the case's evidence load relative to the rest of the set. */
function LoadDots({ load }: { load: number }) {
  return (
    <span className="flex items-center gap-[3px]" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((step) => (
        <span
          key={step}
          className={`size-[4px] ${
            step <= load
              ? load >= 4
                ? "bg-danger"
                : load === 3
                  ? "bg-amber"
                  : "bg-cyan"
              : "bg-ghost"
          }`}
        />
      ))}
    </span>
  );
}
