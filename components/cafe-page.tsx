"use client";

// Full-page version of the café detail — sharable, indexable, has its own
// URL at /cafes/[slug]. The modal-style CafeDetail is still the in-app
// experience (faster, in-context); this is what gets pasted on Twitter.

import Link from "next/link";
import type { CafeDetail as CafeDetailType, Tier, TimeBucket } from "@/lib/types";
import { MeasurementForm } from "./measurement-form";
import { CopyShareLink } from "./copy-share-link";
import { SignalQuality } from "./signal-quality";
import { VibeChips } from "./vibe-chips";
import { CafeMetadataRows } from "./cafe-metadata-display";
import { RecentReadings } from "./recent-readings";
import { SponsorBadge, SponsorTagline } from "./sponsor-badge";

const TIER_COLOUR: Record<Tier, string> = {
  express: "var(--color-express)",
  local: "var(--color-local)",
  suspended: "var(--color-suspended)",
};
const TIER_BG: Record<Tier, string> = {
  express: "bg-express",
  local: "bg-local",
  suspended: "bg-suspended",
};
const TIER_LABEL: Record<Tier, string> = {
  express: "X · Express line",
  local: "L · Local line",
  suspended: "S · Suspended line",
};
const TIER_ROAST: Record<Tier, string> = {
  express: "dark roast · ≥ 50 Mbps",
  local: "medium roast · 10–49 Mbps",
  suspended: "decaf · < 10 Mbps",
};

const BUCKET_LABEL: Record<TimeBucket, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};
const BUCKET_ORDER: TimeBucket[] = ["morning", "afternoon", "evening"];

