# VICE EVIDENCE — Product Spec

## 1. Summary

A single-page, five-phase interactive experience. The player receives a
surveillance photograph of a crime they committed, manipulates it in React Image
Editor, submits it, and watches a forensic pipeline judge the result. Outcome is
derived from the actual submitted pixels.

Target run time for a full loop: **2–4 minutes.** Desktop first.

## 2. Phase machine

```
boot ──▶ briefing ──▶ terminal ──▶ analysis ──▶ verdict ──▶ dossier
             ▲                                                │
             └────────────────── next case / retry ────────────┘
```

| Phase | Screen | Exit condition |
|---|---|---|
| `boot` | Cold-open terminal boot | ENTER CASE, or auto after boot lines finish |
| `briefing` | Case select + crime dossier | case chosen → OPEN CASE FILE |
| `terminal` | The editor. Countdown running. | SUBMIT EVIDENCE, editor Save, or timer expiry |
| `analysis` | Forensic pipeline over the submission | pipeline stages complete |
| `verdict` | Forensic report + outcome + wanted level | VIEW CASE FILE |
| `dossier` | Shareable card, original vs forgery | retry / next case → `briefing` |

State lives in one reducer (`lib/game/state.ts`). Phase transitions are the only
way screens change; no screen navigates itself.

## 3. Screens

### 3.1 Boot (cold open)

Not a marketing landing page. A terminal coming up.

- Typed boot lines: system banner, evidence bus, case acquisition.
- `VICE CITY POLICE DEPARTMENT / DIGITAL FORENSICS UNIT`, case number.
- The hook, stated plainly: `EVIDENCE ACQUIRED. YOU HAVE 03:00 TO ALTER THE
  EVIDENCE BEFORE AUTOMATED ANALYSIS.`
- Single action: `ALTER THE EVIDENCE →`
- Skippable on any key/click for repeat viewings.

### 3.2 Briefing / case select

- Five case slugs as evidence folders: case ID, crime, location, camera, a
  thumbnail of the still, and the evidence manifest preview.
- Selecting one shows the crime narrative and a `THREAT` read on each evidence
  item — this is where the player learns *what matters in this case*.
- Action: `OPEN CASE FILE`.

### 3.3 Terminal — the centrepiece

The image dominates. Everything else is equipment.

```
┌─ CASE RAIL ────┐┌──────────── EVIDENCE ────────────┐┌─ FORENSIC RAIL ─┐
│ CASE #VC-001   ││                                  ││ INTEGRITY  ███  │
│ CAM-04         ││                                  ││                 │
│ 23:14:07       ││      REACT IMAGE EDITOR          ││ FACE       100% │
│ LOCATION       ││      (toolbar + tool rail        ││ PLATE      100% │
│                ││       + canvas)                  ││ WITNESS    100% │
│ EVIDENCE       ││                                  ││ WEAPON     100% │
│ MANIFEST       ││                                  ││                 │
│  ▸ FACE        ││                                  ││ MOD LOG         │
│  ▸ PLATE       │└──────────────────────────────────┘│  > ...          │
│  ▸ WITNESS     │┌─ T-02:41 ──────── [SUBMIT EVIDENCE]─────────────────┐
└────────────────┘└─────────────────────────────────────────────────────┘
```

- **Countdown** — 3:00. Under 30s the terminal goes hazard-red and jitters. At
  zero the evidence auto-submits in whatever state it is in.
- **Live forensic rail** — per-region legibility and a global integrity gauge,
  recomputed from real pixels as operations commit. Numbers animate to their new
  value; a drop flashes.
- **Modification log** — append-only ticker of what the system detected
  (`REGION SUSPECT FACE · DETAIL -62%`, `HARD EDGE INTRODUCED`).
- **Pending state** — while a tool panel is open, `hasChanges()` is true but the
  canvas has not flattened; the rail shows `UNCOMMITTED` rather than lying.
- **Submit** — the terminal's own control, and the editor's Save button, both
  submit.

### 3.4 Analysis

Full-screen takeover. The criminal terminal glitches out; VCPD chrome arrives.

- Staged pipeline, each stage with its own progress and a terse verb:
  `ACQUIRING EVIDENCE`, `IMAGE INTEGRITY`, `FACIAL RECOGNITION`,
  `VEHICLE DATABASE`, `PIXEL ANOMALY`, `SURVEILLANCE NETWORK`.
- The submitted image sits behind a scan sweep; the region currently under
  examination is bracketed.
- Stages resolve to real values from the analysis result, so the theatre is
  telling the truth.
- Duration ~6s, skippable after the first second.

### 3.5 Verdict

- Forensic report: per-target identification percentages, image integrity,
  suspicion, all counting up from zero.
- Outcome banner — one of four, with its case status.
- Wanted level as stars, animating in.
- Action: `VIEW CASE FILE`.

### 3.6 Dossier

- The shareable case card: case number, tampering result, forensic score, wanted
  level, a closing line.
- Original vs submitted comparison.
- Actions: `RETRY THIS CASE`, `ANOTHER CASE`.

## 4. Mission system

A mission is data (`src/data/missions.ts`):

```ts
interface Mission {
  id: string;                    // 'VC-001'
  slug: string;                  // 'case-001' — matches the generated still
  title: string;
  crime: string;
  location: string;
  cameraId: string;
  timestamp: string;
  image: string;                 // '/evidence/case-001.png'
  imageSize: { width: number; height: number };
  briefing: string;              // narrative shown at case select
  closingLine: string;           // dossier flavour
  targets: EvidenceTarget[];
  tools?: Partial<Record<EditorTool, boolean>>;  // per-case tool availability
  timeLimitSeconds?: number;
}

interface EvidenceTarget {
  id: string;
  label: string;                 // 'SUSPECT FACE'
  short: string;                 // 'FACE' — for the rail
  kind: 'face' | 'plate' | 'witness' | 'weapon' | 'vehicle'
      | 'mark' | 'object' | 'location' | 'mask';
  weight: number;                // contribution to identification, 0..1
  region: PixelRect;             // in source-image pixel space
  note: string;                  // why it matters, shown in the briefing
}
```

