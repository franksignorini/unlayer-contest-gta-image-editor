/**
 * The cold open.
 *
 * Black screen, white words, hard cuts. It runs once per browser and its only
 * job is to make the premise land before the terminal appears: a camera has
 * you, you have three minutes with the picture, and the two things the job
 * asks for are in direct conflict.
 *
 * Copy is data so the pacing can be tuned without touching the component.
 * Durations include the ~260ms exit beat, so a card reads for `ms` total.
 *
 * Cards without a `backdrop` are deliberate: the black beats are the punches.
 * NOT TONIGHT, the terminal reveal and the contradiction all land on nothing,
 * which is what makes the footage on either side of them register at all.
 */

import type { IntroBackdrop, IntroCard } from "@/types";
import { assetPath } from "@/lib/asset-path";

/**
 * Case footage shown behind the words — the department's own material, played
 * back in the dark. The plates are graded down at encode time and again in CSS;
 * they exist to give the black field depth and to show the player what kind of
 * night this is, never to compete with the type.
 *
 * Produced by scripts/prepare-backdrops.mjs from /assets/gameplay.
 */
export const INTRO_BACKDROPS: IntroBackdrop[] = [
  {
    id: "pursuit-swamp",
    src: assetPath("/backdrops/pursuit-swamp.jpg"),
    focus: "50% 55%",
    drift: "in",
  },
  {
    id: "standoff-street",
    src: assetPath("/backdrops/standoff-street.jpg"),
    focus: "50% 60%",
    drift: "out",
  },
  {
    id: "shootout-gate",
    src: assetPath("/backdrops/shootout-gate.jpg"),
    focus: "55% 55%",
    drift: "in",
  },
  {
    id: "two-up-car",
    src: assetPath("/backdrops/two-up-car.jpg"),
    focus: "58% 45%",
    drift: "out",
  },
];

export const INTRO_SCRIPT: IntroCard[] = [
  {
    id: "place",
    backdrop: "pursuit-swamp",
    lines: ["VICE CITY"],
    sub: "03:07 · TUESDAY · MUNICIPAL CAMERA 14",
    scale: "hero",
    ms: 1600,
  },
  {
    id: "seen",
    backdrop: "standoff-street",
    lines: ["A CAMERA", "SAW EVERYTHING."],
    scale: "statement",
    ms: 1650,
  },
  {
    id: "ends",
    backdrop: "shootout-gate",
    lines: ["NORMALLY THIS IS", "WHERE IT ENDS."],
    scale: "statement",
    ms: 1750,
  },
  {
    id: "turn",
    lines: ["NOT TONIGHT."],
    scale: "hero",
    effect: "flash",
    ms: 1300,
  },
  {
    id: "access",
    lines: ["THE EVIDENCE TERMINAL", "IS STILL LOGGED IN."],
    sub: "THREE MINUTES ALONE WITH THE PHOTOGRAPH · THEN FORENSICS RUN",
    subEmphasis: "THREE MINUTES",
    scale: "statement",
    ms: 2300,
  },
  {
    id: "rules",
    backdrop: "two-up-car",
    lines: ["HIDE WHAT IDENTIFIES YOU.", "KEEP IT LOOKING REAL."],
    // A long beat between the lines: the second has to land as a second demand,
    // not as the back half of a sentence. The contradiction is the point.
    lineBeatMs: 900,
    scale: "statement",
    ms: 3200,
  },
  {
    id: "title",
    backdrop: "pursuit-swamp",
    lines: ["VICE", "EVIDENCE"],
    sub: "VCPD · DIGITAL FORENSICS · EVIDENCE INTAKE",
    scale: "title",
    effect: "title",
    ms: 2500,
  },
];

/** Beat between a card's exit animation starting and the cut. */
export const INTRO_EXIT_MS = 260;

/** Bumped when the script changes enough that returning players should see it. */
export const INTRO_SEEN_KEY = "vice-evidence:intro-seen:v1";
