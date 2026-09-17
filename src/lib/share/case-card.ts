/**
 * The case card — the thing that leaves the browser.
 *
 * A run of this game currently ends inside a tab: the player sees their
 * forgery judged and then has nothing to show for it. This renders the whole
 * outcome as a single PNG — what the camera recorded next to what they filed,
 * the verdict, the numbers, the wanted level — so the run becomes an artefact.
 *
 * It is drawn on a canvas rather than screenshotted from the DOM because the
 * dossier is a responsive three-column layout and a share image is not: this
 * is composed for a 1.91:1 crop, which is what every link preview expects.
 *
 * Design tokens are read from the live stylesheet instead of being duplicated
 * here. There is exactly one palette in this project and the card must not be
 * allowed to drift out of it — if `globals.css` changes, this follows.
 */

import type { ForensicResult, Mission, Submission } from "@/types";
import { OUTCOME_COPY, WANTED_MAX, wantedLabel } from "@/lib/forensics/score";
import { loadImage } from "@/lib/forensics/image";
import {
  identificationTone,
  integrityTone,
  shownIdentification,
  shownIntegrity,
  type Tone,
} from "@/lib/forensics/display";
import type { OperatorRating } from "@/lib/game/rating";

/** 1.91:1, the aspect every link preview crops to. Rendered at 2x for print. */
const W = 1200;
const H = 630;
const SCALE = 2;

const PAD = 44;

/**
 * A figure's colour comes from the same bands the rail and the verdict use.
 * Hard-coded, identification was always red and integrity always green — so a
 * clean 14% went out on the shared card looking like a failure.
 */
const FIGURE_TOKEN: Record<Tone, string> = {
  clear: "--color-clear",
  amber: "--color-amber",
  danger: "--color-danger",
};

/** Tone → the palette token the outcome is drawn in. */
const TONE_TOKEN: Record<string, string> = {
  clear: "--color-clear",
  warn: "--color-amber",
  danger: "--color-magenta",
  critical: "--color-danger",
};

interface Palette {
  (token: string): string;
}

function readPalette(): Palette {
  const styles = getComputedStyle(document.documentElement);
  return (token: string) => styles.getPropertyValue(token).trim() || "#ffffff";
}

function readFonts() {
  const styles = getComputedStyle(document.documentElement);
  return {
    display:
      styles.getPropertyValue("--font-display").trim() ||
      "'Arial Narrow', sans-serif",
    mono: styles.getPropertyValue("--font-mono").trim() || "monospace",
  };
}

/**
 * Draw an image to fill a box without distorting it — the same framing rule as
 * CSS `object-fit: cover`, which canvas has no equivalent for.
 */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

/** A five-pointed star, filled or hollow. Used for the wanted level. */
function star(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  filled: boolean,
  color: string
) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.44;
    // Start at -90° so the point faces up.
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
}

/** Small uppercase caption above a block. */
function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  font: string
) {
  ctx.font = `600 11px ${font}`;
  ctx.fillStyle = color;
  ctx.letterSpacing = "1.4px";
  ctx.fillText(text, x, y);
  ctx.letterSpacing = "0px";
}

export interface CaseCardInput {
  mission: Mission;
  submission: Submission;
  result: ForensicResult;
  wantedLevel: number;
  /** The dossier's own rating, passed in so the card cannot contradict it. */
  rating: OperatorRating;
}

/**
 * Render the card. Resolves to a PNG blob.
 *
 * Both images are same-origin or data URLs, so the canvas is never tainted and
 * `toBlob` is always allowed.
 */
