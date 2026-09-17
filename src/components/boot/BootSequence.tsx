"use client";

/**
 * Cold open.
 *
 * Not a landing page — a terminal coming up. The concept has to be legible
 * within about five seconds of first paint, so the hook is stated plainly and
 * there is exactly one action.
 */

import { SoundInvite, useSoundEnabled } from "@/components/audio/SoundToggle";
import { assetPath } from "@/lib/asset-path";
import { BootFeed } from "./BootFeed";
import { IntakeCountdown } from "./IntakeCountdown";
import Image from "next/image";
import { useEffect } from "react";
import {
  Button,
  RecDot,
  useTypedLines,
} from "@/components/ui/primitives";

const BOOT_LINES = [
  "VCPD MAINFRAME · EVIDENCE INTAKE BUS ......... ONLINE",
  "DIGITAL FORENSICS UNIT · NODE 04 ............. ONLINE",
  "OPERATOR CREDENTIAL ......................... BORROWED",
  "SESSION LOGGING ............................. SUPPRESSED",
  "",
  "INBOUND EXHIBIT DETECTED. SOURCE: MUNICIPAL CCTV NETWORK.",
  "AUTOMATED FORENSIC ANALYSIS IS QUEUED AND CANNOT BE CANCELLED.",
];

/** The feed cuts in as this many log lines have started — INBOUND EXHIBIT. */
const FEED_ON_LINE = 6;

export function BootSequence({
  onEnter,
  onReplayIntro,
}: {
  onEnter(): void;
  onReplayIntro(): void;
}) {
  const { shown, done, skip } = useTypedLines(BOOT_LINES, 12);
  const soundOn = useSoundEnabled();

  // Any key or click skips ahead — nobody should sit through this twice.
  useEffect(() => {
    if (done) return;
    const handler = () => skip();
    window.addEventListener("keydown", handler);
    window.addEventListener("pointerdown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("pointerdown", handler);
    };
  }, [done, skip]);

  return (
    <main className="relative flex min-h-dvh items-center overflow-hidden bg-void">
      {/* Backdrop: a clean, on-file photograph, pushed right down so it reads
          as atmosphere behind the terminal rather than as a hero image. */}
      <div className="pointer-events-none absolute inset-0">
        <Image
          src={assetPath("/realgameimages/VINTAGE_VICE_CITY_PACK_01.jpg")}
          alt=""
          fill
          priority
          sizes="100vw"
          className="scale-105 object-cover opacity-[0.38] saturate-[0.9]"
        />
        {/* Graded down hard on the left so the headline stays readable, while
            the right half keeps enough of the image to read as a place. */}
        <div className="absolute inset-0 bg-gradient-to-r from-void via-void/80 to-void/15" />
        <div className="absolute inset-0 bg-gradient-to-t from-void via-transparent to-void/60" />
      </div>

      <div className="u-scanlines pointer-events-none absolute inset-0 z-10" />

      <div className="relative z-20 mx-auto w-full max-w-6xl px-6 py-12 md:px-12">
        {/* The headline lives in the left column rather than above the grid.
            Above it, the boot panel started under the headline and grew down
            from there — and once the panel carried the feed, that stacked the
            two heights and pushed a 1280x800 screen into a scroll. Beside it,
            the panel centres against the whole column instead. */}
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <div className="mb-8 flex items-center gap-3">
              <RecDot />
              <span className="u-label text-[10px] text-dim">
                LIVE TERMINAL · VICE CITY POLICE DEPARTMENT
              </span>
            </div>

            <h1 className="u-display mb-7 max-w-4xl text-[13vw] leading-[0.86] text-bone sm:text-[80px] lg:text-[104px]">
              ALTER THE
              <br />
              <span className="text-magenta">EVIDENCE</span>
            </h1>

            <p className="max-w-[46ch] font-mono text-[12.5px] leading-relaxed text-dim">
              A camera caught you. Normally that is where the mission ends.
            </p>
            <p className="mt-3 max-w-[46ch] font-mono text-[12.5px] leading-relaxed text-bone">
              Instead you have been handed the photograph, and{" "}
              <span className="text-amber">three minutes alone with it</span>{" "}
              before Vice City PD runs forensic analysis on whatever you file.
            </p>
            <p className="mt-3 max-w-[46ch] font-mono text-[12.5px] leading-relaxed text-faint">
              Hide what identifies you. Keep it looking like a photograph. Those
              two things fight each other — that is the whole job.
            </p>

            {/* Its own row, above the action. Sharing a line with the CTA and
                two pieces of small print is how the previous version got
                ignored — and a player who misses it plays the entire game in
                silence, which is most of what was built. */}
            <div className="mt-7">
              <SoundInvite />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-4">
              {/* This screen's one u-cta. It had none, which is precisely why
                  it could sit next to an amber advisory and lose.

                  The wrapper is keyed on the audio state so that enabling
                  sound remounts it and replays the handoff pulse — the prompt
                  above has just turned green and stopped asking for anything,
                  and this is where the player should look next. Keyed rather
                  than driven by a timer so there is no state to set from an
                  effect and nothing to clean up. */}
              <span
                key={soundOn ? "sound-on" : "sound-off"}
                className={soundOn ? "u-handoff" : "inline-block"}
              >
                <Button
                  variant="primary"
                  onClick={onEnter}
                  className="u-cta px-7 py-3.5"
                >
                  ENTER CASE FILE
                </Button>
              </span>
              {/* Nothing happens here that the player was not warned about. */}
              <IntakeCountdown onFire={onEnter} />
              <span className="u-label hidden text-[9px] text-ghost sm:inline">
                5 CASES · ~3 MIN EACH
              </span>
              {/* Quiet by design — the cold open is worth rewatching, but it
                  must never compete with the one action on this screen. */}
              <button
                type="button"
                onClick={onReplayIntro}
                className="u-label ml-auto text-[9px] text-faint underline decoration-line-hot underline-offset-4 transition-colors hover:text-cyan hover:decoration-cyan"
              >
                REPLAY INTRO
              </button>
            </div>
          </div>

          {/* boot log */}
          <div className="border border-line bg-panel/60 p-3.5 backdrop-blur-sm">
            <div className="u-label mb-2.5 text-[9px] text-faint">
              SYSTEM BOOT
            </div>
            <pre className="overflow-hidden font-mono text-[10px] leading-[1.7] whitespace-pre-wrap text-dim">
              {shown.join("\n")}
              {!done && <span className="animate-blink text-magenta">█</span>}
            </pre>
            {/* Space held from the start: the feed below is already on screen
                by the time this lands, and must not be shoved down by it. */}
            <div
              className={`mt-3 border-t border-line/70 pt-2.5 ${
                done ? "u-rise" : "invisible"
              }`}
            >
              <div className="u-label text-[9px] text-amber">
                EXHIBIT ACQUIRED · AWAITING OPERATOR
              </div>
            </div>
            {/* Cuts in on the line that announces it, so the log reads as the
                reason the picture appeared. */}
            <BootFeed live={shown.length >= FEED_ON_LINE} />
          </div>
        </div>
      </div>
    </main>
  );
}
