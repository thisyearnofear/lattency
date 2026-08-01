"use client";

// ContributorProfile — the persistent home for a contributor's status. This
// is the `/me` page the referral loop and milestone ranks point at: it binds
// together the local identity (lib/contributor.ts), the personal trail
// (per-city transit lines), the shared milestone ranks, and the contributor's
// standing in their most-mapped city.
//
// It also closes the viral loop: a one-tap "invite" link that carries ?via=<id>
// so new visitors attribute their first contribution back here, and an optional
// Nimiq-address bind that promotes the anonymous id into a portable one.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useContributor } from "@/hooks/use-contributor";
import { useLeaderboard } from "@/hooks/use-leaderboard";
import { useNimiq } from "@/hooks/use-nimiq";
import { MILESTONES, milestoneFor, nextMilestone } from "@/lib/milestones";
import { YourLine, type TrailStation } from "./your-line";
import { getLastVisitedCity } from "./city-visit-tracker";
import type { Tier } from "@/lib/types";

const TRAIL_KEY = "lattency:trail:v1";
const READINGS_KEY = "lattency:readings-count";

interface Trail {
  [city: string]: Array<{ name: string; lat: number; lng: number; tier?: string }>;
}

function readTrail(): Trail {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(TRAIL_KEY) ?? "{}") as Trail;
  } catch {
    return {};
  }
}

function readReadingsCount(): number {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(READINGS_KEY);
  return raw ? parseInt(raw, 10) || 0 : 0;
}

function trailToStations(trail: Trail): TrailStation[] {
  const out: TrailStation[] = [];
  for (const [city, list] of Object.entries(trail)) {
    for (const s of list) {
      out.push({ name: s.name, city, tier: (s.tier as Tier) ?? "express" });
    }
  }
  return out;
}

function StatBlock({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="border border-ink/20 bg-cream-edge/40 p-4 text-center">
      <p className="font-mono text-[9px] tracking-[0.22em] uppercase text-ink-faint">{label}</p>
      <p className="font-display font-black text-4xl text-ink leading-none mt-2 tabular-nums">{value}</p>
      {sub && (
        <p className="font-mono text-[9px] tracking-[0.16em] uppercase text-ink-faint mt-1.5">{sub}</p>
      )}
    </div>
  );
}

