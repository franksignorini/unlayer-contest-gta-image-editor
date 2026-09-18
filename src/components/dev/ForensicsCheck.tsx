"use client";

/**
 * Forensic engine verification harness (development only).
 *
 * The acceptance criteria for the scoring model are behavioural — "a half-turn
 * of DEFOCUS must reach ACCEPTED on every case", "dragging it to the end must
 * not", "a solid bar over every target must read as TAMPERING" — and those
 * cannot be checked by driving the editor UI by hand for every case. So this
 * synthesises the edits directly on canvas, runs them through the *real*
 * analyser, and prints what came out.
 *
 * EVERY SCENARIO HERE MUST BE SOMETHING THE PLAYER CAN ACTUALLY DO.
 *
 * That rule is the whole reason this file was rewritten. The harness used to
 * lean on a blur clipped to each evidence region, and carried the model's
 * headline acceptance criterion on it — but the editor has no region-limited
 * blur. Its filters are whole-frame, its brushes and shapes are opaque, and its
 * crop removes. So the harness reported a healthy 4/4 with 0 mismatches while
 * the only strategy a player could actually reach (global defocus) failed on
 * two cases and pixelation failed on all five. A synthetic edit that no tool
 * produces is not a test, it is a second implementation of the game agreeing
 * with the first.
 *
 * Run it at /forensics-check with `npm run dev`. For a spot check against the
 * real editor rather than a synthetic stand-in, use /forensics-editor.
 */

import { useCallback, useEffect, useState } from "react";
import { MISSIONS } from "@/data/missions";
import { ForensicAnalyzer } from "@/lib/forensics/analyze";
// The DEFOCUS model lives with the game, not here: the terminal projects a
// SCRUB preview with this same rendering, so the harness and the live rail
// cannot drift onto two different ideas of what the slider does.
import { renderDefocus } from "@/lib/forensics/projection";
import type { Mission, Outcome } from "@/types";

interface Row {
  missionId: string;
  scenario: string;
  expected: Outcome | "any";
  identification: number;
  integrity: number;
  suspicion: number;
  outcome: Outcome;
  frameLoss: number;
  hardEdges: number;
  detailLoss: number;
  legibility: string;
  ms: number;
}

/* ------------------------------------------------------------------ *
 * Canvas helpers
 * ------------------------------------------------------------------ */

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  return { canvas, ctx };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

type Build = (img: HTMLImageElement, mission: Mission) => string;

/**
 * Whole-frame defocus, as the SCRUB > DEFOCUS slider applies it.
 *
 * The same rendering the terminal's live projection uses, edge clamping
 * included. The harness used to blur plain, which fades every border towards
 * black and reads as an exposure shift the editor never makes — up to five
 * points of integrity too pessimistic on the narrower exhibits, measured
 * against /forensics-editor. See lib/forensics/projection.
 */
function defocus(slider: number): Build {
  return (img) => renderDefocus(img, slider).toDataURL("image/png");
}

/**
 * The editor's PIXELATE slider, as a whole-frame mosaic.
 *
 * Block size is taken as a fraction of the frame for the same reason the blur
 * radius is; measured against the running editor at roughly `block ≈ 0.25 *
 * slider` pixels on a 1440px exhibit.
 */
function pixelate(slider: number): Build {
  return (img) => {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const block = Math.max(2, Math.round(w * 1.74e-4 * slider));
    const small = makeCanvas(
      Math.max(1, Math.round(w / block)),
      Math.max(1, Math.round(h / block))
    );
    small.ctx.imageSmoothingEnabled = true;
    small.ctx.drawImage(img, 0, 0, small.canvas.width, small.canvas.height);
    const dst = makeCanvas(w, h);
    dst.ctx.imageSmoothingEnabled = false;
    dst.ctx.drawImage(small.canvas, 0, 0, w, h);
    return dst.canvas.toDataURL("image/png");
  };
}

/** Opaque cover over every target — BLOCK, or PAINT with a fat brush. */
const paintOverAll: Build = (img, mission) => {
  const { canvas, ctx } = makeCanvas(img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, 0, 0);
  ctx.fillStyle = "#000000";
  for (const t of mission.targets) {
    ctx.fillRect(t.region.x, t.region.y, t.region.w, t.region.h);
  }
  return canvas.toDataURL("image/png");
};

/**
 * A busy, coloured object dropped over every target — PLANT, or PAINT in a
 * colour, or BLOCK with a gradient fill.
 *
 * This is the case a solid black bar does not cover, and it is the one players
 * actually reach for: the evidence is gone under something *detailed*. A
 * measure that scores "how much structure is in this region" instead of "how
 * much of the ORIGINAL structure is still here" reads a sticker as a fully
 * legible face.
 */
