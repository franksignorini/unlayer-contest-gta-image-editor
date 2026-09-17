# VICE EVIDENCE — Concept

## The contest

**Build with React Image Editor Challenge.** Build an original GTA VI-inspired
experience you'd love to see in the game, powered by React Image Editor. Judged
on creativity, visual execution, use of React Image Editor, and overall
experience. The editor must be a core part of the experience, not a secondary
feature.

## The idea in one line

Every crime game punishes you with MISSION FAILED when a camera catches you.
**Vice Evidence gives you the photograph instead** — and three minutes to doctor
it before the police forensics pipeline runs.

## Why this concept fits the contest

Most entries will place an editor inside a themed page. Here the editor *is* the
verb set of the game. There is no other way to play. Blurring a face is not a
feature demo — it is the move that decides whether you walk.

Three things make the integration more than decorative:

1. **Editing is the only input.** The player's entire agency is expressed through
   crop, draw, filter, text, shapes, stickers and frame. Remove the editor and
   there is no game left.
2. **The game reads the actual pixels.** Scoring is not a tally of which buttons
   were pressed — the library exposes no such events. The submitted PNG is
   compared against the original: surviving detail per evidence region, injected
   hard edges, flat fills, foreign content, histogram drift, lost frame. The
   consequence genuinely derives from the edit.
3. **The editor is re-skinned into the fiction.** Every tool and toolbar action
   is renamed through the library's own translation layer — SCRUB, REDACT,
   FALSIFY, IMPLANT — and the whole thing is framed as a seized forensic
   terminal. It reads as proprietary Vice City software, not an embedded widget.

## Core fantasy

You are not a hacker in a hoodie. You are somebody sweating in a back room at
2am with a stolen surveillance still, a photo tool, and a deadline. You are not
trying to make a *good* picture. You are trying to make a picture that survives
a hostile examiner.

## Player role

A criminal with access to the evidence intake queue, working against an
automated analysis job you cannot stop — only get ahead of.

## Gameplay loop

1. **Cold open.** A VCPD forensics terminal boots. Case number, camera ID, a
   countdown to automated analysis.
2. **The crime.** A case briefing: what you did, where, and what the camera got.
3. **Evidence intake.** The surveillance still loads into the terminal. An
   evidence manifest lists exactly what is incriminating and how legible each
   item currently is — face 100%, plate 100%, witness 100%.
4. **Alter the evidence.** The editor. Live forensic meters react as each
   operation commits. A modification log records what the system noticed.
5. **Submit.** The interface violently becomes the police side of the same
   software.
6. **Analysis.** A staged forensic pipeline runs over the image you actually
   submitted, with a scan sweep across it.
7. **Verdict.** A forensic report with counted-up values, a case status, and a
   wanted level.
8. **Dossier.** A shareable case card. Compare original against your forgery.
   Retry, or take another case.

## Evidence manipulation mechanics

The strategic core is a **tension between two failure modes**:

| | Keeps identity hidden | Looks authentic |
|---|---|---|
| Solid redaction bar | excellent | terrible — screams tampering |
| Heavy blur | good | mediocre |
| Crop the witness out | total | costs frame integrity |
| Brightness/contrast crush | partial | detectable histogram drift |
| Stickers over a face | good | foreign content, obvious |
| Light blur + slight grade | weak | nearly invisible |

There is no dominant strategy. Erasing everything guarantees TAMPERING
DETECTED; a delicate touch leaves you identifiable. Good play is knowing which
evidence actually matters in *this* case and spending your integrity budget
there.

Per-case weighting makes that judgement real. In the bank job the suspect is
already masked — the face is worthless to the police and the forearm tattoo is
the case. A player who blurs the mask has wasted their integrity.

## The forensic system

Deterministic, no AI, no network. Runs in-browser on canvas pixels.

- **Legibility per region** — gradient energy ratio against the original
  (surviving identifying texture), structural similarity, and uniformity.
- **Alignment recovery** — a coarse scale/offset search means a cropped or
  resized submission is still mapped back onto the original's evidence boxes, or
  the region is correctly reported as cropped out of frame.
- **Tamper signals** — introduced axis-aligned hard edges, zero-variance blocks,
  added foreign detail, global histogram shift, frame loss.
- **Identification** — weighted legibility across the case's evidence targets.
- **Suspicion** — how loudly the image announces it was worked on.

## Possible outcomes

Four, from two roughly independent axes (how identifiable you are, how obviously
the file was altered):

