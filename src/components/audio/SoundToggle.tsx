"use client";

/**
 * Sound, and the controls for it.
 *
 * The engine is a module singleton rather than context: it owns a single
 * AudioContext for the whole page, nothing renders from its internals, and
 * every screen that wants a cue can simply import `audio` and fire one. The
 * only thing React needs to know is whether sound is on, which is what the
 * store subscription below is for.
 *
 * Two controls, because the job differs by screen. `SoundInvite` is a pitch,
 * shown once on the cold open — a switch that reads as a settings row gets
 * skipped, and a player who skips it experiences the entire game silent.
 * `SoundToggle` is the compact version for the terminal rack, where the
 * decision has already been made and it only needs to be reversible.
 *
 * Nothing here renders the music credit — see `music.ts` for where the track's
 * attribution lives and what the licence still requires.
 */

import { useEffect, useSyncExternalStore } from "react";
import { AudioEngine, audio } from "@/lib/audio/engine";

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(
    audio.subscribe,
    audio.getSnapshot,
    audio.getServerSnapshot
  );
}

/**
 * Marks the sound controls, so the restore listener below can stand aside for
 * them. Applied to the button element, and matched with `closest()` — the
 * event target is usually a glyph or a label inside it, never the button.
 */
const SOUND_CONTROL = { "data-sound-control": "" } as const;

/**
 * Bring back the player's preference on a later visit.
 *
 * An AudioContext started without a gesture is born suspended, so we cannot
 * simply restore the setting on mount — we arm a one-shot listener and enable
 * on the first real interaction instead. Anyone who has not asked for sound is
 * never touched by this.
 *
 * The listener has to ignore interactions with the sound controls themselves.
 * `pointerdown` fires before `click`, so on a return visit pressing ENABLE ran
 * both: the restore turned sound on, and then the button's own click saw it
 * already on and toggled it straight back off. The control flashed on and
 * landed off, which reads exactly like a double click and is not one.
 *
 * Standing aside rather than delaying is deliberate. `enable()` has to run
 * inside the gesture or the context stays suspended, so deferring it — by a
 * timeout, a debounce, anything — trades a visible bug for audio that silently
 * never starts on the stricter browsers.
 */
export function useRestoreSound(): void {
  useEffect(() => {
    if (!AudioEngine.wasEnabled()) return;

    const arm = (event: Event) => {
      const target = event.target;
      const onControl =
        target instanceof Element && target.closest("[data-sound-control]");
      // Either way the restore is finished: the player has just made the
      // decision themselves, so there is nothing left to restore.
      if (!onControl) void audio.enable();
      remove();
    };
    const remove = () => {
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };

    window.addEventListener("pointerdown", arm);
    window.addEventListener("keydown", arm);
    return remove;
  }, []);
}

/* ------------------------------------------------------------------ *
 * The pitch
 * ------------------------------------------------------------------ */

/**
 * The cold open's audio prompt.
 *
 * Deliberately not a `u-cta`: that belongs to ENTER CASE FILE, and this screen
 * gets exactly one. It earns attention a different way instead — its own row,
 * tape edging, a headphone glyph and a slow amber breath — so it reads as an
 * advisory the terminal is giving you rather than a second thing to decide
 * between.
 */
export function SoundInvite() {
  const on = useSoundEnabled();

  return (
    <button
      type="button"
      onClick={() => void audio.toggle()}
      {...SOUND_CONTROL}
      aria-pressed={on}
      aria-label={on ? "Mute terminal audio" : "Enable terminal audio"}
      className={`group relative flex w-full max-w-[46ch] items-center gap-3.5 border px-3.5 py-3 text-left transition-colors ${
        on
          ? "border-clear/45 bg-clear/6"
          : "u-invite border-amber/55 bg-amber/8 hover:border-amber hover:bg-amber/12"
      }`}
    >
      {/* Tape edge, so it reads as equipment labelling rather than a form row. */}
      <span
        className={`absolute inset-x-0 top-0 h-[2px] ${on ? "bg-clear/50" : "u-tape"}`}
        aria-hidden="true"
      />

      <Headphones on={on} />

      <span className="min-w-0 flex-1">
        <span
          className={`u-label block text-[12px] ${on ? "text-clear" : "text-amber"}`}
        >
          {on ? "AUDIO ON" : "TURN AUDIO ON"}
        </span>
        <span className="mt-1 block font-mono text-[10px] leading-relaxed text-dim">
          {on
            ? "Room live. Headphones recommended."
            : "Built to be heard — the room, the clock closing in, and what arrives when it goes wrong."}
        </span>
      </span>

      <span
        className={`u-label shrink-0 border px-2 py-1 text-[8.5px] ${
          on
            ? "border-clear/40 text-clear/80"
            : "border-amber/60 bg-amber/10 text-amber"
        }`}
      >
        {on ? "MUTE" : "ENABLE"}
      </span>
    </button>
  );
}

/**
 * Headphones, with the level bars living inside the band once sound is on —
 * the glyph itself becomes the meter rather than sitting next to one.
 */
function Headphones({ on }: { on: boolean }) {
  return (
    <span className="relative flex size-8 shrink-0 items-center justify-center">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        className={`size-full ${on ? "text-clear" : "text-amber"}`}
        aria-hidden="true"
      >
        <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
        <rect x="2.5" y="13.5" width="4" height="7" rx="1.4" />
        <rect x="17.5" y="13.5" width="4" height="7" rx="1.4" />
      </svg>
      {on && (
        <span
          className="absolute bottom-[3px] flex h-[7px] items-end gap-[1.5px] text-clear"
          aria-hidden="true"
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="animate-levels h-full w-[1.5px] bg-current"
              style={{ animationDelay: `${i * 0.16}s` }}
            />
          ))}
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * The rack switch
 * ------------------------------------------------------------------ */

/** The compact control, for screens where the decision is already made. */
export function SoundToggle({ className = "" }: { className?: string }) {
  const on = useSoundEnabled();

  return (
    <button
      type="button"
      onClick={() => void audio.toggle()}
      {...SOUND_CONTROL}
      aria-pressed={on}
      aria-label={on ? "Mute terminal audio" : "Enable terminal audio"}
      className={`u-label inline-flex items-center gap-2 border px-2 py-1 text-[8.5px] transition-colors ${
        on
          ? "border-cyan/50 bg-cyan/10 text-cyan"
          : "border-amber/45 text-amber/90 hover:border-amber hover:bg-amber/10"
      } ${className}`}
    >
      <span className="flex h-[9px] items-end gap-[1.5px]" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`w-[2px] bg-current ${on ? "animate-levels" : "opacity-45"}`}
            style={{
              height: on ? "100%" : `${[3, 6, 4][i]}px`,
              animationDelay: `${i * 0.16}s`,
            }}
          />
        ))}
      </span>
      <span>{on ? "AUDIO ON" : "AUDIO OFF"}</span>
    </button>
  );
}
