"use client";

/**
 * DEPARTMENT RECORD — the career, in the corner of the case select.
 *
 * The five cases used to be five unrelated runs. This is the thread between
 * them: what the department holds, what it adds up to, and — once every case is
 * on file — how it ends.
 *
 * It also has to teach the one rule a player cannot discover on their own,
 * because it contradicts what every other game has trained them to expect: a
 * retry *replaces* a case's entry rather than adding another, so going back and
 * filing a case better takes stars off. Without that line the record reads as a
 * ratchet and nobody bothers.
 *
 * The wipe is deliberately two-step. Losing five cases to a stray click on the
 * screen you pass through most often would be a miserable way to find out this
 * button exists.
 */

import { useState } from "react";
import type { CaseRecord } from "@/types";
import { MISSIONS } from "@/data/missions";
import { WANTED_MAX, wantedLabel } from "@/lib/forensics/score";
import {
  careerVerdict,
  filedCount,
  isComplete,
  type CareerTone,
} from "@/lib/game/rap-sheet";
import { Button, Panel, WantedStars } from "@/components/ui/primitives";

export const CAREER_TONE_TEXT: Record<CareerTone, string> = {
  clear: "text-clear",
  warn: "text-amber",
  danger: "text-magenta",
  critical: "text-danger",
};

export const CAREER_TONE_EDGE: Record<CareerTone, string> = {
  clear: "border-clear/45 bg-clear/6",
  warn: "border-amber/45 bg-amber/6",
  danger: "border-magenta/45 bg-magenta/6",
  critical: "border-danger/55 bg-danger/8",
};

export function RapSheetPanel({
  records,
  wantedLevel,
  onClear,
}: {
  records: Record<string, CaseRecord>;
  wantedLevel: number;
  onClear(): void;
}) {
  const [confirming, setConfirming] = useState(false);
  const filed = filedCount(records);
  const complete = isComplete(records);
  const verdict = complete ? careerVerdict(records) : null;

  return (
    <Panel
      title="DEPARTMENT RECORD"
      aside={
        <span className="font-mono text-[9px] text-ghost">
          {filed}/{MISSIONS.length}
        </span>
      }
    >
      <div className="space-y-3 px-3 py-3">
        <div>
          <WantedStars level={wantedLevel} size={15} animate={false} />
          <div
            className={`u-label mt-1.5 text-[9px] ${
              wantedLevel >= WANTED_MAX ? "text-danger" : "text-dim"
            }`}
          >
            {wantedLabel(wantedLevel)}
          </div>
        </div>

        {verdict && (
          <div className={`u-rise border px-2.5 py-2 ${CAREER_TONE_EDGE[verdict.tone]}`}>
            <div className="u-label text-[8px] text-faint">FINAL STANDING</div>
            <div
              className={`u-display mt-0.5 text-[17px] leading-tight ${
                CAREER_TONE_TEXT[verdict.tone]
              }`}
            >
              {verdict.headline}
            </div>
            <p className="mt-1.5 font-mono text-[9px] leading-relaxed text-dim">
              {verdict.body}
            </p>
          </div>
        )}

        {/* The rule the player would otherwise never find. */}
        <p className="font-mono text-[9px] leading-relaxed text-ghost">
          {filed === 0
            ? "Nothing on file. Every exhibit you file goes on your record — one entry per case, and a better filing replaces a worse one."
            : "One entry per case. Re-filing a case replaces its entry — file it better and your wanted level comes down."}
        </p>

        {filed > 0 &&
          (confirming ? (
            <div className="flex gap-2">
              <Button
                variant="danger"
                onClick={() => {
                  onClear();
                  setConfirming(false);
                }}
                className="flex-1 py-2 text-[9px]"
              >
                WIPE ALL {filed}
              </Button>
              <Button
                onClick={() => setConfirming(false)}
                className="py-2 text-[9px]"
              >
                KEEP
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => setConfirming(true)}
              className="w-full py-2 text-[9px]"
            >
              CLEAR RECORD
            </Button>
          ))}
      </div>
    </Panel>
  );
}
