/**
 * The bed, and its licence.
 *
 * "Expedition" is CC BY 3.0: commercial use is granted, attribution is
 * *required*. CC BY asks for attribution "reasonable to the medium", and for a
 * web app the deployed page is the medium — a line in the README does not
 * satisfy it.
 *
 * The credit is rendered by `MusicCredit` at the foot of the dossier, the last
 * screen of a run and the one place with nothing competing for attention. It
 * was originally on the cold open, where it argued with the pitch; that is why
 * it moved, not why it was dropped.
 *
 * The remaining improvement is to swap the bed for a CC0 track: CC0 waives
 * attribution entirely, so the question stops being one. Clear `artist`,
 * `license`, `licenseUrl` and the `via` fields when that happens and the
 * footer removes itself — it renders nothing without an artist and a licence.
 *
 * This object is the single source of truth either way: swapping the track
 * means editing it and nothing else.
 */
import { assetPath } from "@/lib/asset-path";

export const MUSIC = {
  /** Served from /public. Streamed, and only when the player asks for sound. */
  src: assetPath("/audio/expedition-alex-productions.mp3"),
  title: "Expedition",
  artist: "Alex-Productions",
  artistUrl: "https://onsound.eu/",
  license: "CC BY 3.0",
  licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
  /** Where the track was obtained, per the publisher's requested credit. */
  viaLabel: "Chosic",
  viaUrl: "https://www.chosic.com/free-music/all/",
} as const;
