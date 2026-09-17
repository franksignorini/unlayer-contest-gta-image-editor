# VICE EVIDENCE — Implementation Plan

Milestones are ordered so the app is runnable at the end of each one. Every
milestone ends with `npx tsc --noEmit && npm run build` passing.

---

## M0 — Environment & research ✅

Inspect the repo, pin down the real React Image Editor API.

**Done when**
- [x] `@unlayer/react-image-editor@1.0.2` installed; API verified against the
      shipped `.d.ts` and the live CDN bundle, not assumed.
- [x] Contract recorded in `CLAUDE.md`: CDN embed, `getImage()` nullability,
      commit-on-panel-close behaviour, remount-on-options-change, 7-char tool
      labels, `.image-editor-root` styling hook.
- [x] Next 16 breaking changes reviewed (`ssr: false` is client-component only).

## M1 — Evidence assets ✅

Five exhibits from real in-game captures, served locally, no remote URLs.

An earlier pass generated stylised CCTV scenes with a bespoke software
rasteriser. Those were replaced with real captures, which are far more striking
and sit better against the intelligence-annex material. The rasteriser survives
as the dev-only tooling below.

**Done when**
- [x] `scripts/raster.mjs` + `scripts/png-decode.mjs` — zero-dependency PNG
      decode/encode and a small raster surface, including a 5x7 bitmap font.
- [x] `scripts/prepare-evidence.mjs` — normalises the chosen captures from
      `/assets/sources` into `/public/evidence`, capped at 1440px wide so
      the editor's per-poll re-encode stays cheap. Sources untouched.
- [x] `scripts/region-check.mjs` — draws declared evidence boxes over the real
      capture into `tmp-region-check/`, so regions are verified against actual
      pixels rather than estimated by eye.
- [x] Each exhibit has 4+ separated, verified evidence regions.
- [x] Intelligence-annex references wired per case from `/public/realgameimages`.

## M2 — Documentation ✅

- [x] `CLAUDE.md`, `docs/CONCEPT.md`, `docs/PRODUCT_SPEC.md`, this plan.

---

## M3 — Design system

The visual identity, before any screen is built.

**Scope**
- `src/app/globals.css`: Tailwind v4 theme tokens (palette, type scale,
  spacing), plus an effects layer — scanlines, grain, CRT vignette, glitch
  keyframes, tape borders, stamp treatment — all `prefers-reduced-motion` aware.
- Fonts via `next/font`: a condensed display face for labels, a monospace for
  every readout.
- `src/components/ui/`: `Panel`, `Readout`, `Meter`, `Stamp`, `Button`,
  `ScanOverlay`, `GlitchText`.

**Acceptance**
- A tokens/primitives preview renders with zero SaaS-dashboard smell.
- No component hardcodes a hex value.
- Reduced-motion kills every animated effect.

## M4 — Types, mission data, phase machine

**Scope**
- `src/types/index.ts` — `Mission`, `EvidenceTarget`, `PixelRect`,
  `ForensicResult`, `EvidenceModification`, `GamePhase`, `Outcome`.
- `src/data/missions.ts` — five missions, regions transcribed from
  `regions.json`, per-case weights and tool sets, briefing and closing copy.
- `src/lib/game/state.ts` — reducer + action types for the phase machine.

**Acceptance**
- Adding a sixth case would require touching only `missions.ts`.
- `mask`-kind targets carry near-zero weight (bank job forces the tattoo read).
- Reducer transitions are exhaustively typed; illegal transitions unrepresentable.

## M5 — Forensic engine

The technical centrepiece. Built and testable before the UI depends on it.

**Scope**
- `src/lib/forensics/image.ts` — load to canvas, downsample, grayscale, patch
  extraction, gradient/variance helpers.
- `src/lib/forensics/align.ts` — coarse scale/offset crop recovery + refinement.
- `src/lib/forensics/analyze.ts` — per-target legibility, tamper signals,
  aggregates. Exports `analyze()` and a cheaper `analyzeFast()` for live polling.
- `src/lib/forensics/score.ts` — `SCORING` constants, outcome matrix, wanted
  level, modification-delta derivation.

**Acceptance** — verified by the harness at `/forensics-check` (dev only), which
synthesises edits on canvas and runs them through the real analyser across all
five cases. Current run: **40 rows, 4/4 outcomes reached, 0 mismatches.**

| Scenario | Outcome across VC-001…005 |
|---|---|
| untouched | IDENTIFIED ×5 |
| blur only the highest-weight target | IDENTIFIED ×5 |
| blur every target (moderate) | ACCEPTED ×2, INSUFFICIENT ×3 |
| blur every target (heavy) | ACCEPTED ×5 |
| solid fill over every target | TAMPERING ×5 |
| whole-frame defocus | INSUFFICIENT ×4, IDENTIFIED ×1 |
| blown exposure | IDENTIFIED ×5 |
| centre crop to 60% | IDENTIFIED ×4, TAMPERING ×1 |