const plantOverAll: Build = (img, mission) => {
  const { canvas, ctx } = makeCanvas(img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, 0, 0);
  // Deterministic, so the row is comparable between runs.
  let seed = 0x2f6e2b1;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (const t of mission.targets) {
    const { x, y, w, h } = t.region;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = "#c81e2e";
    ctx.fillRect(x, y, w, h);
    // Give it structure of its own — highlights, edges, a bit of everything,
    // so the region is busier after the edit than it was before.
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `hsl(${rnd() * 60}deg 85% ${25 + rnd() * 55}%)`;
      ctx.fillRect(
        x + rnd() * w,
        y + rnd() * h,
        Math.max(2, rnd() * w * 0.3),
        Math.max(2, rnd() * h * 0.3)
      );
    }
    ctx.restore();
  }
  return canvas.toDataURL("image/png");
};

/** Opaque cover over the single highest-weight target only. */
const paintOverWorst: Build = (img, mission) => {
  const { canvas, ctx } = makeCanvas(img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, 0, 0);
  const t = [...mission.targets].sort((a, b) => b.weight - a.weight)[0];
  ctx.fillStyle = "#000000";
  ctx.fillRect(t.region.x, t.region.y, t.region.w, t.region.h);
  return canvas.toDataURL("image/png");
};

/** Centre crop to `frac` of each dimension — CUT. */
function centreCrop(frac: number): Build {
  return (img) => {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const cw = Math.round(w * frac);
    const ch = Math.round(h * frac);
    const { canvas, ctx } = makeCanvas(cw, ch);
    ctx.drawImage(
      img,
      Math.round((w - cw) / 2),
      Math.round((h - ch) / 2),
      cw,
      ch,
      0,
      0,
      cw,
      ch
    );
    return canvas.toDataURL("image/png");
  };
}

/** SCRUB > EXPOSURE cranked, as a lazy way of washing detail out. */
const blownExposure: Build = (img) => {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const src = makeCanvas(w, h);
  src.ctx.drawImage(img, 0, 0);
  const dst = makeCanvas(w, h);
  dst.ctx.filter = "brightness(1.85) contrast(0.55)";
  dst.ctx.drawImage(src.canvas, 0, 0);
  return dst.canvas.toDataURL("image/png");
};

/** SCRUB > DESATURATE. Hides nothing structural; should barely move the needle. */
const desaturate: Build = (img) => {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const src = makeCanvas(w, h);
  src.ctx.drawImage(img, 0, 0);
  const dst = makeCanvas(w, h);
  dst.ctx.filter = "grayscale(1)";
  dst.ctx.drawImage(src.canvas, 0, 0);
  return dst.canvas.toDataURL("image/png");
};

/**
 * Defocus at `level`, then a bar over whatever is still carrying the case.
 *
 * This is the only *combined* move the editor permits. Every filter is
 * whole-frame and every local tool is opaque, so "scrub the picture, then deal
 * with the one target the scrub did not finish" is the entire space of skilled
 * play — and whether it is better than the single-slider line is the question
 * that decides if this game has one move or two.
 */
function defocusThenCover(level: number): Build {
  return (img, mission) => {
    const canvas = renderDefocus(img, level);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    const t = [...mission.targets].sort((a, b) => b.weight - a.weight)[0];
    ctx.fillStyle = "#000000";
    ctx.fillRect(t.region.x, t.region.y, t.region.w, t.region.h);
    return canvas.toDataURL("image/png");
  };
}

