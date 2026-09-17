"use client";

/**
 * CCTV furniture wrapped around an exhibit.
 *
 * The exhibits are real in-game captures, so nothing in the pixels themselves
 * says "this came off a security camera". This supplies that reading: framing
 * reticle, record light, channel ident, burnt-in timecode and a tracking band
 * drifting down the picture. It is always on, because on a real camera none of
 * this is an interaction — it is a property of the capture.
 *
 * Never wrap the editor canvas in this. The canvas has to stay pixel-true and
 * clickable, and an overlay above it would break cursor-to-pixel mapping even
 * though this layer is `pointer-events-none`.
 */

import { useEffect, useRef } from "react";

/** Burnt-in timecode ticks at this rate. */
const FPS = 24;

export function CameraFrame({
  cameraId,
  timestamp,
  location,
  size,
  compact = false,
  className = "",
  children,
}: {
  cameraId: string;
  timestamp: string;
  location?: string;
  size?: { width: number; height: number };
  /** Thumbnails get the record light and ident only. */
  compact?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const frameRef = useRef<HTMLSpanElement>(null);

  // The timecode runs for as long as the exhibit is on screen, so it is
  // written straight to the DOM. Holding it in state would re-render this
  // subtree 24 times a second for two characters of text.
  useEffect(() => {
    if (compact) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let n = 0;
    const id = window.setInterval(() => {
      n = (n + 1) % FPS;
      const el = frameRef.current;
      if (el) el.textContent = `:${String(n).padStart(2, "0")}`;
    }, 1000 / FPS);
    return () => window.clearInterval(id);
  }, [compact]);

  const [date, clock] = timestamp.split(" ");

  return (
    <div className={`relative isolate overflow-hidden ${className}`}>
      {children}

      {/* Everything below is furniture: never intercept the pointer. */}
      <div className="u-cam-hud pointer-events-none absolute inset-0 z-[6]">
        {/* Tracking band — the tell that this is tape, not a photograph. */}
        <div className="u-cam-track absolute inset-x-0 top-0 h-[12%]" />

        {(["tl", "tr", "bl", "br"] as const).map((corner) => (
          <span key={corner} className={`u-cam-corner u-cam-corner--${corner}`} />
        ))}

        <div className="absolute inset-0 flex flex-col justify-between p-2 sm:p-2.5">
          <div className="flex items-start justify-between gap-3">
            <span className="flex items-center gap-1.5 font-mono text-[9px] tracking-wide text-bone/80 [text-shadow:0_1px_2px_rgb(0_0_0/0.9)]">
              <span className="u-cam-rec h-1.5 w-1.5 rounded-full bg-danger" />
              REC
              <span className="text-bone/50">{cameraId}</span>
            </span>

            {!compact && (
              <span className="text-right font-mono text-[9px] leading-tight tabular-nums text-bone/65 [text-shadow:0_1px_2px_rgb(0_0_0/0.9)]">
                {date}
                <br />
                {clock}
                <span ref={frameRef} className="text-magenta">
                  :00
                </span>
              </span>
            )}
          </div>

          {!compact && (
            <div className="flex items-end justify-between gap-3">
              <span className="u-label max-w-[60%] truncate text-[8px] text-bone/55 [text-shadow:0_1px_2px_rgb(0_0_0/0.9)]">
                {location}
              </span>
              {size && (
                <span className="font-mono text-[8px] tabular-nums text-bone/40 [text-shadow:0_1px_2px_rgb(0_0_0/0.9)]">
                  {size.width}×{size.height}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
