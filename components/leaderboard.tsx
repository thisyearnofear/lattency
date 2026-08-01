"use client";

// Leaderboard — per-city contributor ranking. Gives the milestone ranks an
// audience: status is meaningless without witnesses. Renders the top 10 plus
// the requesting contributor's own row (highlighted) so they always see where
// they stand. Empty state is honest — no attribution yet, so no board.

import { useContributor } from "@/hooks/use-contributor";
import { useLeaderboard } from "@/hooks/use-leaderboard";
import type { LeaderboardEntry } from "@/lib/leaderboard";

function RankRow({
  entry,
  isMe,
}: {
  entry: LeaderboardEntry;
  isMe: boolean;
}) {
  return (
    <li
      className={[
        "flex items-center gap-3 px-4 py-2.5 border-b border-ink/10 last:border-b-0",
        isMe ? "bg-express/10" : "",
      ].join(" ")}
    >
      <span className="font-display font-black text-2xl text-ink-faint w-8 tabular-nums leading-none">
        {entry.rank}
      </span>
      <span className="font-display font-black uppercase text-ink text-lg leading-none flex-1 truncate">
        {entry.displayName ?? entry.handle}
        {isMe && (
          <span className="ml-2 font-mono text-[9px] tracking-[0.2em] uppercase text-express align-middle">
            you
          </span>
        )}
      </span>
      <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-soft tabular-nums text-right">
        {entry.stations} station{entry.stations === 1 ? "" : "s"}
      </span>
      <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-faint tabular-nums text-right w-20">
        {entry.readings} reads
      </span>
    </li>
  );
}

export function Leaderboard({ city }: { city: string }) {
  const contributor = useContributor();
  const { entries, me, loading } = useLeaderboard(city, contributor.id);

  const showMeRow =
    me && !entries.some((e) => e.contributorId === me.contributorId);

  return (
    <section aria-label="City leaderboard" className="mt-24 pt-10 border-t border-ink/80">
      <p className="stamp">City standings</p>
      <h2 className="font-display font-black uppercase text-5xl md:text-6xl tracking-[-0.02em] text-ink mt-1">
        Who&rsquo;s mapping here
      </h2>
      <p className="font-mono text-[11px] md:text-[12px] tracking-[0.22em] uppercase text-ink-soft mt-3">
        Ranked by stations touched this month.
      </p>

      <div className="mt-6 border border-ink/15 bg-cream-edge/30">
        {loading ? (
          <p className="px-4 py-6 font-mono text-[10px] tracking-[0.2em] uppercase text-ink-faint">
            Reading the board…
          </p>
        ) : entries.length === 0 ? (
          <p className="px-4 py-6 font-serif italic text-ink-soft text-sm">
            No contributions recorded here yet. Map the first café and take the
            top spot.
          </p>
        ) : (
          <>
            <ul>
              {entries.map((e) => (
                <RankRow
                  key={e.contributorId}
                  entry={e}
                  isMe={e.contributorId === contributor.id}
                />
              ))}
            </ul>
            {showMeRow && me && (
              <div className="border-t border-dashed border-ink/20">
                <p className="px-4 pt-2 pb-1 font-mono text-[8px] tracking-[0.2em] uppercase text-ink-faint">
                  your standing
                </p>
                <ul>
                  <RankRow entry={me} isMe />
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