/** Copy of the source, as a baseline "the player changed nothing". */
const passthrough: Build = (img) => {
  const { canvas, ctx } = makeCanvas(img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL("image/png");
};

interface Scenario {
  id: string;
  note: string;
  expected: Outcome | "any";
  build: Build;
}

/**
 * The behavioural contract.
 *
 * A healthy model reaches 4/4 outcomes with 0 mismatches AND shows no dominant
 * strategy: crude hiding punished, careful hiding rewarded, half measures
 * failing, and every case winnable by at least one route.
 */
const SCENARIOS: Scenario[] = [
  {
    id: "untouched",
    note: "Filed exactly as recorded.",
    expected: "IDENTIFIED",
    build: passthrough,
  },
  {
    id: "defocus-25",
    // Case-dependent by design, and the clearest evidence the cases play
    // differently: it clears VC-001's small plate outright and leaves VC-004's
    // face still referable.
    note: "SCRUB > DEFOCUS at a quarter. Cheap, and sometimes enough.",
    expected: "any",
    build: defocus(25),
  },
  {
    id: "defocus-50",
    // THE acceptance criterion for the model: there has to be a setting that
    // beats recognition while the photograph still passes as a photograph, and
    // it has to exist on every case.
    note: "SCRUB > DEFOCUS at half — the window. Beats recognition, still plausible.",
    expected: "ACCEPTED",
    build: defocus(50),
  },
  {
    id: "defocus-75",
    note: "SCRUB > DEFOCUS at three quarters.",
    expected: "any",
    build: defocus(75),
  },
  {
    id: "defocus-100",
    // Overcooked, and it must read that way. Dragging the slider to the end
    // leaves an exhibit with no fine structure anywhere, which is as obviously
    // worked on as a bar across the frame. If this ever scores ACCEPTED the
    // game has a dominant strategy again and the tool stops being a decision.
    note: "SCRUB > DEFOCUS at maximum. Hides everything; the defocus is the finding.",
    expected: "TAMPERING",
    build: defocus(100),
  },
  {
    id: "pixelate-50",
    note: "SCRUB > PIXELATE at half.",
    expected: "TAMPERING",
    build: pixelate(50),
  },
  {
    id: "pixelate-100",
    // A mosaic hides as well as a bar and announces itself as loudly. It must
    // read as tampering, never as "we can still identify you at 91%".
    note: "SCRUB > PIXELATE at maximum. Hides everything, screams about it.",
    expected: "TAMPERING",
    build: pixelate(100),
  },
  {
    id: "paint-over-all",
    note: "BLOCK over every evidence region — crude, effective, obvious.",
    expected: "TAMPERING",
    build: paintOverAll,
  },
  {
    id: "plant-over-all",
    // Hiding evidence under something detailed must count as hiding it. It is
    // also loud — foreign content in five places is not subtle — so the
    // expectation is that they cannot identify you and can see why.
    note: "PLANT/PAINT a busy coloured object over every evidence region.",
    expected: "TAMPERING",
    build: plantOverAll,
  },
  {
    id: "paint-over-worst",
    note: "BLOCK over the single highest-weight target only.",
    expected: "any",
    build: paintOverWorst,
  },
  {
    id: "light-defocus-then-cover",
    // The expert line, and the check that one exists at all. A quarter turn
    // costs far less integrity than a half, so if pairing it with a single
    // small bar clears the referral target, careful play beats the one-slider
    // answer and the tool rail is a decision rather than a dial. If this only
    // ever reads TAMPERING, the game really does have one move.
    note: "SCRUB > DEFOCUS a quarter, then BLOCK the one target still carrying the case.",
    expected: "any",
    build: defocusThenCover(25),
  },
  {
    id: "defocus-then-cover",
    note: "Heavy defocus, then a bar over the most damaging target.",
    expected: "any",
    build: defocusThenCover(70),
  },
  {
    id: "blown-exposure",
    note: "SCRUB > EXPOSURE up, contrast down across the frame.",
    expected: "any",
    build: blownExposure,
  },
  {
    id: "desaturate",
    note: "SCRUB > DESATURATE. Changes the look, hides nothing.",
    expected: "IDENTIFIED",
    build: desaturate,
  },
  {
    id: "crop-60",
    note: "CUT to 60% of each dimension.",
    expected: "any",
    build: centreCrop(0.6),
  },
];

/* ------------------------------------------------------------------ *
 * Harness
 * ------------------------------------------------------------------ */

export function ForensicsCheck() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState("idle");

  const run = useCallback(async () => {
    // Yield first, so the mount effect below never sets state synchronously.
    await Promise.resolve();
    setRows([]);
    setStatus("running");
    const out: Row[] = [];
    for (const mission of MISSIONS) {
      let analyzer: ForensicAnalyzer;
      let img: HTMLImageElement;
      try {
        analyzer = await ForensicAnalyzer.create(mission);
        img = await loadImage(mission.image);
      } catch (err) {
        console.error(mission.id, err);
        continue;
      }
      for (const scenario of SCENARIOS) {
        setStatus(`${mission.id} · ${scenario.id}`);
        try {
          const dataUrl = scenario.build(img, mission);
          const r = await analyzer.analyze(dataUrl);
          out.push({
            missionId: mission.id,
            scenario: scenario.id,
            expected: scenario.expected,
            identification: r.identification,
            integrity: r.integrity,
            suspicion: r.suspicion,
            outcome: r.outcome,
            frameLoss: r.signals.frameLoss,
            hardEdges: r.signals.hardEdges,
            detailLoss: r.signals.detailLoss,
            legibility: r.findings
              .map((f) => `${f.short}:${f.legibility.toFixed(0)}`)
              .join(" "),
            ms: r.elapsedMs,
          });
          setRows([...out]);
        } catch (err) {
          console.error(mission.id, scenario.id, err);
        }
      }
    }
    setStatus("done");
  }, []);

  // Kick the run off the effect body entirely — this is a long async sweep,
  // not state React needs synchronised on mount.
  useEffect(() => {
    const id = setTimeout(() => void run(), 0);
    return () => clearTimeout(id);
  }, [run]);

  const outcomes = new Set(rows.map((r) => r.outcome));
  const mismatches = rows.filter(
    (r) => r.expected !== "any" && r.expected !== r.outcome
  );
  // Every case has to be winnable. A case with no ACCEPTED row anywhere in the
  // sweep is a case the player cannot clear, however well they play it.
  const unwinnable = MISSIONS.filter(
    (m) =>
      rows.some((r) => r.missionId === m.id) &&
      !rows.some((r) => r.missionId === m.id && r.outcome === "ACCEPTED")
  ).map((m) => m.id);

  return (
    <main className="min-h-dvh bg-void p-6 font-mono text-[12px] text-bone">
      <h1 className="u-display mb-1 text-[22px]">FORENSIC ENGINE CHECK</h1>
      <p className="mb-4 text-dim">
        Synthetic edits through the real analyser — every scenario an operation
        the editor can actually perform. Development only.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-4 border border-line bg-panel px-3 py-2">
        <span className="text-dim">
          STATUS <span className="text-cyan">{status}</span>
        </span>
        <span className="text-dim">
          ROWS <span className="text-bone">{rows.length}</span>
        </span>
        <span className="text-dim">
          OUTCOMES REACHED{" "}
          <span className={outcomes.size >= 4 ? "text-clear" : "text-amber"}>
            {outcomes.size}/4
          </span>{" "}
          <span className="text-faint">
            [{[...outcomes].join(", ") || "—"}]
          </span>
        </span>
        <span className="text-dim">
          EXPECTATION MISMATCHES{" "}
          <span className={mismatches.length ? "text-danger" : "text-clear"}>
            {mismatches.length}
          </span>
        </span>
        <span className="text-dim">
          UNWINNABLE CASES{" "}
          <span className={unwinnable.length ? "text-danger" : "text-clear"}>
            {unwinnable.length ? unwinnable.join(", ") : "none"}
          </span>
        </span>
        <button
          onClick={() => void run()}
          className="u-label border border-line-hot px-3 py-1 text-[10px] text-dim hover:text-cyan"
        >
          RE-RUN
        </button>
      </div>

      <table className="w-full border-collapse text-left">
        <thead className="u-label text-[9px] text-faint">
          <tr className="border-b border-line">
            <th className="py-1.5 pr-3">CASE</th>
            <th className="py-1.5 pr-3">SCENARIO</th>
            <th className="py-1.5 pr-3 text-right">IDENT</th>
            <th className="py-1.5 pr-3 text-right">INTEG</th>
            <th className="py-1.5 pr-3 text-right">SUSP</th>
            <th className="py-1.5 pr-3 text-right">FRAME</th>
            <th className="py-1.5 pr-3 text-right">EDGES</th>
            <th className="py-1.5 pr-3 text-right">DEFOC</th>
            <th className="py-1.5 pr-3">OUTCOME</th>
            <th className="py-1.5 pr-3">EXPECTED</th>
            <th className="py-1.5 pr-3">PER-TARGET</th>
            <th className="py-1.5 text-right">MS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const bad = r.expected !== "any" && r.expected !== r.outcome;
            return (
              <tr
                key={i}
                className={`border-b border-line/40 ${bad ? "bg-danger/10" : ""}`}
              >
                <td className="py-1 pr-3 text-dim">{r.missionId}</td>
                <td className="py-1 pr-3">{r.scenario}</td>
                <td className="py-1 pr-3 text-right">
                  {r.identification.toFixed(0)}
                </td>
                <td className="py-1 pr-3 text-right">
                  {r.integrity.toFixed(0)}
                </td>
                <td className="py-1 pr-3 text-right text-dim">
                  {r.suspicion.toFixed(0)}
                </td>
                <td className="py-1 pr-3 text-right text-faint">
                  {(r.frameLoss * 100).toFixed(0)}
                </td>
                <td className="py-1 pr-3 text-right text-faint">
                  {(r.hardEdges * 100).toFixed(0)}
                </td>
                <td className="py-1 pr-3 text-right text-faint">
                  {(r.detailLoss * 100).toFixed(0)}
                </td>
                <td
                  className={`py-1 pr-3 ${
                    {
                      ACCEPTED: "text-clear",
                      INSUFFICIENT: "text-amber",
                      TAMPERING: "text-magenta",
                      IDENTIFIED: "text-danger",
                    }[r.outcome]
                  }`}
                >
                  {r.outcome}
                </td>
                <td className="py-1 pr-3 text-faint">{r.expected}</td>
                <td className="py-1 pr-3 text-[10px] text-ghost">
                  {r.legibility}
                </td>
                <td className="py-1 text-right text-faint">
                  {r.ms.toFixed(0)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
