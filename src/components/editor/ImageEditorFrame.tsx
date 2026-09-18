"use client";

/**
 * The editor, mounted inside our own terminal bezel.
 *
 * Deliberately imported directly rather than through next/dynamic: the package
 * already carries 'use client' and touches `document` only inside effects, so
 * it server-renders as an empty container. Importing it directly also keeps ref
 * forwarding intact, which next/dynamic does not reliably preserve.
 *
 * The instance is handed upward through `onReady` so the terminal can poll
 * `getImage()` for live forensics and read the canvas on submit.
 */

import { ImageEditor } from "@unlayer/react-image-editor";
import type {
  ImageEditorInstance,
  ImageEditorOptions,
} from "@unlayer/react-image-editor";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { RecDot } from "@/components/ui/primitives";
import { safeGetImage } from "./commit";
import { useJumpToDegrade } from "./useJumpToDegrade";

/**
 * How long to wait for the exhibit itself once the toolchain is up, before
 * handing the editor over regardless. The terminal's clock has its own
 * fallback; this one just keeps a stalled decode from holding the curtain
 * down forever.
 */
const EXHIBIT_WAIT_MS = 12_000;
const EXHIBIT_POLL_MS = 80;
/**
 * `getImage()` has the exhibit a beat before the canvas paints it — the editor
 * records the base image and then loads it into fabric — so the curtain lifts
 * a moment after, not on the same frame.
 */
const EXHIBIT_SETTLE_MS = 140;

interface Props {
  image: string;
  options: ImageEditorOptions;
  onReady(editor: ImageEditorInstance): void;
  /** The editor's own Save button — diegetically, committing the exhibit. */
  onCommit(dataUrl: string): void;
  /**
   * The editor's own DISCARD. The wrapper exposes it as `onCancel`, and with
   * nothing listening the button did nothing at all.
   */
  onDiscard(): void;
  /**
   * The editor's own DOM, handed upward so the terminal can tell whether a
   * tool panel is open and close it before reading the canvas. See commit.ts —
   * an open panel means the player's edit is a preview the canvas has not
   * seen.
   */
  containerRef?: RefObject<HTMLDivElement | null>;
  minHeight?: number;
}

/**
 * `loading` is the toolchain arriving from the CDN; `decoding` is the editor
 * up but the exhibit not yet on its canvas.
 *
 * The wrapper's `onLoad` fires the moment `createEditor` resolves — before the
 * editor has even fetched the image, which it then converts to a data URL and
 * loads into its canvas. Treating that as "ready" armed the three-minute clock
 * over an empty black canvas: ten seconds of it on a cold load, measured, with
 * the tool rail live and nothing to use it on. Ready now means `getImage()`
 * has something to return.
 */
type LoadState = "loading" | "decoding" | "ready" | "failed";

