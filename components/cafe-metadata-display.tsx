// Shared café metadata display — the coffee-lover details that sit
// alongside the speed/signal stats. Two modes matching SignalQuality:
//   compact  → chips on station cards (reuses VibeChips styling)
//   full     → labeled rows on detail modal + café page
//
// Single source of truth: lib/cafe-metadata.ts provides the vocabulary
// and formatting; this component renders it.

import { formatMetadata, metadataChips } from "@/lib/cafe-metadata";
import type { CafeStation } from "@/lib/types";

export function CafeMetadataChips({ cafe }: { cafe: Pick<CafeStation, "metadata"> }) {
  const chips = metadataChips(cafe);
  if (chips.length === 0) return null;
  return (
    <ul aria-label="Café metadata" className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <li
          key={chip}
          className="font-mono text-[9px] tracking-[0.14em] px-1.5 py-[2px] uppercase border border-ink/25 text-ink-soft bg-cream-edge/60"
        >
          {chip}
        </li>
      ))}
    </ul>
  );
}

export function CafeMetadataRows({ cafe }: { cafe: Pick<CafeStation, "metadata"> }) {
  const rows = formatMetadata(cafe);
  if (rows.length === 0) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 font-mono text-xs">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="tracking-[0.14em] uppercase text-ink-faint">{row.label}</dt>
          <dd className="text-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
