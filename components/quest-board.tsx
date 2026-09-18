// QuestBoard — the always-available reason to come back.
//
// The return loop used to depend entirely on sponsor-funded bounties, which
// means it depended on money arriving from outside the product. This board is
// built from data the app already computes: which stations have gone stale,
// and which have never been tested at all. Those gaps can never run out, so
// there is always something worth doing, and the reward is the thing the
// product actually values — a fresher map.
//
// Server component, like BountiesBoard: no client fetch, no loading state, and
// it degrades to the bundled snapshot when Base44 is unconfigured.

import Link from "next/link";
import { getCafes } from "@/lib/cafes";
import { slugify } from "@/lib/slug";
import { daysSince, needsFreshTest } from "@/lib/staleness";
import { GrowBar } from "./grow-bar";

/** How many quest rows to show before deferring to the directory. */
const MAX_QUESTS = 4;

interface Quest {
  id: string;
  name: string;
  neighbourhood: string;
  /** Days since the last reading, or null when there has never been one. */
  ageDays: number | null;
  href: string;
  /** Why this is worth doing, in the editorial voice. */
  reason: string;
}

export async function QuestBoard({ city, cityName }: { city: string; cityName: string }) {
  const cafes = await getCafes({ city });

  const untested = cafes.filter((c) => c.measurementCount === 0);
  const stale = cafes
    .filter((c) => c.measurementCount > 0 && needsFreshTest(c.lastReadingAt))
    // Oldest first — the most decayed station is the most valuable re-test.
    .sort((a, b) => (daysSince(a.lastReadingAt) ?? 0) < (daysSince(b.lastReadingAt) ?? 0) ? 1 : -1);

  const quests: Quest[] = [
    ...untested.map((c) => ({
      id: `untested-${c.id}`,
      name: c.name,
      neighbourhood: c.neighbourhood,
      ageDays: null,
      href: `/cafes/${slugify(c.name)}?contribute=1`,
      reason: "Estimated tier — no reading on file. Yours would define its line.",
    })),
    ...stale.map((c) => ({
      id: `stale-${c.id}`,
      name: c.name,
      neighbourhood: c.neighbourhood,
      ageDays: daysSince(c.lastReadingAt),
      href: `/cafes/${slugify(c.name)}?contribute=1`,
      reason: `Last tested ${daysSince(c.lastReadingAt)} days ago. Re-test to keep its line honest.`,
    })),
  ];

  const fresh = cafes.filter((c) => c.measurementCount > 0 && !needsFreshTest(c.lastReadingAt)).length;
  const freshPct = cafes.length > 0 ? Math.round((fresh / cafes.length) * 100) : 0;
  const shown = quests.slice(0, MAX_QUESTS);

  return (
    <section
      id="quests"
      aria-label="Open quests"
      className="mt-24 pt-10 border-t border-ink/80 scroll-mt-16"
    >
      <div className="flex flex-wrap items-end justify-between gap-4 mb-3">
        <div>
          <p className="stamp">Open quests</p>
          <h2 className="font-display font-black uppercase text-5xl md:text-6xl tracking-[-0.02em] text-ink mt-1">
            Keep the line honest
          </h2>
          <p className="font-mono text-[11px] md:text-[12px] tracking-[0.22em] uppercase text-ink-soft mt-3">
            Not a bounty — a gap.
            <span className="text-ink-faint mx-1.5">·</span>
            No sponsor needed.
            <span className="text-ink-faint mx-1.5">·</span>
            Every reading ages.
          </p>
        </div>
      </div>

      {/* Network freshness — the scoreboard for this board. Grows on mount so
          it reads as something being maintained, not a static figure. */}
      <div className="border border-ink/15 bg-cream-edge/30 p-4 mb-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
            {cafes.length === 0
              ? `${cityName} has no stations yet`
              : `${fresh} of ${cafes.length} station${cafes.length === 1 ? "" : "s"} ${cityName} tested within 14 days`}
          </p>
          <p className="font-mono text-[11px] tabular-nums text-ink-faint">{freshPct}%</p>
        </div>
        <GrowBar
          pct={freshPct}
          className="h-[3px] bg-cream-deep w-full mt-2"
          barClassName="bg-express"
        />
      </div>

      {shown.length === 0 ? (
        <div className="border border-dashed border-ink/30 bg-cream-edge/40 p-10 text-center">
          <p className="font-display font-black uppercase text-3xl tracking-[-0.01em] text-ink">
            Nothing has gone stale.
          </p>
          <p className="font-serif italic text-ink-soft text-lg mt-3 max-w-xl mx-auto">
            Every {cityName} station has a fresh reading. Map somewhere new and
            this board will have work for you again.
          </p>
          <Link
            href={`/${city}?contribute=1`}
            className="bg-ink text-cream font-mono text-[11px] tracking-[0.22em] uppercase px-4 py-2.5 inline-flex items-center gap-1.5 hover:bg-ink/90 transition-colors mt-6"
          >
            <span aria-hidden>+</span> Map a café
          </Link>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {shown.map((quest, i) => (
              <li
                key={quest.id}
                className="rise-row pressable group bg-cream border border-ink/15 hover:border-ink/60 hover:-translate-y-0.5 hover:shadow-[4px_6px_0_0_var(--color-ink)]"
                style={{ animationDelay: `${Math.min(i * 40, 240)}ms` }}
              >
                <Link href={quest.href} className="flex h-full flex-col gap-3 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={`${quest.ageDays === null ? "bg-ink" : "bg-local"} text-cream font-mono text-[10px] tracking-[0.22em] uppercase px-2 py-1`}
                    >
                      {quest.ageDays === null ? "Untested" : "Stale"}
                    </span>
                    {quest.ageDays !== null && (
                      <span className="font-mono text-[10px] tabular-nums uppercase tracking-[0.16em] text-ink-faint">
                        {quest.ageDays}d
                      </span>
                    )}
                  </div>

                  <p className="font-display font-black uppercase text-ink text-xl leading-tight tracking-[-0.01em]">
                    {quest.name}
                  </p>
                  <p className="font-serif italic text-ink-faint text-sm -mt-1.5">
                    {quest.neighbourhood}
                  </p>
                  <p className="font-serif text-[13px] leading-snug text-ink-soft mt-auto">
                    {quest.reason}
                  </p>
                  <span className="pt-3 border-t border-cream-deep font-mono text-[10px] tracking-[0.18em] uppercase text-ink-soft group-hover:text-ink transition-colors">
                    Run a test →
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {quests.length > shown.length && (
            <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-faint mt-5">
              +{quests.length - shown.length} more station
              {quests.length - shown.length === 1 ? "" : "s"} need
              {quests.length - shown.length === 1 ? "s" : ""} a fresh reading ·
              <Link
                href={`/${city}#directory`}
                className="ml-1.5 text-ink underline underline-offset-4 hover:text-express"
              >
                see all
              </Link>
            </p>
          )}
        </>
      )}
    </section>
  );
}