export function ImageEditorFrame({
  image,
  options,
  onReady,
  onCommit,
  onDiscard,
  containerRef,
  minHeight = 560,
}: Props) {
  const [state, setState] = useState<LoadState>("loading");
  const [detail, setDetail] = useState<string | null>(null);
  const mountCount = useRef(0);
  const degrade = useJumpToDegrade(containerRef, state === "ready");

  // Guards the decode wait against a terminal torn down mid-load. Set on
  // mount rather than initialised, so StrictMode's rehearsal unmount does not
  // leave it latched false.
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const awaitExhibit = (editor: ImageEditorInstance) => {
    setState((s) => (s === "failed" ? s : "decoding"));
    const started = performance.now();
    const check = () => {
      if (!alive.current) return;
      const decoded = safeGetImage(editor) !== null;
      if (decoded || performance.now() - started > EXHIBIT_WAIT_MS) {
        setTimeout(
          () => {
            if (!alive.current) return;
            setState((s) => (s === "failed" ? s : "ready"));
            onReady(editor);
          },
          decoded ? EXHIBIT_SETTLE_MS : 0
        );
        return;
      }
      setTimeout(check, EXHIBIT_POLL_MS);
    };
    check();
  };

  // A remount mid-case means the player just lost their work. In development
  // that is a bug worth shouting about, since the usual cause is an unstable
  // `options` identity.
  //
  // The guard watches the VALUES, not the effect's run count. React's dev
  // StrictMode double-invokes every effect on mount, so counting runs fired
  // "(2x)" on every single case open — a warning that is always wrong is a
  // warning nobody reads, and it was masking the signal it exists to carry.
  const lastInputs = useRef<{ options: unknown; image: string } | null>(null);
  useEffect(() => {
    const previous = lastInputs.current;
    lastInputs.current = { options, image };
    if (!previous) return;
    if (previous.options === options && previous.image === image) return;
    mountCount.current += 1;
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[vice-evidence] editor remounted (${mountCount.current}x) — check that ` +
          `the options object is memoised.`
      );
    }
  }, [options, image]);

  return (
    <div className="relative flex h-full flex-col" style={{ minHeight }}>
      {/* bezel head */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-x border-t border-line bg-panel-2/80 px-3 py-1.5">
        <div className="flex items-center gap-2.5">
          <RecDot tone={state === "ready" ? "clear" : "danger"} />
          <span className="u-label text-[9.5px] text-dim">
            FORENSIC IMAGE TERMINAL
          </span>
          <span className="font-mono text-[9.5px] text-ghost">
            /dev/evidence0
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Outranks the shortcut hint for the row's space: it is only here
              while the sliders that matter are out of sight. */}
          {degrade.offscreen && (
            <button
              type="button"
              onClick={degrade.jump}
              className="u-label animate-flicker border border-cyan/50 bg-cyan/10 px-2 py-0.5 text-[9px] text-cyan transition-colors hover:bg-cyan/20"
            >
              ↓ DEFOCUS · MOSAIC
            </button>
          )}
          {/* A binding the library does not advertise because it does not have
              one — we add it, so it is on us to say so. Right next to the
              REVERT control it drives, and dropped on narrow terminals where
              the row has no room to spare. */}
          {state === "ready" && !degrade.offscreen && (
            <span className="u-label hidden text-[9px] text-ghost xl:inline">
              ⌘/CTRL+Z REVERT
            </span>
          )}
          <span className="u-label text-[9.5px] text-faint">
            {state === "ready"
              ? "WRITE ENABLED"
              : state === "failed"
                ? "LINK DOWN"
                : "MOUNTING"}
          </span>
        </div>
      </div>

      <div className="relative min-h-0 grow border border-line bg-pit">
        {(state === "loading" || state === "decoding") && (
          <EditorBooting stage={state} />
        )}
        {state === "failed" && <EditorFailed detail={detail} />}

        {/* The editor keeps its own pixel-true surface — no overlay is ever
            placed above it, or the canvas stops being clickable.
            This wrapper MUST be a flex column: the library's own container is
            `flex: 1 1 0%`, which a block parent ignores, collapsing the editor
            to its content height and squashing the exhibit. */}
        <div
          ref={containerRef}
          className={
            state === "failed" ? "hidden" : "flex h-full flex-col"
          }
        >
          <ImageEditor
            image={image}
            options={options}
            minHeight={minHeight}
            style={{ height: "100%", width: "100%" }}
            onLoad={awaitExhibit}
            onSave={({ dataUrl }) => onCommit(dataUrl)}
            onCancel={onDiscard}
            onLoadError={() => {
              setState("failed");
              setDetail("EXHIBIT DECODE FAILURE — source image unreadable.");
            }}
            onError={(err) => {
              setState("failed");
              setDetail(err.message);
            }}
          />
        </div>
      </div>
    </div>
  );
}

function EditorBooting({ stage }: { stage: "loading" | "decoding" }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-pit">
      <div className="u-label animate-flicker text-[11px] text-dim">
        {stage === "loading" ? "MOUNTING EXHIBIT" : "DECODING EXHIBIT"}
      </div>
      <div className="h-[3px] w-52 overflow-hidden bg-panel-2">
        <div className="h-full w-1/3 animate-sweep bg-cyan" />
      </div>
      <p className="max-w-xs text-center font-mono text-[10px] leading-relaxed text-ghost">
        {stage === "loading"
          ? "Loading manipulation toolchain from forensic image service."
          : "Toolchain online. Pulling the capture off the evidence bus — the clock starts when it is on screen."}
      </p>
    </div>
  );
}

function EditorFailed({ detail }: { detail: string | null }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-pit px-6">
      <div className="u-stamp text-[13px] text-danger">TERMINAL OFFLINE</div>
      <p className="max-w-sm text-center font-mono text-[11px] leading-relaxed text-dim">
        The manipulation toolchain could not be reached. Without it the exhibit
        cannot be altered — it will be submitted exactly as the camera recorded
        it.
      </p>
      {detail && (
        <p className="max-w-sm text-center font-mono text-[9.5px] leading-relaxed text-ghost">
          {detail}
        </p>
      )}
      <p className="u-label text-[9px] text-faint">
        CHECK NETWORK · THE TOOLCHAIN LOADS FROM AN EXTERNAL SERVICE
      </p>
    </div>
  );
}
