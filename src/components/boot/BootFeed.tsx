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
 *
 * It only ever cuts to a capture that has arrived. The exhibits are full
 * resolution PNGs, a megabyte or more each, and on a cold load the feed used to
 * cut on the clock regardless — to target boxes locking onto a black frame, or
 * a flat grey rectangle — as the first picture a judge saw. Every capture is
 * now requested the moment the feed mounts, in an invisible stack, and a cut
 * whose picture is not in yet simply holds the current one a little longer.
 */

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Mission } from "@/types";
import { MISSIONS_BY_LOAD } from "@/lib/game/difficulty";
import { CameraFrame } from "@/components/hud/CameraFrame";

/** How long each capture holds before the feed cuts to the next. */
const FEED_MS = 2800;

/**
 * Shared by the invisible stack and the visible frame, so both resolve to the
 * same image URL — which is what makes the stack a warm cache for the frame.
 */
const FEED_SIZES = "(max-width: 1024px) 100vw, 520px";

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

/** The next capture after `from` whose picture has arrived, or `from` itself. */
function nextArrived(from: number, arrived: ReadonlySet<string>): number {
  for (let step = 1; step <= MISSIONS_BY_LOAD.length; step++) {
    const i = (from + step) % MISSIONS_BY_LOAD.length;
    if (arrived.has(MISSIONS_BY_LOAD[i].id)) return i;
  }
  return from;
}

export function BootFeed({ live }: { live: boolean }) {
  const [index, setIndex] = useState(0);
  const [arrived, setArrived] = useState<ReadonlySet<string>>(new Set());
  // Read inside the interval without restarting it on every arrival.
  const arrivedRef = useRef(arrived);
  useEffect(() => {
    arrivedRef.current = arrived;
  }, [arrived]);

  const markArrived = (id: string) =>
    setArrived((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));

  useEffect(() => {
    if (!live) return;
    const id = setInterval(
      () =>
        setIndex((i) => {
          // Advance from the capture actually on screen — see `shownIndex`.
          const got = arrivedRef.current;
          const from = got.has(MISSIONS_BY_LOAD[i].id) ? i : nextArrived(i, got);
          return nextArrived(from, got);
        }),
      FEED_MS
    );
    return () => clearInterval(id);
  }, [live]);

  // A feed that goes live before its first capture has arrived opens on
  // whichever one has, rather than sitting on static waiting for the lightest.
  const shownIndex = arrived.has(MISSIONS_BY_LOAD[index].id)
    ? index
    : nextArrived(index, arrived);
  const mission = MISSIONS_BY_LOAD[shownIndex];
  const onAir = live && arrived.has(mission.id);

  return (
    <div className="mt-3">
      <div className="relative aspect-video overflow-hidden border border-line bg-pit">
        {/* Every capture, requested at once and never shown — the feed's
            buffer. Same `sizes` as the visible frame, so the frame's request
            is a cache hit by the time the feed cuts to it.

            Eager, not next/image's default lazy. A lazy image waits for the
            browser to see it on screen, and a page in a background tab is
            never seen: a player who opened the link and looked away during
            the cold open came back to a feed stuck on ACQUIRING SIGNAL with
            every capture already downloaded. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-0">
          {MISSIONS_BY_LOAD.map((m) => (
            <Image
              key={m.id}
              src={m.image}
              alt=""
              fill
              loading="eager"
              sizes={FEED_SIZES}
              onLoad={() => markArrived(m.id)}
              className="object-cover"
            />
          ))}
        </div>

        {onAir ? (
          // Keyed per capture: every cut remounts the frame, which is what
          // replays the lock-on and the cut flash instead of cross-fading.
          <FeedFrame key={mission.id} mission={mission} />
        ) : (
          <div className="u-scanlines absolute inset-0 grid place-items-center">
            <span className="u-label animate-flicker text-[9px] text-ghost">
              {live ? "ACQUIRING SIGNAL…" : "NO SIGNAL · AWAITING SOURCE"}
            </span>
          </div>
        )}
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="font-mono text-[9px] text-faint tabular-nums">
          {onAir
            ? `FEED ${shownIndex + 1}/${MISSIONS_BY_LOAD.length} · ${mission.id} · ${mission.title.toUpperCase()}`
            : "MUNICIPAL CCTV NETWORK"}
        </span>
        {onAir && (
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
          loading="eager"
          sizes={FEED_SIZES}
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
