"use client";

/**
 * The deadline.
 *
 * The clock is the antagonist of the whole game — every decision in the editor
 * is a decision about how much time it is worth — so it is built to be read
 * from the corner of the eye and to get louder as it runs out. It escalates in
 * four stages rather than switching once at the end, because a single late
 * warning gives the player nothing to plan against.
 */

import { formatClock } from "@/components/ui/primitives";

export type DeadlineStage = "calm" | "elevated" | "urgent" | "critical";

/**
 * Absolute thresholds near the end, proportional at the start: fifteen seconds
 * is the same amount of panic whether the case allowed three minutes or five,
 * but "past halfway" only means anything relative to the case.
 *
 * Each absolute cutoff is also capped as a fraction of the limit, so the stages
 * stay in order for a short case — otherwise a 60s mission would open already
 * "urgent" and never pass through "elevated" at all.
 */
export function deadlineStage(remaining: number, total: number): DeadlineStage {
  if (remaining <= Math.min(15, total * 0.12)) return "critical";
  if (remaining <= Math.min(45, total * 0.3)) return "urgent";
  if (remaining <= total * 0.5) return "elevated";
  return "calm";
}

const DIGITS: Record<DeadlineStage, string> = {
  calm: "text-bone",
  elevated: "text-amber",
  urgent: "text-danger",
  critical: "text-danger",
};

const BAR: Record<DeadlineStage, string> = {
  calm: "bg-cyan text-cyan",
  elevated: "bg-amber text-amber",
  urgent: "bg-danger text-danger",
  critical: "bg-danger text-danger",
};

const DOT: Record<DeadlineStage, string> = {
  calm: "bg-cyan/70",
  elevated: "bg-amber animate-blink",
  urgent: "bg-danger animate-blink",
  critical: "bg-danger animate-blink",
};

const CAPTION: Record<DeadlineStage, string> = {
  calm: "text-faint",
  elevated: "text-faint",
  urgent: "text-danger",
  critical: "text-danger animate-blink",
};

/** The label escalates too — it costs nothing and it reads as the system closing in. */
const LABEL: Record<DeadlineStage, string> = {
  calm: "AUTOMATED ANALYSIS IN",
  elevated: "AUTOMATED ANALYSIS IN",
  urgent: "INTAKE CLOSING",
  critical: "FILING NOW",
};

export function DeadlineClock({
  remaining,
  stage,
}: {
  remaining: number;
  stage: DeadlineStage;
}) {
  // Keyed on the whole second so the punch restarts by remount. Deriving it
  // here rather than from a timer keeps the animation locked to the number the
  // player is actually reading, even though `remaining` ticks four times a second.
  const second = Math.max(0, Math.ceil(remaining));

  return (
    <div className="flex items-center gap-3">
      <span
        className={`size-[7px] shrink-0 rounded-full ${DOT[stage]}`}
        aria-hidden="true"
      />
      <div>
        <div className={`u-label text-[8.5px] ${CAPTION[stage]}`}>
          {LABEL[stage]}
        </div>
        <div
          className={stage === "critical" ? "u-clock-critical" : ""}
          role="timer"
          aria-live="off"
          aria-label={`${second} seconds before automated analysis`}
        >
          <span
            key={second}
            className={`u-clock-tick font-mono text-[clamp(32px,3.6vw,44px)] leading-none tracking-tight tabular-nums ${DIGITS[stage]}`}
          >
            {formatClock(remaining)}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * The drain. Peripheral awareness without reading digits — scaled rather than
 * resized, so a bar that updates four times a second never touches layout.
 */
export function DeadlineDrain({
  remaining,
  total,
  stage,
}: {
  remaining: number;
  total: number;
  stage: DeadlineStage;
}) {
  const left = Math.max(0, Math.min(1, remaining / total));
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 h-[3px] overflow-hidden bg-pit"
      aria-hidden="true"
    >
      <div
        className={`h-full origin-left ${BAR[stage]}`}
        style={{
          transform: `scaleX(${left})`,
          boxShadow:
            stage === "calm" ? undefined : "0 0 12px 1px currentColor",
        }}
      />
    </div>
  );
}
