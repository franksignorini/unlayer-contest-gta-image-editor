"use client";

/**
 * Editor-in-the-loop forensic bench (development only).
 *
 * /forensics-check proves the analyser behaves against edits we synthesise on
 * canvas. This proves the synthesis is honest — it mounts the REAL editor over
 * a real exhibit and scores whatever the real tools produce.
 *
 * It exists because the two can drift apart silently, and did: the harness was
 * scoring a blur clipped to each evidence region, an operation the editor
 * cannot perform, and so reported a healthy model while the strategies actually
 * available to a player were failing. A synthetic edit is only evidence about
 * the game if a tool can produce it.
 *
 * Drive it from the console — the page exposes:
 *
 *   __ie                  the ImageEditorInstance
 *   __probe()             analyse the current canvas, summarised
 *   __apply(label, value) reset, open SCRUB, set one slider, commit, analyse
 *   __fitBlur()           best-fit canvas blur radius for the current canvas
 *
 * `__fitBlur` is what keeps /forensics-check's `defocusRadius` and `pixelate`
 * mappings tied to the real filters rather than to a guess.
 */

import { ImageEditor } from "@unlayer/react-image-editor";
import type { ImageEditorInstance } from "@unlayer/react-image-editor";
import { useMemo, useState } from "react";
import { MISSIONS } from "@/data/missions";
import { ForensicAnalyzer } from "@/lib/forensics/analyze";
import { buildEditorOptions } from "@/components/editor/editor-config";
import { commitAndRead } from "@/components/editor/commit";
import type { ForensicResult, Mission } from "@/types";

interface Summary {
  ident: number;
  integ: number;
  outcome: string;
  legs: string;
  /** What the rail and the log will CALL each target's treatment, and why. */
  treatments: string;
  signals: Record<string, number>;
}

function summarise(r: ForensicResult): Summary {
  return {
    ident: +r.identification.toFixed(1),
    integ: +r.integrity.toFixed(1),
    outcome: r.outcome,
    legs: r.findings
      .map((f) => `${f.short}:${f.legibility.toFixed(0)}`)
      .join(" "),
    treatments: r.findings
      .map(
        (f) =>
          `${f.short}:${f.treatment}(d${f.detailRatio.toFixed(2)} s${f.similarity.toFixed(2)} u${f.uniformity.toFixed(2)})`
      )
      .join(" "),
    signals: {
      edges: +r.signals.hardEdges.toFixed(3),
      flat: +r.signals.flatBlocks.toFixed(3),
      foreign: +r.signals.foreignDetail.toFixed(3),
      hist: +r.signals.histogramShift.toFixed(3),
      frame: +r.signals.frameLoss.toFixed(3),
      altered: +r.signals.alteredFraction.toFixed(3),
    },
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error(src));
    i.src = src;
  });
}

/**
 * Recover the canvas blur radius that best reproduces the editor's own output.
 *
 * The editor's DEFOCUS slider drives fabric's Blur, whose strength is a
 * texture-space delta scaled by image size — so there is no fixed pixel radius
 * to read off, and it has to be measured. Coarse-to-fine search on mean
 * absolute difference against the untouched exhibit.
 */
async function fitBlur(
  mission: Mission,
  editedUrl: string
): Promise<{ radius: number; error: number }> {
  const original = await loadImage(mission.image);
  const edited = await loadImage(editedUrl);
  const W = 320;
  const H = Math.round((original.naturalHeight / original.naturalWidth) * W);

  const grab = (
    source: HTMLImageElement,
    blurPx: number
  ): Float32Array => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    // Blur is applied at source scale, then reduced — matching how the editor
    // filters full-resolution pixels before we ever downsample them.
    ctx.filter = blurPx > 0 ? `blur(${blurPx * (W / original.naturalWidth)}px)` : "none";
    ctx.drawImage(source, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    const out = new Float32Array(W * H);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      out[p] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    }
    return out;
  };

  const target = grab(edited, 0);
  const score = (radius: number) => {
    const cand = grab(original, radius);
    let acc = 0;
    for (let i = 0; i < target.length; i++) acc += Math.abs(target[i] - cand[i]);
    return acc / target.length;
  };

  let best = { radius: 0, error: score(0) };
  for (let r = 1; r <= 80; r += 2) {
    const e = score(r);
    if (e < best.error) best = { radius: r, error: e };
  }
  for (let r = Math.max(0, best.radius - 2); r <= best.radius + 2; r += 0.5) {
    const e = score(r);
    if (e < best.error) best = { radius: r, error: e };
  }
  return { radius: +best.radius.toFixed(2), error: +best.error.toFixed(3) };
}

