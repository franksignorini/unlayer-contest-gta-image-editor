# VICE EVIDENCE

**A camera caught you. You have three minutes to alter the evidence before Vice
City PD runs forensic analysis on whatever you file.**

Built for the *Build with React Image Editor Challenge* — a GTA VI-inspired
experience where [`@unlayer/react-image-editor`](https://github.com/unlayer/react-image-editor)
is not a feature of the product, it *is* the game mechanic.

---

## The idea

Every crime game punishes you with MISSION FAILED when a camera catches you.
Vice Evidence hands you the photograph instead.

The editor is the entire verb set: crop, draw, filter, redact, plant, falsify.
There is no other way to play. And the game reads the **actual pixels you
submit** — not which buttons you pressed — so what happens next genuinely
derives from what you did to the image.

That creates the central tension:

| | Hides your identity | Still looks authentic |
|---|---|---|
| Solid redaction bar | excellent | terrible — screams tampering |
| Heavy blur | good | mediocre |
| Crop the witness out | total | costs frame integrity |
| Light blur + slight grade | weak | nearly invisible |

Erase everything and you get **EVIDENCE TAMPERING DETECTED**. Touch nothing and
you get **IDENTIFICATION CONFIRMED**. Good play is knowing which evidence
actually matters in *this* case and spending a limited integrity budget there.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:3000. Desktop is the primary experience.

> The editor loads its toolchain from Unlayer's CDN at runtime, so the terminal
> needs network access. Without it you get a diegetic "TERMINAL OFFLINE" state.

## The loop

`boot → case select → the terminal → submit → analysis → verdict → dossier`

A full playthrough is about three minutes. Five cases, four possible outcomes.

## What's actually interesting in here

**`src/lib/forensics/`** — the real forensic engine. The library exposes no
per-edit events, so scoring cannot be a tally of tool clicks. Instead the
submitted PNG is compared against the original:

- `analyze.ts` — per-region legibility from gradient-energy ratio, similarity
  and variance collapse; plus whole-frame tamper signals (introduced
  axis-aligned hard edges, flat fills, foreign detail, exposure drift).
- `align.ts` — crop/resize recovery. A cropped submission is matched back onto
  the original by a coarse scale/offset search scored with zero-mean normalised
  correlation, so evidence boxes are followed into the new frame (or correctly
  reported as cropped out).
- `score.ts` — every tunable number lives in one `SCORING` object, plus the
  outcome matrix.

**`src/components/editor/editor-config.ts`** — the editor re-skinned entirely
through its own supported surface. Every tool and toolbar action is renamed into
the fiction via `translations`: SCRUB, CUT, BLOCK, PLANT, FAKE, and Save becomes
`COMMIT TO EVIDENCE`. The editor's own DISCARD is wired to its `onCancel` and
wipes the exhibit back to the capture after a confirmation in the submit bar.

**`src/components/editor/useLiveForensics.ts`** — polls `getImage()` while you
edit, so the forensic rail reacts to real pixels as each operation commits.

**`src/components/editor/useToolPanel.ts`** — the editor reports nothing about
its own panels, so this watches them: which tool is open (read from the heading
the editor renders out of our own translation), and whether its work has landed
yet. BLOCK, PAINT, FAKE and PLANT land at once; SCRUB, CUT, FRAME and EDGE are
previews until the panel closes — and the terminal says which, and folds the
case rail away while a panel is open so the exhibit keeps its size.

**`/forensics-check`** (dev only) — a verification harness for the scoring
model. It synthesises edits on canvas — and only edits the editor can actually
produce — then runs them through the real analyser across all five cases and
prints the outcome matrix. Current run: 75 rows, 4/4 outcomes reached, 0
mismatches, 0 unwinnable cases:

| Strategy | Result across the five cases |
|---|---|
| Do nothing | IDENTIFIED ×5 |
| Desaturate the frame | IDENTIFIED ×5 |
| Cover the highest-weight target only | IDENTIFIED ×5 |
| DEFOCUS a quarter | ACCEPTED ×2, INSUFFICIENT ×3 |
| **DEFOCUS half — the window** | **ACCEPTED ×5**, rated B ×5 |
| **DEFOCUS a quarter, then one bar over the heaviest target** | **ACCEPTED ×5**, rated S ×1, A ×3, B ×1 |
| DEFOCUS to maximum | TAMPERING ×5 |
| PIXELATE the frame | TAMPERING ×5 |
| Solid fill over every target | TAMPERING ×5 |
| Busy coloured object over every target | TAMPERING ×5 |

**`/forensics-editor`** (dev only) — the same analyser, driven by the *real*
editor rather than a synthetic stand-in, so the harness above can be checked
against what the tools genuinely do. This exists because the two drifted apart
once: the harness was scoring a blur clipped to each evidence region, which no
tool in the editor can produce.

Half measures fail, crude hiding is caught, careful hiding works — and the
operator rating on the dossier is how the game says the skilled line beats the
one-slider line without a tutorial saying it. Use this
before and after any change to `SCORING` — it caught a calibration bug that had
made the crude strategy the winning one.

## The verdict explains itself

Before any of it, the analysis builds the verdict in public
(`forensic/CaseAssessment`): identification is a sum of per-target shares, so
each share lands on the tally as its pipeline stage reports, and you watch the
number climb towards the 30% line hoping it stops short. Facial recognition
docks the department's reference photograph beside your exhibit and searches
its way to the real match figure.

A run then ends on three beats, each answering a different question:

1. **The title card** (`forensic/OutcomeCard`) — *what happened.* CASE CLOSED,
   NOT ENOUGH TO HOLD YOU, THEY KNOW IT WAS DOCTORED, YOU'VE BEEN IDENTIFIED —
   over your own filed exhibit, in the cold open's type language, with the
   wanted level landing, a stamp, and the operator grade last. Identification
   brings the light bar.
2. **The examiner's notes** (`lib/forensics/debrief.ts`) — *why.* The one
   identifier still carrying the case, with what the examiner read off it
   ("BIX 9Q4"); the single tamper signal that cost the most integrity; and a
   handler's line on the next attempt. Every note is read off the terms that
   decided the score (`integrityCosts`, `contribution`), never a parallel
   heuristic, and every piece of advice is a move the editor can actually make.
3. **The operator rating** (`lib/game/rating.ts`) — *how well.* S to F, from the
   outcome first and integrity second, so a letter can never flatter a failed
   case.

## Evidence assets

Two sets, and the difference is load-bearing:

- **`/public/evidence`** — the exhibit you edit. Real in-game captures,
  normalised by `scripts/prepare-evidence.mjs` (sources kept untouched in
  `/assets/sources`, which sits outside `/public` so it never deploys).
- **`/public/realgameimages`** — the intelligence annex: clean, on-file material,
  never editable. The grainy exhibit is what the police *have*; this is what
  they *compare it against*.

```bash
node scripts/prepare-evidence.mjs      # re-normalise exhibits
node scripts/region-check.mjs VC-001   # verify evidence boxes against real pixels
```

`region-check` draws the declared boxes over the real capture into
`tmp-region-check/` — always use it after changing a region, rather than
estimating coordinates by eye.

## Validate

```bash
npx tsc --noEmit && npm run lint && npm run build
```

Then walk the full loop in the browser. A change that breaks the loop is not
done.

## Docs

- [`CLAUDE.md`](CLAUDE.md) — project instructions, and the **verified** React
  Image Editor API contract (several behaviours here are silent if you get them
  wrong).
- [`docs/CONCEPT.md`](docs/CONCEPT.md) — the full concept.
- [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md) — screens, mission system,
  forensic model.
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — milestones and
  acceptance criteria.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 ·
`@unlayer/react-image-editor`. No state library, no data layer, no auth.

## The case card

The dossier can render the whole run as a single 1200x630 PNG — what the camera
recorded next to what you filed, the verdict, the numbers and the wanted level.
Drawn on canvas in `src/lib/share/case-card.ts`, composed for the 1.91:1 crop
that link previews use, and coloured from the live stylesheet so it can never
drift out of the app's palette.

## Audio

Two layers. The **cues** — contact clicks, the deadline's heartbeat, the stamp,
the siren — are synthesised at runtime in `src/lib/audio/engine.ts`; there are
no sound-effect files. The **music bed** is a real track, streamed from
`/public/audio`, and only fetched once the player turns sound on.

Sound is off until asked for: the AudioContext is not built until a real
gesture, and the preference is restored on the player's first interaction on a
later visit.

### Music credit

*Expedition* by [Alex-Productions](https://onsound.eu/), via
[Chosic](https://www.chosic.com/free-music/all/) —
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).

The licence permits commercial use and **requires** attribution. That credit is
carried here *and in the app*, at the foot of the case dossier — for a web app
the deployed page is the medium the licence is asking about, so a README line
alone does not satisfy it. The track's details are defined once in
`src/lib/audio/music.ts`; swapping the track means editing that object and
nothing else, and clearing its credit fields removes the footer with it.

## Note on imagery

The in-game captures and promotional stills under `/assets/sources`,
`/public/realgameimages` and `/public/evidence` are Rockstar Games material,
included here for a fan contest entry. They are not covered by this project's
licence.