export async function renderCaseCard({
  mission,
  submission,
  result,
  wantedLevel,
  rating,
}: CaseCardInput): Promise<Blob> {
  const c = readPalette();
  const f = readFonts();
  const copy = OUTCOME_COPY[result.outcome];
  const accent = c(TONE_TOKEN[copy.tone] ?? "--color-magenta");

  // Webfonts are loaded by next/font at runtime; canvas silently falls back to
  // a system face if we draw before they land.
  if (document.fonts?.ready) await document.fonts.ready;

  const [original, filed] = await Promise.all([
    loadImage(mission.image),
    loadImage(submission.dataUrl),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable for the case card");
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "alphabetic";

  /* ---- ground ---- */
  ctx.fillStyle = c("--color-void");
  ctx.fillRect(0, 0, W, H);

  // Scanlines, at the same 1-in-3 rhythm as the app's CRT treatment.
  ctx.fillStyle = "rgba(255,255,255,0.014)";
  for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);

  // Evidence-tape edge along the top.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, 4);
  ctx.clip();
  ctx.fillStyle = c("--color-tape");
  ctx.globalAlpha = 0.55;
  for (let x = -20; x < W + 20; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, 4);
    ctx.lineTo(x + 8, 4);
    ctx.lineTo(x + 16, 0);
    ctx.lineTo(x + 8, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  /* ---- header ---- */
  ctx.font = `700 34px ${f.display}`;
  ctx.fillStyle = c("--color-bone");
  ctx.letterSpacing = "0.5px";
  ctx.fillText("VICE EVIDENCE", PAD, 74);
  ctx.letterSpacing = "0px";

  ctx.font = `400 12px ${f.mono}`;
  ctx.fillStyle = c("--color-dim");
  ctx.fillText(
    `VCPD DIGITAL FORENSICS · ${mission.id} · ${mission.title.toUpperCase()}`,
    PAD,
    94
  );

  // Wanted level, top right.
  ctx.textAlign = "right";
  label(ctx, "WANTED LEVEL", W - PAD, 62, c("--color-faint"), f.display);
  ctx.textAlign = "left";
  const starR = 10;
  const starGap = 25;
  const starsRight = W - PAD;
  for (let i = 0; i < WANTED_MAX; i++) {
    const cx = starsRight - starR - (WANTED_MAX - 1 - i) * starGap;
    const lit = i < wantedLevel;
    const terminal = i === WANTED_MAX - 1;
    star(
      ctx,
      cx,
      84,
      starR,
      lit,
      lit
        ? terminal
          ? c("--color-danger")
          : c("--color-amber")
        : c("--color-ghost")
    );
  }
  ctx.textAlign = "right";
  ctx.font = `600 11px ${f.display}`;
  ctx.fillStyle = wantedLevel >= WANTED_MAX ? c("--color-danger") : c("--color-dim");
  ctx.letterSpacing = "1.2px";
  ctx.fillText(wantedLabel(wantedLevel), W - PAD, 104);
  ctx.letterSpacing = "0px";
  ctx.textAlign = "left";

  ctx.fillStyle = c("--color-line");
  ctx.fillRect(PAD, 112, W - PAD * 2, 1);

  /* ---- the comparison ---- */
  // Height, not width, is the scarce dimension on a 1.91:1 card: the verdict
  // headline needs clear air under the images or the two read as one block.
  const boxW = 533;
  const boxH = 282;
  const boxY = 150;
  const leftX = PAD;
  const rightX = W - PAD - boxW;

  label(ctx, "AS RECORDED", leftX, boxY - 12, c("--color-faint"), f.display);
  label(ctx, "AS FILED", rightX, boxY - 12, accent, f.display);

  ctx.fillStyle = c("--color-pit");
  ctx.fillRect(leftX, boxY, boxW, boxH);
  ctx.fillRect(rightX, boxY, boxW, boxH);
  drawCover(ctx, original, leftX, boxY, boxW, boxH);
  drawCover(ctx, filed, rightX, boxY, boxW, boxH);

  // Both frames get a visible edge — with only the filed one outlined, the
  // original stopped reading as a framed exhibit at all.
  ctx.strokeStyle = c("--color-line-live");
  ctx.lineWidth = 1;
  ctx.strokeRect(leftX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);
  ctx.strokeStyle = accent;
  ctx.strokeRect(rightX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);

  /* ---- verdict ---- */
  const verdictY = 498;
  ctx.font = `700 40px ${f.display}`;
  ctx.fillStyle = accent;
  ctx.letterSpacing = "0.5px";
  ctx.fillText(copy.headline, PAD, verdictY);
  ctx.letterSpacing = "0px";

  ctx.textAlign = "right";
  label(ctx, "CASE STATUS", W - PAD, verdictY - 22, c("--color-faint"), f.display);
  ctx.font = `600 20px ${f.display}`;
  ctx.fillStyle = c("--color-bone");
  ctx.fillText(copy.caseStatus, W - PAD, verdictY);
  ctx.textAlign = "left";

  /* ---- the numbers ---- */
  const stats: Array<[string, string, string]> = [
    [
      "IDENTIFICATION",
      `${shownIdentification(result.identification)}%`,
      FIGURE_TOKEN[identificationTone(result.identification)],
    ],
    [
      "EXHIBIT INTEGRITY",
      `${shownIntegrity(result.integrity)}%`,
      FIGURE_TOKEN[integrityTone(result.integrity)],
    ],
    // In the grade's own tone, as the dossier and the verdict card print it.
    // Fixed cyan, an F went out on the shared image looking like a pass.
    ["OPERATOR RATING", `${rating.grade} · ${rating.title}`, `--color-${rating.tone}`],
  ];
  const statY = 548;
  const statW = (W - PAD * 2) / 3;
  stats.forEach(([name, value, token], i) => {
    const x = PAD + statW * i;
    label(ctx, name, x, statY, c("--color-faint"), f.display);
    ctx.font = `500 26px ${f.mono}`;
    ctx.fillStyle = c(token);
    ctx.fillText(value, x, statY + 30);
  });

  /* ---- footer ---- */
  ctx.font = `400 11px ${f.mono}`;
  ctx.fillStyle = c("--color-ghost");
  ctx.fillText(
    `${mission.cameraId} · ${mission.timestamp} · ${
      result.transform.estimated ? "REFRAMED" : "FRAME INTACT"
    }`,
    PAD,
    H - 20
  );

  ctx.textAlign = "right";
  ctx.font = `600 13px ${f.display}`;
  ctx.fillStyle = c("--color-magenta");
  ctx.letterSpacing = "1.2px";
  ctx.fillText(`“${mission.closingLine}”`, W - PAD, H - 20);
  ctx.letterSpacing = "0px";
  ctx.textAlign = "left";

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Case card encoding failed")),
      "image/png"
    );
  });
}

/** `VC-001` + `ACCEPTED` → `vice-evidence-vc-001-accepted.png`. */
export function caseCardFilename(mission: Mission, result: ForensicResult) {
  return `vice-evidence-${mission.id}-${result.outcome}.png`.toLowerCase();
}
