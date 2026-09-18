"use client";

/**
 * The cold open — first visit only.
 *
 * Black screen, big white words, hard cuts. It runs ahead of the boot terminal
 * because the premise is a contradiction ("hide yourself / keep it authentic")
 * and that lands harder as a statement than as UI copy.
 *
 * The first-visit check reads localStorage through useSyncExternalStore so the
 * server and the hydrating client both paint the same black field, and the real
 * answer only arrives once hydration has settled. A returning player therefore
 * never sees a frame of the sequence, and there is no hydration mismatch.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { INTRO_EXIT_MS, INTRO_SCRIPT, INTRO_SEEN_KEY } from "@/data/intro";
import { prefersReducedMotion, usePageVisible } from "@/components/ui/primitives";
import { IntroBackdrop } from "@/components/intro/IntroBackdrop";
import type { IntroCard } from "@/types";

const SCALE: Record<IntroCard["scale"], string> = {
  hero: "text-[clamp(2.6rem,12vw,9.5rem)] leading-[0.9]",
  statement: "text-[clamp(1.8rem,5.4vw,4rem)] leading-[1.02]",
  title: "text-[clamp(3.2rem,15vw,12rem)] leading-[0.84]",
};

/** Words land in sequence, but never so late that the card cuts underneath them. */
const WORD_STEP_MS = 55;
const WORD_STEP_MAX_MS = 420;

/** Default gap before each line after the first. Cards can override it. */
const LINE_BEAT_MS = 420;

/** The flag never changes while the sequence is on screen, so nothing to watch. */
const subscribeNever = () => () => {};

const readSeen = (): boolean => {
  // ?intro replays the sequence — once it has run, this is the only way back
  // to it, which matters when showing the game to someone.
  if (window.location.search.includes("intro")) return false;
  try {
    return window.localStorage.getItem(INTRO_SEEN_KEY) === "1";
  } catch {
    // Private mode / blocked storage: the intro simply plays again next time.
    return false;
  }
};

/** Undecided, on the server and until hydration finishes. */
const seenOnServer = (): boolean | null => null;

/**
 * Clears the first-visit flag so the sequence plays again on the next mount.
 * The flag is rewritten the moment that replay ends, so the window in which a
 * refresh would also replay it is only as long as the intro itself.
 */
export function forgetIntro() {
  try {
    window.localStorage.removeItem(INTRO_SEEN_KEY);
  } catch {
    // Nothing to clear if storage is blocked — the intro plays regardless.
  }
}

/** Splits a sub line so one phrase in it can be spotlighted. */
function renderSub(sub: string, emphasis?: string) {
  const at = emphasis ? sub.indexOf(emphasis) : -1;
  if (!emphasis || at < 0) return sub;
  return (
    <>
      {sub.slice(0, at)}
      <span className="intro-spot">{emphasis}</span>
      {sub.slice(at + emphasis.length)}
    </>
  );
}