- **EVIDENCE ACCEPTED** — no actionable evidence, and nothing looks wrong. Case
  closed, wanted level unchanged. The perfect crime.
- **INSUFFICIENT EVIDENCE** — can't establish probable cause. Case suspended,
  wanted level +1.
- **EVIDENCE TAMPERING DETECTED** — they can't identify you from it, but they can
  see you touched it. Case escalated, wanted level +2.
- **IDENTIFICATION CONFIRMED** — you made it worse. Forensic confidence 90%+,
  and the wanted level jumps far enough to put the sixth star in play. The
  memorable failure.

## Mission examples

| Case | Crime | Evidence in frame |
|---|---|---|
| VC-001 | Gilded Palm Jewelers heist | face, weapon, getaway plate, downed guard |
| VC-002 | Ocean Dr hit & run | driver's face, plate, vehicle, victim, witness, street sign |
| VC-003 | Vice Point Marina robbery | face, vessel registration, duffel, dock witness |
| VC-004 | Club Flamingo shooting | face, weapon, bystander, a second camera in frame |
| VC-005 | Pacific Union Bank job | forearm tattoo, van plate, teller, cash bag (face already masked) |

Each has a different weighting profile, so the same tactic does not clear all
five.

## Visual direction

An original identity inspired by the world, not a copy of GTA's UI.

- **Palette** — near-black slate, evidence-tape amber, vice magenta, terminal
  cyan, hazard red, bone text.
- **Type** — condensed uppercase for labels and headings, monospace for every
  number and readout.
- **Texture** — scanlines, film grain, CRT vignette, chromatic aberration on
  transitions, dashed evidence-tape borders, rotated rubber stamps, redaction
  bars, perforated dossier edges.
- **Composition** — the image dominates; UI is equipment bolted around it.

Two distinct image sets, and the contrast between them is the point. The
**exhibit** — the thing the player edits — is a real in-game capture, normalised
to a working size by `scripts/prepare-evidence.mjs`. The **intelligence annex**
is clean, high-fidelity material the department already holds: never editable,
shown beside the exhibit at case select, during the facial-recognition pass, and
again on a confirmed match.

That pairing is what gives the threat teeth. The grainy exhibit is what the
police *have*; the annex is what they will *compare it against*. Leaving a face
legible is only dangerous because a reference photograph exists. Everything is
served locally — no remote image URLs.

## WOW moments

1. **The enhance.** Mid-analysis the pipeline stops reporting percentages and
   magnifies the evidence region out of the player's own submitted PNG, at
   native pixels, ~10x, with the lattice showing. The recovery filters resolve
   it, and either the plate reads back — `PLATE RECOVERED · BIX 9Q4`, typed
   out a character at a time — or it says NO RECOVERABLE DETAIL. Nothing is
   faked: the magnification is the player's pixels, and the read is gated on the
   same legibility the score is gated on. It is the moment the game stops
   claiming it read the image and shows it.
2. **Live forensic meters.** The face legibility number visibly drops the moment
   the blur commits. The system is watching.
3. **The turn.** SUBMIT EVIDENCE tears the criminal terminal apart and reassembles
   it as VCPD Forensic Analysis. Same software, other side of the law.
4. **The scan.** The analysis sweep runs over *your* doctored image, calling out
   the regions it is examining.
5. **"YOU MADE IT WORSE."** The catastrophic ending, delivered straight.
6. **The comparison.** Original versus forgery, side by side, in the dossier —
   and downloadable as a single case-file PNG, so the run leaves the browser
   instead of dying in a tab.
7. **Putting out the lights.** The identification strip above the exhibit shows
   what the police can still place you by — plate, face, associate, weapon,
   vehicle — and each chip visibly goes out as you work that target down. You
   are not improving a photograph, you are extinguishing identifiers one at a
   time, and you can see exactly how many are left.
8. **The record.** Five cases stop being five unrelated runs. What the
   department holds survives the tab closing, and because the wanted level is
   derived from that record rather than accumulated, going back and filing a
   case better visibly takes stars *off*. The last case on file triggers a
   final standing.
9. **The room.** A synth bed under the whole terminal that comes into focus as
   the clock runs down — the filter opens, the level lifts — while the deadline
   goes silence, then a tick, then a heartbeat, then a heartbeat you can feel.
   Every cue on top of it is synthesised at runtime. Off until asked for,
   because a game that makes noise at someone unprompted gets closed.

## Future possibilities

Scoped and parked in [BACKLOG.md](./BACKLOG.md), with the reason each one is not
being built now.
