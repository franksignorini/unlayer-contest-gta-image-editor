"use client";

/**
 * The before/after wipe — the dossier's one interaction.
 *
 * The dossier used to toggle between the two exhibits with a pair of tabs,
 * under a caption that read "the version on the left is what the camera wrote
 * to disk; the version on the right is what reached intake". There was no left
 * and no right: the caption described a comparison the screen did not make, and
 * a cut between two frames is the worst way to read a difference anyway —
 * the eye has to hold one image in memory to judge the other.
 *
 * A wipe puts both in the same frame at the same scale, with the seam under the
 * player's own hand. It is also the one moment in the run where the player gets
 * to admire their own work, so it is worth the interaction.
 *
 * Both layers are drawn `object-contain` in a box cut to the ORIGINAL's aspect
 * ratio, so the two are registered pixel for pixel and the seam means something.
 * A reframed exhibit is the exception and reads as one: it is fitted to the same
 * box, so the wipe shows it at a different scale to the plate it came from,
 * which is exactly the finding the analysis already reported as FRAME LOSS.
 */

import Image from "next/image";
import { useCallback, useRef, useState } from "react";
import { Stamp } from "@/components/ui/primitives";

/** Arrow-key step, as a percentage of the frame. Shift multiplies it. */
const STEP = 2;

export function ExhibitWipe({
  original,
  filed,
  width,
  height,
  success,
}: {
  /** The exhibit as the camera recorded it. */
  original: string;
  /** The exhibit as filed — a data URL. */
  filed: string;
  width: number;
  height: number;
  /** Tints the filed side's stamp: green for a clean file, amber otherwise. */
  success: boolean;
}) {
  const [split, setSplit] = useState(52);
  const [dragging, setDragging] = useState(false);
  const frame = useRef<HTMLDivElement | null>(null);

  const setFromClientX = useCallback((clientX: number) => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect?.width) return;
    const next = ((clientX - rect.left) / rect.width) * 100;
    setSplit(Math.min(100, Math.max(0, next)));
  }, []);

  // Pointer capture on the frame itself, so a drag that leaves the image keeps
  // tracking and a click anywhere jumps the seam there — hunting for a 12px
  // handle is not what this is for.
  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
      setFromClientX(event.clientX);
    },
    [setFromClientX]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (dragging) setFromClientX(event.clientX);
    },
    [dragging, setFromClientX]
  );

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  }, []);

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    const step = event.shiftKey ? STEP * 5 : STEP;
    const move =
      event.key === "ArrowLeft"
        ? -step
        : event.key === "ArrowRight"
          ? step
          : event.key === "Home"
            ? -100
            : event.key === "End"
              ? 100
              : 0;
    if (!move) return;
    event.preventDefault();
    setSplit((s) => Math.min(100, Math.max(0, s + move)));
  }, []);

  return (
    <div
      ref={frame}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={`u-scanlines relative touch-none overflow-hidden bg-pit select-none ${
        dragging ? "cursor-grabbing" : "cursor-ew-resize"
      }`}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      {/* AS RECORDED — the full plate, underneath. */}
      <Image
        src={original}
        alt="The exhibit as the camera recorded it"
        fill
        sizes="(max-width: 1024px) 100vw, 1000px"
        className="object-contain"
        draggable={false}
      />
      <div className="absolute top-2 left-2 z-10">
        <Stamp tone="danger" rotate={-5}>
          UNALTERED
        </Stamp>
      </div>
      <span className="u-label absolute bottom-2 left-2 z-10 bg-void/70 px-1.5 py-0.5 text-[8px] text-dim">
        AS RECORDED
      </span>

      {/* AS FILED, clipped to the right of the seam. Both stamps live inside
          their own layer, so each is hidden exactly when its side is. */}
      <div
        className="absolute inset-0 z-20"
        style={{ clipPath: `inset(0 0 0 ${split}%)` }}
      >
        <Image
          src={filed}
          alt="The exhibit as it reached intake"
          fill
          unoptimized
          sizes="(max-width: 1024px) 100vw, 1000px"
          className="object-contain"
          draggable={false}
        />
        <div className="absolute top-2 right-2">
          <Stamp tone={success ? "clear" : "amber"} rotate={5}>
            OPERATOR COPY
          </Stamp>
        </div>
        <span className="u-label absolute right-2 bottom-2 bg-void/70 px-1.5 py-0.5 text-[8px] text-cyan">
          AS FILED
        </span>
      </div>

      {/* The seam. */}
      <div
        className="pointer-events-none absolute inset-y-0 z-30 w-px bg-cyan shadow-[0_0_10px_1px_color-mix(in_srgb,var(--color-cyan)_60%,transparent)]"
        style={{ left: `${split}%` }}
      />
      <div
        role="slider"
        tabIndex={0}
        aria-label="Compare the filed exhibit against the original"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(split)}
        aria-valuetext={`${Math.round(split)}% of the frame shows the original`}
        onKeyDown={onKeyDown}
        className="absolute top-1/2 z-30 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center border border-cyan/70 bg-void/80 backdrop-blur-sm"
        style={{ left: `${split}%` }}
      >
        <span className="font-mono text-[11px] leading-none text-cyan">
          ‹›
        </span>
      </div>
    </div>
  );
}