export function IntroSequence({ onComplete }: { onComplete(): void }) {
  const seen = useSyncExternalStore<boolean | null>(
    subscribeNever,
    readSeen,
    seenOnServer
  );
  const [index, setIndex] = useState(0);
  const [leavingIndex, setLeavingIndex] = useState<number | null>(null);
  /** Mirrors `leavingIndex` for the card timer, which must not depend on it. */
  const leavingRef = useRef<number | null>(null);
  const [reduce] = useState(prefersReducedMotion);

  // The sequence waits for an audience. Opened in a background tab — which is
  // how anyone working through a list of entries opens them — it used to play
  // all seven cards to nobody and hand over to a boot screen that then
  // auto-advanced too. It starts the first time the page is actually seen,
  // and pauses on the current card whenever it is hidden again.
  const visible = usePageVisible();
  const [started, setStarted] = useState(false);
  if (!started && visible && seen === false) setStarted(true);

  const playing = seen === false && started;
  const running = playing && visible;

  const finish = useCallback(() => {
    try {
      window.localStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch {
      // ignore — see readSeen
    }
    onComplete();
  }, [onComplete]);

  // Returning player: straight through to the terminal.
  useEffect(() => {
    if (seen === true) onComplete();
  }, [seen, onComplete]);

  const advance = useCallback(() => {
    if (index >= INTRO_SCRIPT.length - 1) finish();
    else setIndex((i) => i + 1);
  }, [index, finish]);

  // Card timing: an exit beat, then the cut. Only while someone is looking —
  // hidden, the timers are dropped and the card gets its full time back when
  // the page returns.
  useEffect(() => {
    if (!running) return;
    // Hidden during its own exit beat: the card has already faded out, so
    // resume straight into the cut rather than holding an empty frame.
    if (leavingRef.current === index) {
      const cut = setTimeout(advance, 0);
      return () => clearTimeout(cut);
    }
    const card = INTRO_SCRIPT[index];
    const out = setTimeout(() => {
      leavingRef.current = index;
      setLeavingIndex(index);
    }, Math.max(0, card.ms - INTRO_EXIT_MS));
    const cut = setTimeout(advance, card.ms);
    return () => {
      clearTimeout(out);
      clearTimeout(cut);
    };
  }, [running, index, advance]);

  // Impatience is a feature: anything advances a card, Escape leaves.
  useEffect(() => {
    if (!playing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
      else advance();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-intro-skip]")) return; // has its own handler
      advance();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [playing, advance, finish]);

  // Undecided or already seen: the same black field the sequence opens on.
  if (!playing) return <div className="fixed inset-0 z-50 bg-black" />;

  const card = INTRO_SCRIPT[index];
  const isTitle = card.effect === "title";
  const leaving = leavingIndex === index;
  const beat = card.lineBeatMs ?? LINE_BEAT_MS;

  return (
    <main
      className="fixed inset-0 z-50 flex cursor-pointer select-none items-center justify-center overflow-hidden bg-black"
      aria-label="Opening sequence"
    >
      <IntroBackdrop cardIndex={index} />

      {card.effect === "flash" && (
        <div
          key={`flash-${card.id}`}
          className="intro-flash pointer-events-none absolute inset-0 z-10 bg-white"
        />
      )}

      {/* The CRT arrives on the last card — it hands the eye to the terminal. */}
      {isTitle && (
        <div className="u-scanlines pointer-events-none absolute inset-0 z-10" />
      )}

      <div
        key={card.id}
        className={`relative z-0 px-6 text-center ${leaving ? "intro-out" : ""}`}
      >
        {card.lines.map((line, lineIndex) => (
          <div
            key={line}
            className={`u-display flex flex-wrap justify-center gap-x-[0.26em] text-white ${SCALE[card.scale]} ${
              card.effect === "glitch" ? "intro-glitch" : ""
            } ${isTitle ? "intro-aberration tracking-[-0.01em]" : ""}`}
          >
            {line.split(" ").map((text, i) => (
              <span
                key={`${text}-${i}`}
                className="intro-word"
                style={{
                  animationDelay: reduce
                    ? "0ms"
                    : `${lineIndex * beat + Math.min(i * WORD_STEP_MS, WORD_STEP_MAX_MS)}ms`,
                }}
              >
                {text}
              </span>
            ))}
          </div>
        ))}

        {card.sub && (
          <p className="intro-sub u-label mx-auto mt-6 max-w-[86ch] text-[clamp(8px,1.5vw,11px)] text-white/45">
            {renderSub(card.sub, card.subEmphasis)}
          </p>
        )}
      </div>

      {/* How far through the sequence you are — one hairline, no chrome. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/10">
        <div
          className="h-full bg-white/50 transition-[width] duration-500 ease-linear"
          style={{ width: `${((index + 1) / INTRO_SCRIPT.length) * 100}%` }}
        />
      </div>

      <button
        type="button"
        data-intro-skip
        onClick={finish}
        className="u-label absolute right-5 bottom-5 z-20 cursor-pointer text-[9px] text-white/30 transition-colors hover:text-white/80"
      >
        SKIP · ESC
      </button>
    </main>
  );
}
