/**
 * One glyph per kind of identifier.
 *
 * Drawn rather than lettered because these have to read without being read —
 * at a glance a face, a plate and a vehicle must be tellable apart before any
 * of the words are.
 *
 * It answers *what class of thing* this is, which is the half of the question a
 * cropped photograph cannot answer on its own: a 40px crop of an arm and a
 * 40px crop of a shoulder look alike, and only one of them is a marking on
 * file. Pair it with `RegionCrop`, never replace one with the other.
 */

import type { EvidenceKind } from "@/types";

export function EvidenceGlyph({ kind }: { kind: EvidenceKind }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "size-full",
    "aria-hidden": true,
  };
  switch (kind) {
    case "face":
    case "witness":
      return (
        <svg {...common}>
          <circle cx="12" cy="8.5" r="4" />
          <path d="M4.5 20.5c0-4.2 3.4-6.5 7.5-6.5s7.5 2.3 7.5 6.5" />
        </svg>
      );
    case "plate":
      return (
        <svg {...common}>
          <rect x="2.5" y="7" width="19" height="10" rx="1.6" />
          <path d="M6 12h3M11 12h3M16 12h2" />
        </svg>
      );
    case "vehicle":
      return (
        <svg {...common}>
          <path d="M3 15v-2.2l2-4.3A2 2 0 0 1 6.8 7h10.4a2 2 0 0 1 1.8 1.5l2 4.3V15" />
          <path d="M3 15h18v2.5h-3V15M6 17.5V15H3" />
          <circle cx="7.5" cy="15" r="0.6" />
          <circle cx="16.5" cy="15" r="0.6" />
        </svg>
      );
    case "weapon":
      return (
        <svg {...common}>
          <path d="M3 8h13v4h-3l-2.5 4H8l1-4H6l-3 3z" />
          <path d="M16 8h5v3h-5" />
        </svg>
      );
    case "mark":
      return (
        <svg {...common}>
          <path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9" />
        </svg>
      );
    case "location":
      return (
        <svg {...common}>
          <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" />
          <circle cx="12" cy="10" r="2.4" />
        </svg>
      );
    case "mask":
      return (
        <svg {...common}>
          <path d="M3 8.5c0-1.4 1.2-2.4 2.6-2.2 2.1.3 4.2.5 6.4.5s4.3-.2 6.4-.5C19.8 6.1 21 7.1 21 8.5c0 5.2-3.6 9.4-9 9.4S3 13.7 3 8.5z" />
          <path d="M8.5 11h2M13.5 11h2" />
        </svg>
      );
    case "object":
    default:
      return (
        <svg {...common}>
          <path d="M12 2.8 21 7.4v9.2L12 21.2 3 16.6V7.4z" />
          <path d="M3 7.4 12 12l9-4.6M12 12v9.2" />
        </svg>
      );
  }
}