- [x] No dominant strategy: crude hiding is punished, careful hiding rewarded,
      half measures fail.
- [x] Crop/resize recovered; frame loss reported; regions followed or reported
      cropped out.
- [x] Analysis completes in ~70–500ms at full resolution; the live poll runs at
      a smaller working size.
- [x] All tuning constants in one exported `SCORING` object.

**What the harness caught.** The first run scored a solid bar over every target
at 75–95% integrity — because crudeness was measured as a fraction of the *whole
frame*, and evidence regions are tiny. The crude strategy was winning, which
inverted the entire game. Crudeness is now measured over the edited area only.

## M6 — Editor integration

**Scope**
- `src/components/editor/ImageEditorFrame.tsx` — client-only mount via
  `next/dynamic`, memoised options, translation map, ref plumbing, `onSave` →
  submit, `onLoadError`/`onError` handling, and a themed loading state for the
  CDN fetch.
- Scoped `.image-editor-root` skin in `globals.css`.

**Acceptance**
- Editor mounts once and never remounts while editing (verified by a mount
  counter in dev).
- Every tool and toolbar action reads in-fiction; no label truncated.
- Killing the CDN shows a diegetic error, not a blank frame.
- Editor remains fully usable with the override stylesheet removed.

## M7 — Terminal screen

**Scope**
- `EvidenceTerminal` composing case rail, editor, forensic rail, countdown, submit.
- `useLiveForensics` hook: poll `getImage()`, skip unchanged, run `analyzeFast()`,
  emit modifications.
- Countdown with hazard state and auto-submit at zero.

**Acceptance**
- Meters visibly move within one poll of an operation committing.
- Pending edits show `UNCOMMITTED`, never a wrong number.
- Modification log entries correspond to what was actually done.
- Editing stays smooth while analysis runs.
- Timer expiry submits current state.

## M8 — Analysis sequence

**Scope**
- Staged pipeline animation over the submitted image, region brackets, scan
  sweep, glitch handover from criminal chrome to VCPD chrome.

**Acceptance**
- Stages report real analysed values.
- ~6s, skippable after 1s.
- Reduced motion → stages resolve immediately without the sweep.

## M9 — Verdict & dossier

**Scope**
- `VerdictReport` — counted readouts, outcome banner, wanted stars.
- `CaseFileCard` — shareable card, original vs submitted comparison, retry /
  next case.

**Acceptance**
- All four outcomes reachable and visually distinct.
- Numbers match the analysis result exactly.
- Retry restores a clean original; next case returns to briefing.

## M10 — Boot & briefing

**Scope**
- Cold-open boot sequence, skippable.
- Case select with evidence manifest preview and per-target threat notes.

**Acceptance**
- Concept is legible within ~5 seconds of first paint.
- A first-time player knows what to do without instructions.

---

## M11 — Polish passes

Run in order; each is a separate sweep over the whole app.

1. **Works** — full loop end to end, no console errors.
2. **UX** — affordances, empty/pending/error states, keyboard paths.
3. **Visual hierarchy** — the image dominates; rails read as equipment.
4. **Motion** — transitions intentional and cinematic, never decorative.
5. **Typography & composition** — spacing rhythm, tabular numerals, alignment.
6. **De-genericise** — hunt and remove any residual dashboard patterns.
7. **Details** — stamps, tape, log flicker, hover states, cursor treatment.
8. **Loop test** — repeated playthroughs across all five cases and all four
   outcomes.

## M12 — Responsive pass

Breakpoints per spec §7. Editor keeps a hard minimum height at every width.

## M13 — Final QA

- [ ] `npx tsc --noEmit`, `npm run build`, `npm run lint` all clean.
- [ ] Full loop on all five cases; all four outcomes observed.
- [ ] Reduced-motion pass.
- [ ] No remote image dependencies; only the editor's own CDN is external.
- [ ] Editor is unmistakably central; loop demonstrable in 2–4 minutes.
- [ ] `README.md` covers run, regenerate, and where the interesting code is.

---

## Risk register

| Risk | Mitigation |
|---|---|
| CDN embed unavailable offline | Diegetic error state; documented as a known runtime dependency |
| Editor remount wipes player work | Memoised options; fixed tool set per case; dev mount counter |
| `getImage()` returns null early | Guarded everywhere; poll tolerates null |
| Pending-preview edits not in `getImage()` | Surfaced as `UNCOMMITTED` rather than mis-scored |
| Live analysis jank | Downsampled, throttled, unchanged-URL short-circuit |
| Library CSS override drift | Overrides additive and scoped; dark theme is the fallback |
| Scoring feels arbitrary | Single `SCORING` object; outcomes hand-verified against fixtures |