function DistributionChart({ detail }: { detail: CafeDetailType }) {
  const byBucket = new Map(detail.distribution.map((d) => [d.timeBucket, d]));
  const peak = Math.max(
    50,
    ...detail.distribution.map((d) => d.medianDownMbps),
    1,
  );
  const colour = TIER_COLOUR[detail.tier];

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between">
        <p className="stamp">Speed by time of day</p>
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-ink-faint">
          median Mbps
        </p>
      </div>

      <div className="relative mt-3 h-48 border-b border-l border-ink/30">
        <div
          className="absolute inset-x-0 border-t border-dashed border-express/50"
          style={{ bottom: `${(50 / peak) * 100}%` }}
        >
          <span className="absolute -top-3 right-0 font-mono text-[8px] tracking-[0.15em] uppercase text-express/80 bg-cream px-1">
            express · 50
          </span>
        </div>

        <div className="absolute inset-0 flex items-end justify-around gap-3 px-3 pb-px">
          {BUCKET_ORDER.map((bucket) => {
            const d = byBucket.get(bucket);
            const v = d?.medianDownMbps ?? 0;
            const h = Math.max(2, (v / peak) * 100);
            return (
              <div
                key={bucket}
                className="flex-1 flex flex-col items-center justify-end h-full"
              >
                <span className="font-mono text-[12px] text-ink tabular-nums mb-1">
                  {v ? Math.round(v) : "—"}
                </span>
                <div
                  className="w-full max-w-[80px] transition-[height] duration-500 ease-out"
                  style={{ height: `${h}%`, background: colour, opacity: 0.85 }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-around gap-3 px-3 mt-1.5">
        {BUCKET_ORDER.map((bucket) => {
          const d = byBucket.get(bucket);
          return (
            <div key={bucket} className="flex-1 text-center">
              <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-soft">
                {BUCKET_LABEL[bucket]}
              </p>
              <p className="font-mono text-[9px] text-ink-faint">
                {d ? `${d.sampleSize} obs` : "no data"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-faint">
        {label}
      </div>
      <div className="font-display font-black text-4xl md:text-5xl text-ink leading-none mt-1 tabular-nums">
        {value}
        <span className="font-mono text-[11px] text-ink-faint ml-1.5 align-top">
          {unit}
        </span>
      </div>
    </div>
  );
}

export function CafePage({ cafe }: { cafe: CafeDetailType }) {
  const tierBg = TIER_BG[cafe.tier];

  return (
    <main className="mx-auto max-w-[1200px] px-6 md:px-12 pt-8 pb-24">
      {/* Breadcrumb + share */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <Link
          href="/"
          className="font-mono text-[10px] tracking-[0.22em] uppercase text-ink-soft hover:text-ink transition-colors inline-flex items-center gap-1.5"
        >
          <span aria-hidden>←</span> All stations
        </Link>
        <CopyShareLink />
      </div>

      {/* Hero — photo + tier + name */}
      <header className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 lg:gap-10 mb-10">
        <div className="relative aspect-[5/3] lg:aspect-auto lg:h-full overflow-hidden border border-ink/15 bg-cream-edge">
          <div className={`absolute inset-y-0 left-0 w-1.5 ${tierBg}`} />
          {cafe.latestPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cafe.latestPhotoUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover grayscale-[35%] contrast-[1.05]"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center">
              <span className="font-display font-black text-[160px] text-ink-faint/25 leading-none">
                {cafe.name
                  .split(/\s+/)
                  .filter((w) => !/^(the|of|a)$/i.test(w))
                  .slice(0, 2)
                  .map((w) => w[0]?.toUpperCase() ?? "")
                  .join("")}
              </span>
            </div>
          )}
          <div
            className={`${tierBg} absolute top-0 right-0 px-4 py-2 text-cream font-mono text-[11px] tracking-[0.22em] uppercase`}
          >
            {TIER_LABEL[cafe.tier]}
          </div>
        </div>

        <div className="flex flex-col justify-between gap-6">
          <div>
            <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-ink-soft mb-2">
              {cafe.neighbourhood} · Nairobi
            </p>
            <h1
              className="font-display font-black uppercase text-ink leading-[0.92] tracking-[-0.02em]"
              style={{ fontSize: "clamp(36px, 5vw, 64px)" }}
            >
              {cafe.name}
            </h1>
            {cafe.vibe && (
              <p className="font-serif italic text-ink-faint text-lg mt-3">
                {cafe.vibe}
              </p>
            )}
            {cafe.vibeTags && cafe.vibeTags.length > 0 && (
              <div className="mt-3">
                <VibeChips tags={cafe.vibeTags} />
              </div>
            )}
            {cafe.sponsor && (
              <div className="mt-4 space-y-1.5">
                <SponsorBadge sponsor={cafe.sponsor} />
                <SponsorTagline sponsor={cafe.sponsor} />
              </div>
            )}
            <div className="flex items-baseline justify-between gap-3 mt-4">
              <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-soft">
                {TIER_ROAST[cafe.tier]}
              </p>
              <a
                href="#contribute"
                className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-faint hover:text-ink transition-colors whitespace-nowrap"
              >
                Tier wrong? log a reading ↓
              </a>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-4 border-t border-ink/15">
            <Stat label="Down" value={String(Math.round(cafe.medianDownMbps))} unit="Mbps" />
            <Stat label="Up" value={cafe.medianUpMbps.toFixed(1)} unit="Mbps" />
            <Stat label="Ping" value={String(Math.round(cafe.medianLatencyMs))} unit="ms" />
          </div>
          <div className="pt-3 border-t border-ink/10">
            <SignalQuality
              jitterMs={cafe.medianJitterMs}
              lossPct={cafe.medianLossPct}
            />
          </div>
          {cafe.metadata && (
            <div className="pt-3 border-t border-ink/10">
              <CafeMetadataRows cafe={cafe} />
            </div>
          )}
          {cafe.measurementCount > 0 ? (
            <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-faint">
              {cafe.measurementCount} measurements on file
            </p>
          ) : (
            <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-soft">
              <span className="text-ink">Tier estimated</span> · no readings yet ·
              <a
                href="#contribute"
                className="ml-1 underline underline-offset-4 hover:text-ink"
              >
                be the first →
              </a>
            </p>
          )}
        </div>
      </header>

      {/* Distribution + measurement form, side by side on wide */}
      <section
        id="contribute"
        className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-10 mb-16 scroll-mt-20"
      >
        <div>
          <DistributionChart detail={cafe} />
        </div>
        <div className="flex flex-col gap-6">
          {cafe.recent.length > 0 && (
            <div className="border border-ink/15 bg-cream-edge/40 p-5">
              <RecentReadings readings={cafe.recent} />
            </div>
          )}
          <div className="border border-ink/15 bg-cream-edge/40 p-5">
            <MeasurementForm cafeId={cafe.id} cafeName={cafe.name} />
          </div>
        </div>
      </section>

      <footer className="border-t border-ink/40 pt-6 flex flex-wrap items-baseline justify-between gap-4 text-sm">
        <p className="stamp">
          Lattency · printed in Nairobi · {new Date().getFullYear()}
        </p>
        <Link href="/" className="stamp hover:text-ink transition-colors">
          All stations →
        </Link>
      </footer>
    </main>
  );
}