Regions are pixel boxes in the **normalised** exhibit, verified with
`node scripts/region-check.mjs <caseId>`, which draws the declared boxes over the
real capture so they can be checked against actual pixels rather than estimated.

Weights are what make cases play differently: a low-weight target is one the
police cannot build a case on, so integrity spent hiding it is integrity wasted.
Each mission also carries two `references` — the clean, on-file material shown in
the intelligence annex. These are never editable.

## 5. Evidence / forensic model

### 5.1 Inputs

Original image pixels, submitted image pixels, mission targets.

### 5.2 Alignment

If the submission's dimensions differ from the original, the player cropped or
resized. A coarse search over scale and offset (then a refinement pass) recovers
the crop rectangle in original coordinates, so target boxes can be followed into
the new frame. Targets that fall outside the recovered rectangle are reported as
`CROPPED OUT` — fully hidden, at a frame-integrity cost.

### 5.3 Per-target legibility

For each target, patches from both images are resampled to a fixed size and
compared:

- `detailRatio` — mean gradient magnitude of the submitted patch over the
  original's. Blur, pixelation and solid fills all collapse this.
- `similarity` — 1 − normalised mean absolute difference.
- `uniformity` — variance collapse, which identifies solid redaction.

```
legibility = 100 · clamp01(0.8 · detailRatio + 0.2 · similarity)
```

Untouched ≈ 100. Heavy blur ≈ 30. Solid bar ≈ 3. Cropped out = 0.

### 5.4 Tamper signals

- `hardEdges` — axis-aligned high-contrast edges present in the submission but
  not the original. The redaction-rectangle detector.
- `flatBlocks` — blocks whose variance collapsed to near zero.
- `foreignDetail` — blocks with materially *more* detail than the original
  (stickers, text, drawn shapes).
- `histogramShift` — global luminance mean/spread drift (brightness, contrast,
  filters).
- `frameLoss` — proportion of the original frame no longer present.

### 5.5 Aggregates

```
identification = Σ(weightᵢ · legibilityᵢ) / Σ(weightᵢ)
integrity      = 100 − weighted tamper penalties
suspicion      = f(100 − integrity, alteredFraction)
```

All weights live in one exported `SCORING` object so the model can be retuned
without touching components.

### 5.6 Outcome matrix

| identification | integrity | Outcome |
|---|---|---|
| low | high | `ACCEPTED` — case closed, wanted +0 |
| low | low | `TAMPERING` — case escalated, wanted +2 |
| mid | any | `INSUFFICIENT` — case suspended, wanted +1 |
| high | any | `IDENTIFIED` — confirmed, wanted +5 (catastrophic) |

Thresholds are constants, not magic numbers in a component.

### 5.7 Modification tracking

The terminal polls `getImage()`; when the data URL changes, a fast analysis runs
and the delta against the previous snapshot is turned into log entries. This is
how the game "knows what the player did" without any editor event API.

```ts
interface EvidenceModification {
  id: string;
  at: number;              // ms since case opened
  kind: 'detail-loss' | 'redaction' | 'foreign-content'
      | 'exposure' | 'reframe';
  targetId?: string;
  label: string;           // 'REGION SUSPECT FACE · DETAIL -62%'
  impact: number;          // signed integrity delta
}
```

## 6. React Image Editor integration

- Mounted client-only inside a bespoke terminal bezel.
- `theme: 'dark'`, `offline: true` (no account, no AI calls).
- Options object memoised; tool set fixed per case before mount.
- **Renamed through `translations`** so the editor speaks the fiction. Labels
  respect the ~7-character tool-rail limit:

| Tool | Renamed | Meaning in fiction |
|---|---|---|
| `filter` | `DEGRADE` → shown as `SCRUB` | wash out detail |
| `crop` | `EXCISE` | remove evidence from frame |
| `resize` | `REFRAME` | change the frame |
| `draw` | `OBSCURE` | paint over evidence |
| `text` | `FALSIFY` | fake timestamps and markers |
| `shapes` | `REDACT` | hard cover |
| `stickers` | `IMPLANT` | plant fake objects |
| `frame` | `MASK` | edge treatment |

  Toolbar: Save → `COMMIT TO EVIDENCE`, Cancel → `DISCARD`, undo/redo →
  `REVERT`/`REAPPLY`.
- CSS overrides scoped under `.image-editor-root`, additive only. The editor must
  remain fully usable if every override stops matching.

## 7. Responsiveness

Desktop primary; laptop and tablet must not break.

- ≥1440px: three-column terminal as drawn above.
- 1024–1440px: rails narrow; manifest notes collapse to labels.
- 768–1024px: rails move below the editor as a two-column strip; the editor keeps
  full width and a minimum height.
- <768px: single column, stacked, with a notice that the terminal is intended for
  a larger display. The loop still completes.

The editor is given a hard minimum height so its tool rail is never crushed.

## 8. Accessibility and motion

- `prefers-reduced-motion` disables glitch transitions, scan sweeps and counters
  (values appear immediately).
- All controls are real buttons, keyboard reachable, with visible focus.
- Colour is never the only carrier of state — status always has a text label.
- Numeric readouts use tabular monospace so they don't jitter while animating.

## 9. Out of scope for the prototype

Auth, persistence, server-side anything, real ML forensics, audio, downloadable
share images, mobile-first layout.
