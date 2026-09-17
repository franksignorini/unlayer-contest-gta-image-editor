"use client";

/**
 * Case selection and briefing.
 *
 * This is where the player learns what matters in a case *before* they spend
 * their integrity budget. The manifest is sorted by weight, so the reading
 * order is the priority order — in the bank job that puts the forearm marking
 * at the top and the balaclava at the bottom, which is the whole lesson.
 */

import type { CaseRecord } from "@/types";
import { filedCount } from "@/lib/game/rap-sheet";
import Image from "next/image";
import { MISSIONS } from "@/data/missions";
import {
  Button,
  formatClock,
  Meter,
  Panel,
  RecDot,
  Stamp,
} from "@/components/ui/primitives";
import { CameraFrame } from "@/components/hud/CameraFrame";
import { CaseIndex } from "@/components/case/CaseIndex";
import { RapSheetPanel } from "@/components/case/RapSheetPanel";
import { IntelligenceAnnex } from "@/components/case/IntelligenceAnnex";

export function CaseBriefing({
  selectedId,
  records,
  wantedLevel,
  onSelect,
  onOpen,
  onClearRecord,
}: {
  selectedId: string | null;
  records: Record<string, CaseRecord>;
  wantedLevel: number;
  onSelect(id: string): void;
  onOpen(id: string): void;
  onClearRecord(): void;
}) {
  const mission =
    MISSIONS.find((m) => m.id === selectedId) ?? MISSIONS[0];
  const targets = [...mission.targets].sort((a, b) => b.weight - a.weight);

  return (
    <main className="u-grid min-h-dvh bg-void">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel/80 px-4 py-2.5">
        <div className="flex items-baseline gap-3">
          <span className="u-display text-[15px] text-bone">VICE EVIDENCE</span>
          <span className="u-label text-[9px] text-ghost">
            OPEN CASE INDEX · SELECT AN EXHIBIT
          </span>
        </div>
        <span className="u-label text-[9px] text-faint">
          {filedCount(records)}/{MISSIONS.length} FILED
        </span>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-3 p-3 lg:grid-cols-[286px_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <CaseIndex
            selectedId={mission.id}
            records={records}
            onSelect={onSelect}
          />
          <RapSheetPanel
            records={records}
            wantedLevel={wantedLevel}
            onClear={onClearRecord}
          />
        </div>

        {/* briefing */}
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            {/* the exhibit */}
            <Panel
              title="EXHIBIT — AS RECORDED"
              tone="hot"
              aside={
                <div className="flex items-center gap-2.5">
                  {/* Kept in the header rather than over the image: the capture
                      has its own burn-in and HUD in the corners. */}
                  <Stamp tone="danger" rotate={0} className="!border !px-1.5 !py-0.5 text-[8px]">
                    UNALTERED
                  </Stamp>
                  <span className="font-mono text-[9px] text-ghost">
                    {mission.cameraId}
                  </span>
                </div>
              }
            >
              <CameraFrame
                cameraId={mission.cameraId}
                timestamp={mission.timestamp}
                location={mission.location}
                size={mission.imageSize}
                className="u-scanlines aspect-video border-b border-line/60 bg-pit"
              >
                <div className="relative aspect-video">
                  <Image
                    src={mission.image}
                    alt={`Surveillance still for case ${mission.id}`}
                    fill
                    sizes="(max-width: 1280px) 100vw, 820px"
                    priority
                    className="object-contain"
                  />
                </div>
              </CameraFrame>
              <div className="px-3.5 py-3">
                <div className="u-display text-[24px] leading-none text-bone">
                  {mission.title}
                </div>
                <div className="u-label mt-1.5 text-[10px] text-magenta">
                  {mission.crime}
                </div>
                <p className="mt-3 max-w-[68ch] font-mono text-[11.5px] leading-relaxed text-dim">
                  {mission.briefing}
                </p>
              </div>
            </Panel>

            <div className="flex flex-col gap-3">
              {/* what will convict you */}
              <Panel
                title="WHAT WILL CONVICT YOU"
                aside={
                  <span className="u-label text-[8.5px] text-ghost">
                    BY CASE WEIGHT
                  </span>
                }
              >
                <ul className="divide-y divide-line/60">
                  {targets.map((t) => (
                    <li key={t.id} className="px-3 py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="u-label text-[10.5px] text-bone">
                          {t.label}
                        </span>
                        <span className="font-mono text-[10px] text-amber">
                          {Math.round(t.weight * 100)}
                        </span>
                      </div>
                      <div className="mt-1.5">
                        <Meter
                          value={t.weight * 100}
                          tone={
                            t.weight >= 0.3
                              ? "danger"
                              : t.weight >= 0.14
                                ? "amber"
                                : "dim"
                          }
                          height={3}
                          ticks={false}
                        />
                      </div>
                      <p className="mt-1.5 font-mono text-[9.5px] leading-relaxed text-faint">
                        {t.note}
                      </p>
                    </li>
                  ))}
                </ul>
              </Panel>

              <LaunchControl
                seconds={mission.timeLimitSeconds}
                onOpen={() => onOpen(mission.id)}
              />
            </div>
          </div>

          <IntelligenceAnnex mission={mission} />
        </div>
      </div>
    </main>
  );
}

/**
 * The launch control.
 *
 * The only irreversible action on the briefing: the clock starts on click and
 * does not stop. It used to be a flat row with the limit set in it like a spec,
 * which read as information rather than as a consequence — so it now states the
 * consequence, shows the clock armed but still, and glows.
 */
function LaunchControl({
  seconds,
  onOpen,
}: {
  seconds: number;
  onOpen(): void;
}) {
  return (
    <div className="u-bracket relative border border-magenta/35 bg-panel/80">
      <div className="flex items-center gap-2 border-b border-line/70 px-3.5 py-2">
        <RecDot />
        <span className="u-label text-[8.5px] text-amber">
          CLOCK STARTS THE MOMENT YOU OPEN IT
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3.5 px-3.5 py-3.5">
        <div>
          <div className="font-mono text-[38px] leading-none tracking-tight text-bone tabular-nums">
            {formatClock(seconds)}
          </div>
          <div className="u-label mt-1.5 text-[8.5px] text-faint">
            ALONE WITH THE EXHIBIT
          </div>
        </div>

        <Button
          variant="primary"
          onClick={onOpen}
          className="u-cta grow px-7 py-4 text-[12px] sm:grow-0"
        >
          OPEN CASE FILE
        </Button>
      </div>

      {/* The clock is armed but not running: a full bar that has not moved. */}
      <div className="h-[3px] bg-pit" aria-hidden="true">
        <div className="h-full w-full bg-magenta/45" />
      </div>
    </div>
  );
}
