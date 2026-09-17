"use client";

/**
 * The inbound feed — the cold open's proof.
 *
 * The boot screen used to state the premise in words and then show a boot log
 * three quarters empty: a tall bordered box with four lines at the top of it.
 * The premise is "a camera caught you", and the one thing the screen never did
 * was show a camera catching anyone. So the space under the log is now the
 * department's own feed, cutting between the five captures on file and locking
 * onto what in each frame identifies you.
 *
 * It arrives on the log line that announces it — INBOUND EXHIBIT DETECTED —
 * rather than on mount, so the log reads as the reason the picture appeared.
 * The boxes are the missions' own evidence regions, the same pixel boxes the
 * forensic model scores, so the first thing a player is shown is the literal
 * list of things they are about to have to hide.
 */

import Image from "next/image";
import { useEffect, useState } from "react";
import type { Mission } from "@/types";
import { MISSIONS_BY_LOAD } from "@/lib/game/difficulty";
import { CameraFrame } from "@/components/hud/CameraFrame";

/** How long each capture holds before the feed cuts to the next. */
const FEED_MS = 2800;

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

export function BootFeed({ live }: { live: boolean }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % MISSIONS_BY_LOAD.length),
      FEED_MS
    );
    return () => clearInterval(id);
  }, [live]);

  const mission = MISSIONS_BY_LOAD[index];

  return (
    <div className="mt-3">
      <div className="relative aspect-video overflow-hidden border border-line bg-pit">
        {live ? (
          // Keyed per capture: every cut remounts the frame, which is what
          // replays the lock-on and the cut flash instead of cross-fading.
          <FeedFrame key={mission.id} mission={mission} />
        ) : (
          <div className="u-scanlines absolute inset-0 grid place-items-center">
            <span className="u-label animate-flicker text-[9px] text-ghost">
              NO SIGNAL · AWAITING SOURCE
            </span>
          </div>
        )}
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="font-mono text-[9px] text-faint tabular-nums">
          {live
            ? `FEED ${index + 1}/${MISSIONS_BY_LOAD.length} · ${mission.id} · ${mission.title.toUpperCase()}`
            : "MUNICIPAL CCTV NETWORK"}
        </span>
        {live && (
          <span
            key={mission.id}
            className="u-rise u-label shrink-0 text-[9px] text-danger"
          >
            {mission.targets.length} IDENTIFIERS IN FRAME
          </span>
        )}
      </div>
    </div>
  );
}

function FeedFrame({ mission }: { mission: Mission }) {
  const { width, height } = mission.imageSize;
  // The heaviest target gets the lock and the label: it is the one the case
  // turns on, and the first thing the briefing will list.
  const lead = mission.targets.reduce((a, b) => (b.weight > a.weight ? b : a));
  // A lead region hard against the top edge takes its label underneath, or
  // the frame's own overflow would cut it off.
  const labelBelow = lead.region.y / height < 0.1;

  return (
    <div className="absolute inset-0">
      <CameraFrame
        cameraId={mission.cameraId}
        timestamp={mission.timestamp}
        location={mission.location}
        className="size-full"
      >
        <Image
          src={mission.image}
          alt={`Surveillance feed, ${mission.location}`}
          fill
          sizes="(max-width: 1024px) 100vw, 520px"
          className="object-cover opacity-90"
        />
        <div className="feed-cut pointer-events-none absolute inset-0 z-[5] bg-white" />

        <div className="pointer-events-none absolute inset-0 z-[4]">
          {mission.targets.map((target, i) => {
            const isLead = target.id === lead.id;
            return (
              <div
                key={target.id}
                className={`feed-lock absolute ${
                  isLead
                    ? "border-2 border-danger shadow-[0_0_14px_rgb(255_59_48/0.55)]"
                    : "border border-danger/55"
                }`}
                style={{
                  left: pct(target.region.x, width),
                  top: pct(target.region.y, height),
                  width: pct(target.region.w, width),
                  height: pct(target.region.h, height),
                  animationDelay: `${(isLead ? 0 : 1 + i) * 110}ms`,
                }}
              >
                {isLead && (
                  <span
                    className={`u-label absolute left-[-2px] bg-danger px-1 text-[8px] whitespace-nowrap text-void ${
                      labelBelow ? "-bottom-[15px]" : "-top-[15px]"
                    }`}
                  >
                    {target.short} · LOCKED
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </CameraFrame>
    </div>
  );
}
