# VICE EVIDENCE — Backlog

Deliberately deferred. Everything here was considered, scoped and parked so the
remaining time goes into the handful of moments a judge actually remembers.

The rule that decides what gets built: **does it make the player feel like they
are manipulating criminal evidence, in a way they will still be describing to
someone tomorrow?** Breadth loses. One unforgettable minute wins.

---

## Blocked on someone else

### THE FIXER — Unlayer's AI Assistant, re-skinned
The single biggest available win on *"use of React Image Editor"*, because the
contest is run by Unlayer and the AI Assistant is their flagship feature. It
would appear as a burner-phone contact who takes instructions in criminal
language — *"burn the plate, leave the car, don't touch the kid"* — and edits
the exhibit for you.

`MountOptions` already exposes everything needed: `defaultPrompt`,
`autoSubmitPrompt`, `aiAssistantOpenState`, and `features.ai`.

**Blocker:** requires a `projectId` on a paid plan with the AI Assistant
entitlement, plus a `user.id` — without the user object the assistant stays
hidden and requests are rejected server-side. We currently run
`offline: true, ai: false` in `editor-config.ts`.

**Action:** ask Unlayer for a contest project ID. If it lands, build it behind a
flag with the present offline path as the fallback, so a dead network or an
expired entitlement never breaks a demo.

---

## Deferred — good ideas, wrong week

### The leak — your forgery goes viral
GTA 6's in-game social network (influencers, viral video feed, missions found by
scrolling) is its most-discussed new system. Ending beat: the doctored photo
surfaces in a Vice City feed and NPC comments react to **what the analyser
actually found** — a black rectangle draws *"why is there a censor bar on a cctv
still"*, a clean pass draws *"nothing to see here"*.

Cheap to assemble from `result.findings`, genuinely funny, on-trend. Parked
because it adds a seventh phase to the machine and a whole new visual language
after the verdict has already landed.

### Bonnie & Clyde — you can't save both
The Jason/Lucia dual-protagonist framing is the spine of GTA 6, and VC-001
already has two subjects in frame. A case tuned so the integrity budget cannot
cover both, with the verdict naming who went down because of the choice.

Emotional stakes generated purely by existing scoring maths. Parked because
tuning a case to that knife-edge needs several harness runs, and a case that
misses the balance is just a confusing case.

### The escalating examiner
Difficulty via a sharper analyst rather than a shorter clock — a per-case
multiplier on the detection thresholds in `SCORING`. Better design than shaving
seconds off the deadline. Parked because it invalidates the harness baselines in
`/forensics-check` and every one of those needs re-verifying.

---

## Done since this list was written

- **Custom tool icons** — all eight glyphs in the editor's own rail are now
  ours (`editor/tool-icons.ts`), delivered through the supported `icon` field.
- **The rap sheet** — the record persists across sessions, the wanted level is
  derived from it (so re-filing a case can lower it), and a FINAL STANDING
  lands once all five are on file.
- **Annex compression** — masters moved to `/assets/annex`,
  `scripts/prepare-annex.mjs` normalises them into `/public/realgameimages`.
  12.8MB → 2.5MB, and the briefing's panels now paint with the page.

---

## Rejected

- **Multiplayer** — one player forges, the other examines. A different product.
- **Chained campaign** — cases carrying consequence forward. Needs the rap sheet
  first, and then needs balancing across five cases.
- **A human detective's second opinion** — a character who overrules the
  machine. Lovely, and it undercuts the thing that makes the game legible: that
  the verdict is derived, not authored.
