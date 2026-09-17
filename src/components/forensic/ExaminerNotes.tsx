"use client";

/**
 * The examiner's notes, under the verdict banner.
 *
 * The banner says what happened and the report below it says it in numbers;
 * this is the sentence in between. It sits above the gauges on purpose — the
 * reading order of the screen is verdict, reason, evidence — and the handler's
 * line at the foot is the only place in the run that tells the player how to
 * do better, which is what turns a lost case into a retry instead of a closed
 * tab.
 */

import { useMemo } from "react";
import type { ForensicResult, Mission } from "@/types";
import { buildDebrief, type NoteTone } from "@/lib/forensics/debrief";

const TAG_TONE: Record<NoteTone, string> = {
  clear: "border-clear/50 text-clear",
  amber: "border-amber/55 text-amber",
  danger: "border-danger/60 text-danger",
  cyan: "border-cyan/55 text-cyan",
};

export function ExaminerNotes({
  mission,
  result,
}: {
  mission: Mission;
  result: ForensicResult;
}) {
  const debrief = useMemo(() => buildDebrief(mission, result), [mission, result]);

  return (
    <section
      aria-label="Examiner's notes"
      className="u-rise border border-line bg-panel/70"
      style={{ animationDelay: "120ms" }}
    >
      <div className="flex items-center justify-between border-b border-line/80 px-3.5 py-1.5">
        <span className="u-label text-[9.5px] text-dim">EXAMINER&apos;S NOTES</span>
        <span className="font-mono text-[8.5px] text-ghost">
          {mission.id} · FINDINGS
        </span>
      </div>

      <ul className="divide-y divide-line/60">
        {debrief.notes.map((note, i) => (
          <li
            key={note.tag}
            className="u-rise grid grid-cols-[92px_minmax(0,1fr)] gap-3 px-3.5 py-2.5"
            style={{ animationDelay: `${220 + i * 110}ms` }}
          >
            <span
              className={`u-label self-start border px-1.5 py-0.5 text-center text-[8px] ${TAG_TONE[note.tone]}`}
            >
              {note.tag}
            </span>
            <div className="min-w-0">
              <div className="u-label text-[10.5px] text-bone">{note.title}</div>
              <p className="mt-0.5 font-mono text-[10px] leading-relaxed text-dim">
                {note.body}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div
        className="u-rise flex gap-3 border-t border-cyan/30 bg-cyan/5 px-3.5 py-2.5"
        style={{ animationDelay: `${220 + debrief.notes.length * 110}ms` }}
      >
        <span className="u-label shrink-0 pt-px text-[8.5px] text-cyan">
          HANDLER ›
        </span>
        <p className="font-mono text-[10.5px] leading-relaxed text-bone">
          {debrief.next}
        </p>
      </div>
    </section>
  );
}
