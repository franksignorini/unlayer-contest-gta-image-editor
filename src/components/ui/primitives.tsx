"use client";

/**
 * Terminal primitives.
 *
 * These carry the identity: hairline panels with corner ticks, uppercase
 * condensed labels, monospace readouts, meters that read as instruments rather
 * than progress bars. Nothing here uses a card, a shadow or a rounded corner
 * beyond the 2px terminal radius.
 */

import { WANTED_MAX } from "@/lib/forensics/score";
import { audio } from "@/lib/audio/engine";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/* ------------------------------------------------------------------ *
 * Panel
 * ------------------------------------------------------------------ */

export function Panel({
  children,
  title,
  aside,
  className = "",
  tone = "default",
  bracket = true,
}: {
  children?: ReactNode;
  title?: string;
  aside?: ReactNode;
  className?: string;
  tone?: "default" | "hot" | "danger";
  bracket?: boolean;
}) {
  const border =
    tone === "danger"
      ? "border-danger/45"
      : tone === "hot"
        ? "border-magenta/40"
        : "border-line";
  return (
    <section
      className={`relative border bg-panel/70 ${border} ${bracket ? "u-bracket" : ""} ${className}`}
    >
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-line/80 px-3 py-[7px]">
          <h2 className="u-label text-[10.5px] text-dim">{title}</h2>
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Readout — a labelled monospace value
 * ------------------------------------------------------------------ */

export function Readout({
  label,
  value,
  tone = "default",
  mono = true,
  className = "",
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "dim" | "cyan" | "amber" | "danger" | "clear";
  mono?: boolean;
  className?: string;
}) {
  const color = {
    default: "text-bone",
    dim: "text-dim",
    cyan: "text-cyan",
    amber: "text-amber",
    danger: "text-danger",
    clear: "text-clear",
  }[tone];
  return (
    <div className={`flex items-baseline justify-between gap-3 ${className}`}>
      <span className="u-label shrink-0 text-[9.5px] text-faint">{label}</span>
      <span
        className={`truncate text-right text-[11.5px] ${color} ${mono ? "font-mono" : "u-label"}`}
      >
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Meter — horizontal instrument bar
 * ------------------------------------------------------------------ */

export function Meter({
  value,
  tone = "cyan",
  height = 4,
  ticks = true,
  marks,
}: {
  /** 0..100 */
  value: number;
  tone?: "cyan" | "magenta" | "amber" | "danger" | "clear" | "dim";
  height?: number;
  ticks?: boolean;
  /**
   * Percentages to rule off on the track — the thresholds the outcome actually
   * turns on. Without them a gauge reports a number against no scale at all,
   * and the only way to find the line is to push the value until the colour
   * changes.
   */
  marks?: number[];
}) {
  const bg = {
    cyan: "bg-cyan",
    magenta: "bg-magenta",
    amber: "bg-amber",
    danger: "bg-danger",
    clear: "bg-clear",
    dim: "bg-faint",
  }[tone];
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className="relative w-full overflow-hidden bg-pit ring-1 ring-line/70"
      style={{ height }}
      role="presentation"
    >
      {ticks && (
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to right, transparent 0 9px, rgb(255 255 255 / 0.16) 9px 10px)",
          }}
        />
      )}
      <div
        className={`h-full origin-left ${bg} transition-[width] duration-500 ease-out`}
        style={{ width: `${clamped}%` }}
      />
      {/* Over the fill, so the threshold stays readable once the bar passes it. */}
      {marks?.map((m) => (
        <div
          key={m}
          className="absolute inset-y-0 w-px bg-bone/75"
          style={{ left: `${Math.max(0, Math.min(100, m))}%` }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Counter — a value that counts to its target
 * ------------------------------------------------------------------ */

export function useCountUp(target: number, durationMs = 900, enabled = true) {
  const [value, setValue] = useState(enabled ? 0 : target);
  const frame = useRef<number>(0);

  useEffect(() => {
    // Reduced motion (or a disabled counter) lands on the target immediately,
    // but still via the frame callback so nothing is set synchronously here.
    const jump = !enabled || prefersReducedMotion();
    const start = performance.now();
    const tick = (now: number) => {
      const t = jump ? 1 : Math.min(1, (now - start) / durationMs);
      // ease-out cubic — fast arrival, settled landing
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, durationMs, enabled]);

  return value;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/**
 * Whether anyone can see the page right now.
 *
 * Presentation waits for its audience. A judge working through a list of
 * entries opens them in background tabs, and every timed beat before the game
 * proper — the cold open's cards, the boot screen's auto-advance — used to play
 * out to an empty room, so the tab was sitting on the case index by the time
 * anyone looked at it. The deadline clock deliberately does NOT use this: three
 * minutes with no pause is the premise, not a presentation choice.
 *
 * Reads as visible on the server, so the first client render matches it.
 */
export function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState !== "hidden",
    () => true
  );
}

/* ------------------------------------------------------------------ *
 * Buttons
 * ------------------------------------------------------------------ */

export function Button({
  children,
  onClick,
  variant = "ghost",
  disabled = false,
  className = "",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  /**
   * `signal` is an instrument control — an action on the exhibit rather than
   * on the run, like APPLY. Cyan, the colour the rest of the terminal uses
   * for the equipment talking back.
   */
  variant?: "primary" | "ghost" | "signal" | "danger";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  const base =
    "u-label relative inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[11px] transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40";
  const styles = {
    primary:
      "bg-magenta text-white ring-1 ring-magenta/70 shadow-[0_0_22px_-6px_var(--color-magenta)] hover:bg-magenta/85 active:translate-y-px",
    ghost:
      "border border-line-hot text-dim hover:border-cyan/60 hover:text-cyan active:translate-y-px",
    signal:
      "border border-cyan/60 bg-cyan/5 text-cyan shadow-[0_0_16px_-8px_var(--color-cyan)] hover:bg-cyan/15 active:translate-y-px",
    danger:
      "bg-danger text-white ring-1 ring-danger/70 shadow-[0_0_22px_-6px_var(--color-danger)] hover:bg-danger/85 active:translate-y-px",
  }[variant];
  return (
    <button
      type={type}
      // Routed through here rather than added at each call site: every control
      // in the game is this component, so one line gives the whole rack the
      // same contact click.
      onClick={() => {
        audio.cue("click");
        onClick?.();
      }}
      disabled={disabled}
      className={`${base} ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Stamp
 * ------------------------------------------------------------------ */

export function Stamp({
  children,
  tone = "danger",
  rotate = -7,
  className = "",
}: {
  children: ReactNode;
  tone?: "danger" | "amber" | "clear" | "cyan";
  rotate?: number;
  className?: string;
}) {
  const color = {
    danger: "text-danger",
    amber: "text-amber",
    clear: "text-clear",
    cyan: "text-cyan",
  }[tone];
  return (
    <span
      className={`u-stamp inline-block text-[11px] ${color} ${className}`}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Scan overlay — the sweep used during analysis
 * ------------------------------------------------------------------ */

export function ScanSweep({
  tone = "cyan",
  active = true,
}: {
  tone?: "cyan" | "magenta";
  active?: boolean;
}) {
  if (!active) return null;
  const color = tone === "cyan" ? "var(--color-cyan)" : "var(--color-magenta)";
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <div
        className="absolute inset-x-0 h-[16%] animate-sweep"
        style={{
          background: `linear-gradient(to bottom, transparent, color-mix(in srgb, ${color} 26%, transparent), transparent)`,
          boxShadow: `0 0 30px 2px color-mix(in srgb, ${color} 30%, transparent)`,
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Typed text — the boot sequence effect
 * ------------------------------------------------------------------ */

export function useTypedLines(lines: string[], speedMs = 26, startDelay = 120) {
  const [shown, setShown] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const reduce = prefersReducedMotion();
    let cancelled = false;
    let lineIndex = 0;
    let charIndex = 0;
    const acc: string[] = [];
    let timer: ReturnType<typeof setTimeout>;

    const step = () => {
      if (cancelled) return;
      // Reduced motion: reveal everything on the first tick rather than typing.
      if (reduce) {
        setShown(lines);
        setDone(true);
        return;
      }
      if (lineIndex >= lines.length) {
        setDone(true);
        return;
      }
      const line = lines[lineIndex];
      charIndex += 1;
      acc[lineIndex] = line.slice(0, charIndex);
      setShown([...acc]);
      if (charIndex >= line.length) {
        lineIndex += 1;
        charIndex = 0;
        // A beat between lines makes it read as a machine, not a typist.
        timer = setTimeout(step, 150);
      } else {
        timer = setTimeout(step, speedMs);
      }
    };

    timer = setTimeout(step, startDelay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [lines, speedMs, startDelay]);

  const skip = () => {
    setShown(lines);
    setDone(true);
  };

  return { shown, done, skip };
}

/* ------------------------------------------------------------------ *
 * Wanted level
 * ------------------------------------------------------------------ */

/**
 * Six stars.
 *
 * The sixth is drawn in hazard red rather than amber, because it is not simply
 * "one more" — it is the rung past a warrant, where the city stops looking for
 * a suspect and starts looking for you. A player who reaches it should be able
 * to see that it is a different colour of trouble without counting.
 */
export function WantedStars({
  level,
  size = 20,
  animate = true,
}: {
  level: number;
  size?: number;
  animate?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-1.5"
      aria-label={`Wanted level ${level} of ${WANTED_MAX}`}
    >
      {Array.from({ length: WANTED_MAX }, (_, i) => {
        const lit = i < level;
        const terminal = i === WANTED_MAX - 1;
        const style: CSSProperties = animate
          ? { animation: `rise 0.3s ${0.1 + i * 0.11}s cubic-bezier(0.2,0.8,0.2,1) both` }
          : {};
        return (
          <svg
            key={i}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            style={style}
            className={
              lit
                ? terminal
                  ? "text-danger"
                  : "text-amber"
                : terminal
                  ? "text-danger/25"
                  : "text-ghost"
            }
            aria-hidden="true"
          >
            <path
              d="M12 2.4 14.9 9l7.1.6-5.4 4.7 1.6 7-6.2-3.8L5.8 21.3l1.6-7L2 9.6 9.1 9z"
              fill={lit ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1.4"
            />
          </svg>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Misc
 * ------------------------------------------------------------------ */

/** A small blinking record dot. */
export function RecDot({ tone = "danger" }: { tone?: "danger" | "clear" }) {
  const bg = tone === "danger" ? "bg-danger" : "bg-clear";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-[6px] animate-blink rounded-full ${bg}`} />
    </span>
  );
}

export function Divider({ label }: { label?: string }) {
  if (!label) return <hr className="border-line/70" />;
  return (
    <div className="flex items-center gap-2.5">
      <hr className="grow border-line/70" />
      <span className="u-label text-[9px] text-ghost">{label}</span>
      <hr className="grow border-line/70" />
    </div>
  );
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
