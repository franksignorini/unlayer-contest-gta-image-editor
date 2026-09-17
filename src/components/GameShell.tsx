"use client";

/**
 * The shell.
 *
 * Owns the reducer and decides which screen is on. Screens never navigate
 * themselves — they dispatch — so the dramatic ordering of the whole experience
 * is readable in one place.
 */

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { EvidenceModification, ForensicResult, Submission } from "@/types";
import { getMission } from "@/data/missions";
import { gameReducer, initialState, nextCaseId } from "@/lib/game/state";
import {
  clearRapSheet,
  loadRapSheet,
  saveRapSheet,
} from "@/lib/game/rap-sheet";
import { useRestoreSound, useSoundEnabled } from "@/components/audio/SoundToggle";
import { audio } from "@/lib/audio/engine";
import { MUSIC } from "@/lib/audio/music";
import { IntroSequence, forgetIntro } from "@/components/intro/IntroSequence";
import { BootSequence } from "@/components/boot/BootSequence";
import { CaseBriefing } from "@/components/case/CaseBriefing";
import { EvidenceTerminal } from "@/components/editor/EvidenceTerminal";
import { AnalysisSequence } from "@/components/forensic/AnalysisSequence";
import { VerdictReport } from "@/components/forensic/VerdictReport";
import { CaseDossier } from "@/components/forensic/CaseDossier";

export function GameShell() {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const mission = getMission(state.missionId);

  // Sound is off until asked for, but a player who asked last time gets it
  // back on their first click rather than having to find the switch again.
  useRestoreSound();

  // The bed runs across every screen, so it is owned here rather than by any
  // one of them — a track that restarted at each phase change would announce
  // the phase change, which is exactly what it must not do. The file is only
  // fetched once sound is actually on.
  const soundOn = useSoundEnabled();
  useEffect(() => {
    if (soundOn) audio.startMusic(MUSIC.src);
    else audio.pauseMusic();
  }, [soundOn]);

  // Stable: IntroSequence completes from an effect, so a new identity each
  // render would re-run its first-visit check.
  const handleIntroComplete = useCallback(() => {
    dispatch({ type: "intro-complete" });
  }, []);

  // Clearing the flag first is what lets the remounted sequence play: it reads
  // storage on mount and would otherwise skip straight back to the terminal.
  const handleReplayIntro = useCallback(() => {
    forgetIntro();
    dispatch({ type: "replay-intro" });
  }, []);

  const handleLiveResult = useCallback(
    (result: ForensicResult, added: EvidenceModification[]) => {
      dispatch({ type: "live-analysis", result, added });
    },
    []
  );

  const handleWiped = useCallback(() => {
    dispatch({ type: "exhibit-wiped" });
  }, []);

  const handleDirty = useCallback((dirty: boolean) => {
    dispatch({ type: "set-dirty", dirty });
  }, []);

  // Stable: the cold open's auto-start effect depends on this, and a fresh
  // identity each render would tear its listeners down and rebuild them.
  const handleBootComplete = useCallback(() => {
    dispatch({ type: "boot-complete" });
  }, []);

  const handleSubmit = useCallback((submission: Submission) => {
    dispatch({ type: "submit", submission });
  }, []);

  const handleAnalysisComplete = useCallback((result: ForensicResult) => {
    dispatch({ type: "analysis-complete", result });
  }, []);

  const handleClearRecord = useCallback(() => {
    clearRapSheet();
    dispatch({ type: "clear-record" });
  }, []);

  // Restore the record on mount, not during render: localStorage does not
  // exist on the server, and the first client paint has to match the markup
  // that was sent. The reducer refuses a hydrate once a case is under way.
  useEffect(() => {
    const records = loadRapSheet();
    if (Object.keys(records).length) dispatch({ type: "hydrate", records });
  }, []);

  // Written back whenever the record changes. Cheap — five entries at most, and
  // only ever on a filing or a wipe.
  const records = state.records;
  const hydrated = useRef(false);
  useEffect(() => {
    // Skip the very first pass so an empty initial state cannot clobber a
    // stored record before the hydrate above has had a chance to land.
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    saveRapSheet(records);
  }, [records]);

  switch (state.phase) {
    case "intro":
      return (
        <IntroSequence onComplete={handleIntroComplete} />
      );

    case "boot":
      return (
        <BootSequence
          onEnter={handleBootComplete}
          onReplayIntro={handleReplayIntro}
        />
      );

    case "briefing":
      return (
        <CaseBriefing
          selectedId={state.missionId}
          records={state.records}
          wantedLevel={state.wantedLevel}
          onClearRecord={handleClearRecord}
          onSelect={(missionId) => dispatch({ type: "select-case", missionId })}
          onOpen={(missionId) =>
            dispatch({ type: "open-case", missionId, at: Date.now() })
          }
        />
      );

    case "terminal":
      if (!mission) return null;
      return (
        // Keyed by mission so switching cases gives a genuinely fresh terminal
        // (and a fresh editor mount) rather than a reused one.
        <EvidenceTerminal
          key={`${mission.id}-${state.caseOpenedAt}`}
          mission={mission}
          openedAt={state.caseOpenedAt}
          live={state.live}
          modifications={state.modifications}
          dirty={state.dirty}
          onLiveResult={handleLiveResult}
          onDirtyChange={handleDirty}
          onWiped={handleWiped}
          onSubmit={handleSubmit}
        />
      );

    case "analysis":
      if (!mission || !state.submission) return null;
      return (
        <AnalysisSequence
          mission={mission}
          submission={state.submission}
          onComplete={handleAnalysisComplete}
        />
      );

    case "verdict":
      if (!mission || !state.submission || !state.result) return null;
      return (
        <VerdictReport
          mission={mission}
          submission={state.submission}
          result={state.result}
          wantedLevel={state.wantedLevel}
          onContinue={() => dispatch({ type: "view-dossier" })}
        />
      );

    case "dossier":
      if (!mission || !state.submission || !state.result) return null;
      return (
        <CaseDossier
          mission={mission}
          submission={state.submission}
          result={state.result}
          wantedLevel={state.wantedLevel}
          records={state.records}
          onRetry={() => dispatch({ type: "retry" })}
          nextCaseId={nextCaseId(state)}
          onAnotherCase={() => {
            dispatch({ type: "select-case", missionId: nextCaseId(state) });
            dispatch({ type: "back-to-briefing" });
          }}
        />
      );
  }
}
