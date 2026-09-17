"use client";

/**
 * PIXEL RECOVERY — the enhance.
 *
 * Every other part of the analysis reports a *number*. This is the one place
 * the game shows its working: it magnifies the actual region of the actual PNG
 * the player filed, at native pixels, and either reads the plate off it or
 * doesn't.
 *
 * Nothing here is faked, and that is the whole point. The enhancement pass is
 * cosmetic — contrast, a smoothing cross-fade — but the pixels underneath are
 * the player's. If they blurred the plate, the magnification shows blurred
 * pixels getting bigger, because that is what actually survives. The verdict
 * line is gated on the same `legibility` the score is gated on, so what the
 * examiner reads out and what the outcome says can never disagree.
 *
 * Timing is driven entirely by a `progress` prop rather than a local clock, so
 * the recovery pass stays locked to the pipeline's timeline and skipping the
 * analysis lands it on its final frame instead of leaving it mid-animation.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  EvidenceKind,
  ForensicResult,
  Mission,
  PixelRect,
  Submission,
} from "@/types";
import { mapRegionIntoSubmission } from "@/lib/forensics/align";
import { loadImage } from "@/lib/forensics/image";
import { audio } from "@/lib/audio/engine";

/**
 * Legibility at which the examiner gets a usable read. Matches the registry
 * stage's threshold so the pipeline never contradicts itself.
 */
const RESOLVE_AT = 45;

/** Canvas backing store. Fixed so magnification is deterministic per region. */
const CW = 1024;
const CH = 560;

/** Phase boundaries within a single slot, as fractions of its duration. */
const ACQUIRE_UNTIL = 0.22;
const RESOLVE_UNTIL = 0.66;

/** What the readout calls each kind of evidence. */
const KIND_LABEL: Record<EvidenceKind, string> = {
  face: "SUBJECT",
  plate: "PLATE",
  witness: "WITNESS",
  weapon: "WEAPON",
  vehicle: "VEHICLE",
  mark: "MARKING",
  object: "OBJECT",
  location: "LOCATION",
  mask: "COVERING",
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

interface Slot {
  targetId: string;
  label: string;
  short: string;
  kind: EvidenceKind;
  resolvedAs: string;
  legibility: number;
  /** Where the region ended up in the submitted image, or null if cropped out. */
  rect: PixelRect | null;
}

/**
 * Which regions get examined, and where they landed after the player's edit.
 *
 * Ordered by weight because an examiner works the strongest evidence first —
 * and because the region that decides the case is the one worth watching
 * resolve.
 */
export function buildRecoverySlots(
  mission: Mission,
  result: ForensicResult,
  filed: { w: number; h: number } | null,
  /** How many regions to work through. Owned by the pipeline, not by us. */
  count: number
): Slot[] {
  const editSize = filed
    ? { width: filed.w, height: filed.h }
    : { width: mission.imageSize.width, height: mission.imageSize.height };

  return [...mission.targets]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, count)
    .map((t) => {
      const finding = result.findings.find((f) => f.targetId === t.id);
      return {
        targetId: t.id,
        label: t.label,
        short: t.short,
        kind: t.kind,
        resolvedAs: t.resolvedAs,
        legibility: finding?.legibility ?? 0,
        rect: finding?.croppedOut
          ? null
          : mapRegionIntoSubmission(t.region, result.transform, editSize),
      };
    });
}