export function ForensicsEditor() {
  const [ready, setReady] = useState(false);
  const options = useMemo(() => buildEditorOptions(), []);
  const missionId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("case") ?? MISSIONS[0].id
      : MISSIONS[0].id;
  const mission = MISSIONS.find((m) => m.id === missionId) ?? MISSIONS[0];

  return (
    <div className="flex h-dvh flex-col bg-void">
      <div className="shrink-0 px-3 py-2 font-mono text-[11px] text-dim">
        FORENSIC BENCH — {mission.id} {ready ? "· READY" : "· MOUNTING"} ·
        drive from the console: <span className="text-cyan">__probe()</span>,{" "}
        <span className="text-cyan">__apply(&apos;DEFOCUS&apos;, 100)</span>,{" "}
        <span className="text-cyan">__fitBlur()</span> · ?case=
        {MISSIONS.map((m) => m.id).join("|")}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <ImageEditor
          image={mission.image}
          options={options}
          minHeight={600}
          style={{ height: "100%", width: "100%" }}
          onLoad={async (editor: ImageEditorInstance) => {
            const analyzer = await ForensicAnalyzer.create(mission);
            const w = window as unknown as Record<string, unknown>;

            const probe = async (): Promise<Summary | { error: string }> => {
              const url = editor.getImage();
              if (!url) return { error: "canvas has not decoded yet" };
              return summarise(await analyzer.analyze(url));
            };

            w.__ie = editor;
            w.__mission = mission;
            w.__probe = probe;
            // Score an arbitrary data URL — for comparing what a tool produced
            // against a hand-built stand-in without going through the canvas.
            w.__analyzeUrl = async (url: string) =>
              summarise(await analyzer.analyze(url));
            w.__fitBlur = async () => {
              const url = editor.getImage();
              if (!url) return { error: "canvas has not decoded yet" };
              return fitBlur(mission, url);
            };
            // Reset first: closing a filter panel flattens the effect into the
            // canvas, so two applications in a row compound instead of
            // replacing, and a sweep silently measures the wrong thing.
            w.__apply = async (label: string, value: number) => {
              const root = document.querySelector(".image-editor-root");
              if (!root) return { error: "editor not mounted" };
              editor.reset();
              await wait(1600);
              const scrub = [...root.querySelectorAll("button")].find(
                (b) => b.innerText.trim() === "SCRUB"
              );
              scrub?.click();
              await wait(700);
              const slider = [
                ...root.querySelectorAll<HTMLInputElement>("input[type=range]"),
              ].find((r) =>
                (r.closest("div")?.parentElement?.innerText ?? "")
                  .toUpperCase()
                  .startsWith(label.toUpperCase())
              );
              if (!slider) return { error: `no slider named ${label}` };
              const set = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                "value"
              )!.set!;
              set.call(slider, String(value));
              slider.dispatchEvent(new Event("input", { bubbles: true }));
              slider.dispatchEvent(new Event("change", { bubbles: true }));
              await wait(1800);
              // Commit through the shared helper rather than a local selector.
              // The local one looked for a control titled "Close" and had not
              // matched anything since `translations` renamed it to CLOSE — so
              // every sweep this harness ran was silently measuring the
              // UNEDITED exhibit and reporting it as the tool's output. A bench
              // that agrees with you because it never pressed the button is
              // worse than no bench. One definition now, shared with the game.
              await commitAndRead(editor, root);
              return probe();
            };
            setReady(true);
          }}
        />
      </div>
    </div>
  );
}