export function ContributorProfile() {
  const contributor = useContributor();
  const { address } = useNimiq();

  const [trail] = useState<Trail>(readTrail);
  const [readings] = useState<number>(readReadingsCount);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [copied, setCopied] = useState(false);

  // Bind the anonymous id to a connected Nimiq address so the identity is
  // portable across devices. Runs whenever an address becomes available.
  useEffect(() => {
    if (address) contributor.bindToAddress(address);
  }, [address, contributor]);

  const stations = useMemo(() => trailToStations(trail), [trail]);
  const cities = useMemo(() => Object.keys(trail), [trail]);
  const cafesMapped = stations.length;
  const rank = milestoneFor(cafesMapped);
  const next = nextMilestone(cafesMapped);

  // Stand in the most-recently visited city (falls back to first in trail).
  const primaryCity = useMemo(() => {
    const last = getLastVisitedCity();
    if (last && cities.includes(last)) return last;
    return cities[0] ?? "london";
  }, [cities]);

  const { me } = useLeaderboard(primaryCity, contributor.id);

  async function saveName() {
    const clean = nameDraft.trim();
    if (clean) {
      contributor.setDisplayName(clean);
      // Best-effort persist to Base44 so the leaderboard can resolve the name.
      try {
        await fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contributorId: contributor.id, displayName: clean }),
        });
      } catch {
        /* local name still set even if the server write fails */
      }
    }
    setEditing(false);
  }

  function inviteHref() {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://lattency.app";
    return `${origin}/${primaryCity}?via=${contributor.id}`;
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteHref());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  const nextPct = next
    ? Math.min(100, Math.round((cafesMapped / next.milestone.at) * 100))
    : 100;

  return (
    <main className="mx-auto max-w-[920px] px-6 md:px-12 py-10 pb-24">
      {/* Breadcrumb */}
      <Link
        href={`/${primaryCity}`}
        className="font-mono text-[10px] tracking-[0.22em] uppercase text-ink-soft hover:text-ink inline-flex items-center gap-1.5"
      >
        <span aria-hidden>←</span> Back to map
      </Link>

      {/* Identity header */}
      <header className="mt-6 flex flex-wrap items-start justify-between gap-6 border-b border-ink/80 pb-8">
        <div>
          <p className="stamp">Contributor file</p>
          {editing ? (
            <div className="flex items-center gap-2 mt-2">
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={24}
                placeholder="Your name"
                className="font-display font-black uppercase text-4xl text-ink bg-transparent border-b-2 border-express outline-none w-[320px] max-w-full"
                onKeyDown={(e) => e.key === "Enter" && saveName()}
              />
              <button
                type="button"
                onClick={saveName}
                className="font-mono text-[10px] tracking-[0.2em] uppercase bg-ink text-cream px-3 py-1.5"
              >
                Save
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setNameDraft(contributor.displayName ?? "");
                setEditing(true);
              }}
              className="mt-2 text-left group"
            >
              <h1 className="font-display font-black uppercase text-5xl md:text-6xl text-ink leading-[0.9] tracking-[-0.02em]">
                {contributor.displayName ?? contributor.handle}
              </h1>
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-faint group-hover:text-ink transition-colors">
                {contributor.displayName ? "rename ✎" : "set your name ✎"}
              </span>
            </button>
          )}
          <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-faint mt-3">
            {contributor.id.startsWith("NQ") ? "wallet-linked" : "anonymous"} ·{" "}
            {contributor.referralCount} referral{contributor.referralCount === 1 ? "" : "s"} sent
            {contributor.referredBy ? ` · invited by ${contributor.referredBy.slice(0, 10)}…` : ""}
          </p>
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-ink/30 bg-cream-edge/40">
          <span className="font-mono text-[9px] tracking-[0.22em] uppercase text-ink-faint">Rank</span>
          <span className="font-display font-black text-lg uppercase text-ink">{rank.title}</span>
          <span className="font-mono text-[9px] text-ink-faint">· {rank.sub}</span>
        </div>
      </header>

      {/* Stats */}
      <section className="mt-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatBlock label="Stations" value={cafesMapped} sub="on the network" />
          <StatBlock label="Readings" value={readings} sub="speed tests" />
          <StatBlock label="Cities" value={cities.length} sub="mapped" />
          <StatBlock
            label="Standing"
            value={me ? `#${me.rank}` : "—"}
            sub={primaryCity}
          />
        </div>

        {/* Progress toward the next rank */}
        <div className="mt-4 border border-ink/15 bg-cream-edge/30 p-4">
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-soft">
              {next
                ? `${next.remaining} more to ${next.milestone.title}`
                : "Top rank reached"}
            </p>
            <p className="font-mono text-[10px] tabular-nums text-ink-faint">{nextPct}%</p>
          </div>
          <div className="h-[3px] bg-cream-deep w-full mt-2 relative">
            <div className="absolute inset-y-0 left-0 bg-express" style={{ width: `${nextPct}%` }} />
          </div>
        </div>
      </section>

      {/* Per-city lines */}
      <section className="mt-12">
        <p className="stamp">Your lines by city</p>
        <h2 className="font-display font-black uppercase text-4xl tracking-[-0.02em] text-ink mt-1">
          The network you built
        </h2>

        {cities.length === 0 ? (
          <div className="mt-5 border border-dashed border-ink/30 bg-cream-edge/40 p-8 text-center">
            <p className="font-serif italic text-ink-soft text-lg">
              No stations mapped yet. Your transit line starts with your first café.
            </p>
            <Link
              href={`/${primaryCity}?contribute=1`}
              className="mt-5 inline-flex items-center gap-1.5 bg-ink text-cream font-mono text-[11px] tracking-[0.22em] uppercase px-4 py-2.5 hover:bg-ink/90 transition-colors"
            >
              <span aria-hidden>+</span> Map your first café
            </Link>
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            {cities.map((city) => (
              <div key={city} className="border border-ink/15 bg-cream-edge/20 p-4">
                <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-ink-soft mb-1">
                  {city} · {trail[city].length} station{trail[city].length === 1 ? "" : "s"}
                </p>
                <YourLine stations={trailToStations({ [city]: trail[city] })} title="" />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Rank ladder */}
      <section className="mt-12">
        <p className="stamp">Rank ladder</p>
        <ol className="mt-3 space-y-1.5">
          {MILESTONES.map((m) => {
            const earned = cafesMapped >= m.at;
            const isCurrent = m.title === rank.title;
            return (
              <li
                key={m.title}
                className={[
                  "flex items-center gap-3 px-4 py-2.5 border",
                  isCurrent
                    ? "border-express bg-express/10"
                    : earned
                      ? "border-ink/20 bg-cream-edge/30"
                      : "border-ink/10 opacity-50",
                ].join(" ")}
              >
                <span
                  className={[
                    "w-6 h-6 grid place-items-center font-display font-black text-sm",
                    earned ? "bg-express text-cream" : "bg-ink/10 text-ink-faint",
                  ].join(" ")}
                  aria-hidden
                >
                  {earned ? "✓" : "○"}
                </span>
                <span className="font-display font-black uppercase text-ink text-lg leading-none flex-1">
                  {m.title}
                </span>
                <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-faint">
                  {m.sub}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Invite / referral loop */}
      <section className="mt-12 border border-ink/80 bg-cream-edge/40 p-6">
        <p className="stamp">Grow the network</p>
        <h2 className="font-display font-black uppercase text-3xl tracking-[-0.01em] text-ink mt-1">
          Invite a co-worker
        </h2>
        <p className="font-serif italic text-ink-soft text-[15px] mt-2 max-w-xl">
          Share your link. When someone maps their first café from it, the
          referral lands on your file — and theirs remembers who brought them.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <code className="font-mono text-[11px] text-ink bg-cream border border-ink/20 px-3 py-2 truncate max-w-full">
            {inviteHref()}
          </code>
          <button
            type="button"
            onClick={copyInvite}
            className="font-mono text-[10px] tracking-[0.22em] uppercase bg-ink text-cream px-4 py-2 hover:bg-ink/90 transition-colors inline-flex items-center gap-1.5"
          >
            <span aria-hidden>{copied ? "✓" : "⎘"}</span> {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </section>
    </main>
  );
}