export function EnhancePanel({
  mission,
  submission,
  result,
  filed,
  count,
  progress,
}: {
  mission: Mission;
  submission: Submission;
  result: ForensicResult;
  filed: { w: number; h: number } | null;
  /** How many regions to work through, highest weight first. */
  count: number;
  /** 0..1 across the whole recovery stage. */
  progress: number;
}) {
  const slots = useMemo(
    () => buildRecoverySlots(mission, result, filed, count),
    [mission, result, filed, count]
  );

  // Which region we are on, and how far through it. The last slot is held at
  // its final frame rather than rolling past the end of the array.
  const scaled = clamp01(progress) * slots.length;
  const index = Math.min(slots.length - 1, Math.floor(scaled));
  const slot = slots[index] as Slot | undefined;
  const local = clamp01(scaled - index);

  // Cross-fade weight from raw pixels to the enhanced read, 0..1.
  const enhance = clamp01(
    (local - ACQUIRE_UNTIL) / (RESOLVE_UNTIL - ACQUIRE_UNTIL)
  );
  const settled = local >= RESOLVE_UNTIL;

  const magnification = slot?.rect
    ? Math.min(CW / slot.rect.w, CH / slot.rect.h)
    : 0;

  // The lens finding focus, then the verdict on what it found. Split into two
  // effects so the settle cue fires on the transition rather than on every
  // frame after it.
  useEffect(() => {
    audio.cue("scan");
  }, [index]);

  useEffect(() => {
    if (!settled) return;
    const s = slots[index];
    if (!s) return;
    audio.cue(s.rect && s.legibility >= RESOLVE_AT ? "lock" : "clear");
  }, [settled, index, slots]);

  if (!slot) return null;

  const resolved = slot.legibility >= RESOLVE_AT;
  const croppedOut = slot.rect === null;

  return (
    <div className="relative h-full w-full bg-pit">
      <RecoveryCanvas
        src={submission.dataUrl}
        rect={slot.rect}
        enhance={enhance}
        sweep={local}
      />

      {/* Where in the frame we are. An examiner never loses the wider shot. */}
      <Locator
        src={submission.dataUrl}
        rect={slot.rect}
        filed={filed}
        aspect={result.transform.crop.w / result.transform.crop.h}
      />

      {/* top-left: what is under the glass */}
      <div className="absolute top-2 left-2 z-30 border border-cyan/40 bg-void/85 px-2 py-1">
        <div className="u-label text-[8.5px] text-cyan">
          PIXEL RECOVERY — {KIND_LABEL[slot.kind]}
        </div>
        <div className="font-mono text-[9px] text-dim">
          {slot.label.toUpperCase()}
        </div>
      </div>

      {/* top-right: the instrument readout */}
      <div className="absolute top-2 right-2 z-30 border border-line bg-void/85 px-2 py-1 text-right">
        <div className="u-label text-[8px] text-faint">MAGNIFICATION</div>
        <div className="font-mono text-[12px] text-bone tabular-nums">
          {croppedOut ? "——" : `×${magnification.toFixed(1)}`}
        </div>
      </div>

      {/* the read */}
      <div className="absolute inset-x-0 bottom-0 z-30 border-t border-line/70 bg-void/90 px-3 py-2">
        <ReadLine
          croppedOut={croppedOut}
          resolved={resolved}
          settled={settled}
          local={local}
          kind={slot.kind}
          resolvedAs={slot.resolvedAs}
          legibility={slot.legibility}
        />
      </div>

      {/* slot ticks, so the pass reads as a queue of regions */}
      <div className="absolute bottom-[42px] left-3 z-30 flex gap-1">
        {slots.map((s, i) => (
          <span
            key={s.targetId}
            className={`u-label border px-1 text-[7.5px] ${
              i === index
                ? "border-cyan/70 bg-cyan/15 text-cyan"
                : i < index
                  ? "border-line text-faint"
                  : "border-line/60 text-ghost"
            }`}
          >
            {s.short}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * The verdict line under the glass.
 *
 * Types out rather than appearing, and the characters are driven by the stage
 * progress — a value the player watches arrive one letter at a time is a great
 * deal more threatening than the same value simply being there.
 */
function ReadLine({
  croppedOut,
  resolved,
  settled,
  local,
  kind,
  resolvedAs,
  legibility,
}: {
  croppedOut: boolean;
  resolved: boolean;
  settled: boolean;
  local: number;
  kind: EvidenceKind;
  resolvedAs: string;
  legibility: number;
}) {
  if (!settled) {
    return (
      <div className="flex items-baseline justify-between gap-3">
        <span className="u-label text-[9px] text-dim">
          {local < ACQUIRE_UNTIL
            ? "ACQUIRING REGION"
            : "APPLYING RECOVERY FILTERS"}
        </span>
        <span className="font-mono text-[9px] text-faint tabular-nums">
          {Math.round(clamp01(local / RESOLVE_UNTIL) * 100)}%
        </span>
      </div>
    );
  }

  if (croppedOut) {
    return (
      <div className="flex items-baseline justify-between gap-3">
        <span className="u-label text-[11px] text-clear">
          REGION NOT PRESENT IN FILED EXHIBIT
        </span>
        <span className="font-mono text-[9px] text-faint">
          ORIGINAL SUBPOENAED
        </span>
      </div>
    );
  }

  if (!resolved) {
    return (
      <div className="flex items-baseline justify-between gap-3">
        <span className="u-label text-[11px] text-clear">
          NO RECOVERABLE DETAIL
        </span>
        <span className="font-mono text-[9px] text-faint tabular-nums">
          CONFIDENCE {Math.round(legibility)}%
        </span>
      </div>
    );
  }

  // Reveal proportionally across the settled portion of the slot, finishing
  // with a beat to spare so the full string is readable before we move on.
  const reveal = clamp01((local - RESOLVE_UNTIL) / (1 - RESOLVE_UNTIL) / 0.75);
  const shown = resolvedAs.slice(0, Math.ceil(reveal * resolvedAs.length));
  const typing = reveal < 1;

  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="u-label truncate text-[11px] text-danger">
        {KIND_LABEL[kind]} RECOVERED ·{" "}
        <span className="font-mono tracking-normal">
          {shown}
          {typing && <span className="text-danger/60">_</span>}
        </span>
      </span>
      <span className="font-mono text-[9px] text-danger/80 tabular-nums">
        CONFIDENCE {Math.round(legibility)}%
      </span>
    </div>
  );
}

/**
 * The magnified region.
 *
 * Drawn twice and cross-faded: an unsmoothed pass so the player sees real
 * pixel blocks, and a smoothed, contrast-lifted pass that resolves over the top
 * of it. That cross-fade is the entire "enhance" illusion, and it is honest —
 * both passes are the same submitted pixels.
 */
function RecoveryCanvas({
  src,
  rect,
  enhance,
  sweep,
}: {
  src: string;
  rect: PixelRect | null;
  enhance: number;
  sweep: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  // State rather than a ref: the decode has to trigger the redraw itself, and
  // the exhibit is a data URL that may take a frame or two to come back. The
  // source is carried alongside the bitmap so a stale decode is never drawn
  // against a new region — and so the effect never has to clear it up front.
  const [decoded, setDecoded] = useState<{
    src: string;
    img: HTMLImageElement;
  } | null>(null);
  const img = decoded?.src === src ? decoded.img : null;

  useEffect(() => {
    let cancelled = false;
    loadImage(src)
      .then((loaded) => {
        if (!cancelled) setDecoded({ src, img: loaded });
      })
      .catch(() => {
        /* The pipeline already reports a failed exhibit; leave the glass dark. */
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.filter = "none";
    ctx.fillStyle = "#070911";
    ctx.fillRect(0, 0, CW, CH);
    if (!img || !rect) return;

    // Contain-fit the region: maximum magnification the glass allows, with no
    // distortion, so measurements read off it stay meaningful.
    const k = Math.min(CW / rect.w, CH / rect.h);
    const dw = rect.w * k;
    const dh = rect.h * k;
    const dx = (CW - dw) / 2;
    const dy = (CH - dh) / 2;

    const draw = () => {
      ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, dx, dy, dw, dh);
    };

    // Raw pixels underneath.
    ctx.imageSmoothingEnabled = false;
    draw();

    // The recovered read, faded in over the top.
    if (enhance > 0) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.globalAlpha = enhance;
      ctx.filter = `contrast(${100 + enhance * 55}%) brightness(${
        100 + enhance * 10
      }%) saturate(${100 - enhance * 45}%)`;
      draw();
      ctx.globalAlpha = 1;
      ctx.filter = "none";
    }

    // Pixel lattice, strongest while the image is still raw. Only worth drawing
    // when a source pixel is actually big enough to be a cell on screen.
    if (k >= 6 && enhance < 1) {
      ctx.strokeStyle = `rgba(34, 211, 238, ${0.16 * (1 - enhance)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= rect.w; x++) {
        const px = Math.round(dx + x * k) + 0.5;
        ctx.moveTo(px, dy);
        ctx.lineTo(px, dy + dh);
      }
      for (let y = 0; y <= rect.h; y++) {
        const py = Math.round(dy + y * k) + 0.5;
        ctx.moveTo(dx, py);
        ctx.lineTo(dx + dw, py);
      }
      ctx.stroke();
    }

    // The recovery head, sweeping down the region while it resolves.
    if (enhance > 0 && enhance < 1) {
      const y = dy + dh * ((sweep * 3) % 1);
      const grad = ctx.createLinearGradient(0, y - 24, 0, y + 4);
      grad.addColorStop(0, "rgba(34, 211, 238, 0)");
      grad.addColorStop(1, "rgba(34, 211, 238, 0.28)");
      ctx.fillStyle = grad;
      ctx.fillRect(dx, y - 24, dw, 28);
      ctx.fillStyle = "rgba(34, 211, 238, 0.7)";
      ctx.fillRect(dx, y, dw, 1);
    }

    // Corner brackets, so the glass reads as an instrument rather than a crop.
    ctx.strokeStyle = "rgba(34, 211, 238, 0.55)";
    ctx.lineWidth = 2;
    const arm = 22;
    for (const [cx, cy, sx, sy] of [
      [dx, dy, 1, 1],
      [dx + dw, dy, -1, 1],
      [dx, dy + dh, 1, -1],
      [dx + dw, dy + dh, -1, -1],
    ]) {
      ctx.beginPath();
      ctx.moveTo(cx + sx * arm, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + sy * arm);
      ctx.stroke();
    }
  }, [img, rect, enhance, sweep]);

  return (
    <canvas
      ref={ref}
      width={CW}
      height={CH}
      className="u-scanlines absolute inset-0 h-full w-full object-contain"
    />
  );
}

/**
 * Inset locator: the whole filed exhibit, with the examined region boxed.
 *
 * Without it a hard magnification is disorienting — the player loses which part
 * of their own photograph is being taken apart.
 */
function Locator({
  src,
  rect,
  filed,
  aspect,
}: {
  src: string;
  rect: PixelRect | null;
  filed: { w: number; h: number } | null;
  aspect: number;
}) {
  const box =
    rect && filed
      ? {
          left: (rect.x / filed.w) * 100,
          top: (rect.y / filed.h) * 100,
          width: (rect.w / filed.w) * 100,
          height: (rect.h / filed.h) * 100,
        }
      : null;

  return (
    <div
      className="absolute right-2 bottom-[52px] z-30 w-[132px] border border-line bg-void/85 p-1"
      style={{ aspectRatio: `${aspect}` }}
    >
      {/* Deliberately a plain img: the source is a data URL of arbitrary size
          and this is a 132px decoration, not something to hand the optimiser. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="h-full w-full object-cover opacity-45"
      />
      {box && (
        <div
          className="absolute border border-cyan bg-cyan/20"
          style={{
            left: `calc(${box.left}% + 4px)`,
            top: `calc(${box.top}% + 4px)`,
            width: `${box.width}%`,
            height: `${box.height}%`,
          }}
        />
      )}
    </div>
  );
}
