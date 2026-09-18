/**
 * Every exhibit, fetched while the player is still watching the cold open.
 *
 * The exhibits are full-resolution PNGs, 1–1.7MB each, and every screen after
 * the boot needs them: the boot feed cuts between all five, the briefing shows
 * them, the editor fetches its case's capture before the clock can start, and
 * the analyser decodes it again. On the static deploy all of those request the
 * same raw URL, so one early fetch warms the cache for every one of them — and
 * the intro is fourteen seconds of black screen and big words during which the
 * network has almost nothing else to do.
 *
 * Low priority, so the intro's own backdrop plates still arrive first, and
 * started a beat after mount for the same reason. Fire-and-forget: a failure
 * here costs nothing but the head start, and every consumer loads its own copy
 * regardless.
 */

import { MISSIONS } from "@/data/missions";

let started = false;
/** Held so the requests are not collected before they complete. */
const inFlight: HTMLImageElement[] = [];

export function warmExhibits(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  for (const mission of MISSIONS) {
    const img = new Image();
    img.decoding = "async";
    img.setAttribute("fetchpriority", "low");
    img.src = mission.image;
    inFlight.push(img);
  }
}
