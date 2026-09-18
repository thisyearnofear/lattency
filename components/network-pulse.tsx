// NetworkPulse — the "this map is inhabited" signal.
//
// The map is beautiful enough to read as a static illustration, and the one
// moment that proves otherwise — another contributor's reading flashing onto
// the map edge via Measurement.subscribe() — is invisible to almost everyone
// because it requires someone else to contribute while you watch.
//
// This is the cheap, always-true version of that moment: how many stations
// have actually been tested recently, derived from timestamps we already have.
// No new query, no new endpoint.
//
// Server component, so it costs no client JavaScript and degrades to the
// bundled snapshot when Base44 is unconfigured.

import { getCafes } from "@/lib/cafes";
import { daysSince } from "@/lib/staleness";

function countWithin(cafes: Awaited<ReturnType<typeof getCafes>>, days: number): number {
  return cafes.filter((cafe) => {
    const age = daysSince(cafe.lastReadingAt);
    // daysSince floors, so <= 0 is "inside the last 24 hours".
    return age !== null && age <= days;
  }).length;
}

export async function NetworkPulse({ city }: { city: string }) {
  const cafes = await getCafes({ city });
  const last24h = countWithin(cafes, 0);
  const last7d = countWithin(cafes, 7);

  // Nothing to report honestly — stay silent rather than printing zeros.
  if (cafes.length === 0) return null;

  const cell =
    "flex items-baseline gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] whitespace-nowrap";

  return (
    <aside
      aria-label="Recent network activity"
      className="border-y border-ink/20 bg-cream-edge/30"
    >
      <div className="mx-auto max-w-[1440px] px-6 md:px-12 py-2.5 flex items-center gap-4 md:gap-6 overflow-x-auto no-scrollbar">
        <span className="flex items-center gap-2 shrink-0">
          <span aria-hidden className="live-dot" />
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-express">
            Live network
          </span>
        </span>

        <span aria-hidden className="text-ink-faint">
          ·
        </span>

        <span className={cell}>
          <span className="font-display font-black text-base text-ink tabular-nums">
            {cafes.length}
          </span>
          <span className="text-ink-soft">stations mapped</span>
        </span>

        <span aria-hidden className="hidden sm:inline text-ink-faint">
          ·
        </span>

        <span className={`${cell} hidden sm:flex`}>
          <span
            className={`font-display font-black text-base tabular-nums ${last24h > 0 ? "text-express" : "text-ink-faint"}`}
          >
            {last24h}
          </span>
          {/* Wording stays constant as the number goes to zero, so the strip
              doesn't reflow or change meaning mid-glance. */}
          <span className="text-ink-soft">refreshed in the last 24h</span>
        </span>

        <span aria-hidden className="hidden md:inline text-ink-faint">
          ·
        </span>

        <span className={`${cell} hidden md:flex`}>
          <span className="font-display font-black text-base text-ink tabular-nums">
            {last7d}
          </span>
          <span className="text-ink-soft">this week</span>
        </span>
      </div>
    </aside>
  );
}
