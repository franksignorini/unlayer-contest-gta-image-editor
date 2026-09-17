"use client";

/**
 * Left rail: what the case is, what is incriminating, and what each tool costs.
 *
 * The tool legend carries the full verbs — the editor's own rail truncates
 * uppercase labels by pixel width, so the rail says SCRUB and this panel
 * explains what scrubbing does and what it costs.
 *
 * The manifest does the same job for the targets. Every other readout in the
 * terminal names them by a six-character code, and a code locates nothing: this
 * is the one place that says a full name, shows the pixels, and points at where
 * in the frame they are.
 */

import { useState } from "react";

import type { Mission } from "@/types";
import { EvidenceGlyph } from "@/components/hud/EvidenceGlyph";
import { ExhibitMap, RegionCrop } from "@/components/hud/RegionLocator";
import { Panel, Readout } from "@/components/ui/primitives";
import { TOOL_BRIEFINGS } from "./editor-config";

const COST_TONE = {
  low: "text-clear",
  medium: "text-amber",
  high: "text-danger",
} as const;

const COST_LABEL = {
  low: "LOW",
  medium: "MED",
  high: "HIGH",
} as const;

export function CaseRail({ mission }: { mission: Mission }) {
  // Hover previews a region, click pins it. Both, because the same control has
  // to serve a pointer sweeping down the list and a touch that has no hover at
  // all — and because a player who is mid-edit wants the box to stay put while
  // they look back at the canvas.
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const located = hovered ?? pinned;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5">
      <Panel title="CASE FILE" tone="hot">
        <div className="space-y-1.5 px-3 py-3">
          <div className="mb-2.5">
            <div className="u-display text-[22px] text-magenta">
              {mission.id}
            </div>
            <div className="u-label mt-0.5 text-[10px] text-dim">
              {mission.title}
            </div>
          </div>
          <Readout label="OFFENCE" value={mission.crime} mono={false} />
          <Readout label="LOCATION" value={mission.location} mono={false} />
          <Readout label="CAMERA" value={mission.cameraId} />
          <Readout label="CAPTURED" value={mission.timestamp} />
          <Readout
            label="EXHIBIT"
            value={`${mission.imageSize.width}×${mission.imageSize.height}`}
            tone="dim"
          />
        </div>
      </Panel>

      <Panel
        title="EVIDENCE MANIFEST"
        className="flex min-h-0 flex-[2.3] flex-col overflow-hidden"
        aside={
          <span className="u-label text-[8.5px] text-ghost">
            SELECT TO LOCATE
          </span>
        }
      >
        <div className="shrink-0 border-b border-line/80 p-1.5">
          <ExhibitMap
            image={mission.image}
            imageSize={mission.imageSize}
            targets={mission.targets}
            activeId={located}
          />
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-line/60 overflow-y-auto">
          {mission.targets.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className={`flex w-full gap-2 px-3 py-2 text-left transition-colors ${
                  located === t.id ? "bg-cyan/10" : "hover:bg-bone/5"
                }`}
                onMouseEnter={() => setHovered(t.id)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(t.id)}
                onBlur={() => setHovered(null)}
                onClick={() => setPinned((p) => (p === t.id ? null : t.id))}
                aria-pressed={pinned === t.id}
              >
                <RegionCrop
                  image={mission.image}
                  imageSize={mission.imageSize}
                  region={t.region}
                  size={40}
                  fill={0.62}
                  className="mt-[1px]"
                />
                <span className="min-w-0 flex-1">
                  <span className="u-label block truncate text-[10px] text-bone">
                    {t.label}
                  </span>
                  <span className="mt-1 flex items-center gap-1 text-ghost">
                    <span className="size-[10px] shrink-0">
                      <EvidenceGlyph kind={t.kind} />
                    </span>
                    <span className="u-label text-[8px]">
                      {t.kind.toUpperCase()}
                    </span>
                  </span>
                  {/* Why it matters is the briefing's job — under a three
                      minute clock the rail is an index, and every row carrying
                      three lines of prose pushed the last target below the
                      fold, which is precisely the one nobody finds. It comes
                      back on the row the player is actually asking about. */}
                  {located === t.id && (
                    <span className="mt-1.5 block font-mono text-[9.5px] leading-relaxed text-faint">
                      {t.note}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="MANIPULATION TOOLS"
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        aside={
          <span className="u-label text-[8.5px] text-ghost">
            RAIL · RIGHT OF EXHIBIT
          </span>
        }
      >
        <ul className="min-h-0 flex-1 divide-y divide-line/60 overflow-y-auto">
          {TOOL_BRIEFINGS.map((t) => (
            <li key={t.tool} className="px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex items-baseline gap-2">
                  <span className="u-label text-[10px] text-cyan">
                    {t.rail}
                  </span>
                  <span className="u-label text-[8.5px] text-faint">
                    {t.verb}
                  </span>
                </span>
                <span className={`u-label text-[8px] ${COST_TONE[t.cost]}`}>
                  {COST_LABEL[t.cost]} COST
                </span>
              </div>
              <p className="mt-1 font-mono text-[9.5px] leading-relaxed text-faint">
                {t.effect}
              </p>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
