"use client";

/**
 * The intelligence annex.
 *
 * The clean material already on file. The point of showing it beside a grainy
 * CCTV frame: this is what the department will compare the exhibit against.
 * Leaving a face legible is only dangerous because a reference photograph
 * exists. Never editable — that contrast is the whole reason it is here.
 */

import Image from "next/image";
import type { CaseReference, Mission } from "@/types";
import { Panel } from "@/components/ui/primitives";

export function IntelligenceAnnex({ mission }: { mission: Mission }) {
  return (
    <Panel
      title="INTELLIGENCE ANNEX — HELD ON FILE"
      aside={
        <span className="u-label text-[8.5px] text-ghost">
          NOT ALTERABLE · COMPARISON MATERIAL
        </span>
      }
    >
      <div className="grid gap-3 p-3 md:grid-cols-2">
        {mission.references.map((ref) => (
          <ReferenceCard
            key={ref.code}
            reference={ref}
            matchLabel={
              mission.targets.find((t) => t.id === ref.matchesTargetId)?.label
            }
          />
        ))}
      </div>
    </Panel>
  );
}

function ReferenceCard({
  reference,
  matchLabel,
}: {
  reference: CaseReference;
  matchLabel?: string;
}) {
  return (
    <figure className="group relative border border-line bg-pit">
      <div className="relative aspect-video overflow-hidden">
        <Image
          src={reference.src}
          alt={reference.caption}
          fill
          sizes="(max-width: 768px) 100vw, 520px"
          className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
        />
        {/* Graded down so it sits in the same world as the terminal. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-void/85 via-void/15 to-transparent" />
        <div className="u-scanlines pointer-events-none absolute inset-0 opacity-60" />
        <div className="absolute top-2 left-2 z-10 border border-amber/50 bg-void/70 px-1.5 py-0.5">
          <span className="u-label text-[8px] text-amber">
            {reference.label}
          </span>
        </div>
        <div className="absolute right-2 bottom-2 z-10">
          <span className="font-mono text-[8px] text-dim">
            {reference.code}
          </span>
        </div>
      </div>
      <figcaption className="space-y-1.5 px-3 py-2.5">
        <p className="font-mono text-[10px] leading-relaxed text-dim">
          {reference.caption}
        </p>
        {matchLabel && (
          <p className="u-label text-[8px] text-cyan">
            WILL BE MATCHED AGAINST · {matchLabel}
          </p>
        )}
      </figcaption>
    </figure>
  );
}
