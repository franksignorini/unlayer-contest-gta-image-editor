"use client";

/**
 * The handoff — the moment the terminal stops being yours.
 *
 * Submitting used to hard-cut from the criminal terminal to the police
 * analysis in a single frame. That is the turn the whole game is built around
 * — the software you were abusing reassembles as the software judging you —
 * and it happened between two renders with nothing to mark it. So it now has
 * a beat of its own: the terminal freezes under a scrim, the filing is stamped
 * over it, write access is revoked, and the screen dies the way a CRT does —
 * collapsing to a bright line and then a point. The analysis screen powers up
 * out of that line (`crt-on`), so the two halves read as one picture.
 *
 * This is the one layer allowed over the editor canvas, and only because the
 * session is over: by the time it mounts the exhibit is being read for filing
 * and nothing on the canvas can be touched again. It takes the pointer on
 * purpose — a click landing on a tool now would edit an exhibit that has
 * already been read.
 *
 * All timing lives in CSS, keyed to FILING_MS; the terminal holds the
 * dispatch for that long so the collapse is seen to finish.
 */

import type { Submission } from "@/types";

/** The handoff's length. The terminal waits at least this long to dispatch. */
export const FILING_MS = 1000;

export function FilingOverlay({
  trigger,
}: {
  trigger: Submission["trigger"];
}) {
  const expired = trigger === "timeout";
  return (
    <div
      className="fixed inset-0 z-[60] cursor-wait select-none"
      role="status"
      aria-live="assertive"
      aria-label={expired ? "Time expired. Exhibit pulled." : "Exhibit filed."}
    >
      <div className="filing-backdrop absolute inset-0 bg-black" />

      <div className="filing-screen absolute inset-0 flex items-center justify-center overflow-hidden">
        <div className="u-scanlines absolute inset-0" />
        <div className="relative px-6 text-center">
          <div
            className={`u-label text-[10px] ${expired ? "text-danger" : "text-dim"}`}
          >
            {expired ? "TIME EXPIRED · INTAKE PULLED THE EXHIBIT" : "OPERATOR SUBMISSION"}
          </div>
          <div
            className={`outcome-slam mt-4 inline-block ${expired ? "text-danger" : "text-magenta"}`}
            style={{ animationDelay: "60ms" }}
          >
            <span className="u-stamp inline-block -rotate-3 text-[clamp(26px,4.6vw,54px)] leading-none">
              {expired ? "EXHIBIT PULLED" : "EXHIBIT FILED"}
            </span>
          </div>
          <div className="u-label mt-5 animate-flicker text-[9.5px] text-cyan">
            WRITE ACCESS REVOKED · TRANSFERRING TO VCPD DIGITAL FORENSICS
          </div>
          <div className="mx-auto mt-3 h-[2px] w-[min(18rem,70vw)] overflow-hidden bg-line">
            <div className="filing-bar h-full origin-left bg-cyan" />
          </div>
        </div>
        {/* The phosphor: the picture washes out to white as it collapses, so
            what is left at the end is a line of light, not squashed text. */}
        <div className="filing-phosphor absolute inset-0 bg-white" />
      </div>
    </div>
  );
}
