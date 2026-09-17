"use client";

/**
 * The case rail, folded.
 *
 * Shown in place of the rail while a tool panel is open — see the focus layout
 * note in `EvidenceTerminal`. It has to read as the same piece of equipment
 * with its lid shut, not as a missing column: same panel surface, the case
 * number in the rail's own magenta, and the rail's name running down the spine
 * so there is no doubt what a click brings back.
 */

import type { Mission } from "@/types";

export function RailSpine({
  mission,
  onOpen,
}: {
  mission: Mission;
  onOpen(): void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Show the case file, evidence manifest and tool notes"
      aria-label="Show the case rail"
      className="u-rise group absolute inset-0 hidden cursor-pointer flex-col items-center gap-3 border border-line bg-panel/70 py-2.5 transition-colors hover:border-magenta/50 hover:bg-panel-2 lg:flex"
    >
      <span className="font-mono text-[11px] leading-none text-faint transition-colors group-hover:text-magenta">
        ›
      </span>
      <span className="u-label rotate-180 text-[9px] whitespace-nowrap text-magenta [writing-mode:vertical-rl]">
        {mission.id}
      </span>
      <span className="h-6 w-px bg-line" />
      <span className="u-label rotate-180 text-[9px] whitespace-nowrap text-faint transition-colors [writing-mode:vertical-rl] group-hover:text-dim">
        CASE FILE · MANIFEST · TOOLS
      </span>
    </button>
  );
}
