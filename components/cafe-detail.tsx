"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CafeDetail, CafeStation, MeasurementReading, Tier, TimeBucket } from "@/lib/types";
import { slugify } from "@/lib/slug";
import { MeasurementForm } from "./measurement-form";
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

function Distribution({ detail }: { detail: CafeDetail }) {
  const byBucket = new Map(detail.distribution.map((d) => [d.timeBucket, d]));
  // Scale against the express threshold (50) or the peak, whichever is taller,
  // so the express reference line always sits on the chart.
  const peak = Math.max(
    50,
    ...detail.distribution.map((d) => d.medianDownMbps),
    1,
  );
  const colour = TIER_COLOUR[detail.tier];

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="stamp">Speed by time of day</p>
        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-ink-faint">
          median Mbps
        </p>
      </div>

      <div className="relative mt-3 h-40 border-b border-l border-ink/30">
        {/* Express threshold reference line at 50 Mbps */}
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
              <div key={bucket} className="flex-1 flex flex-col items-center justify-end h-full">
                <span className="font-mono text-[11px] text-ink tabular-nums mb-1">
                  {v ? Math.round(v) : "—"}
                </span>
                <div
                  className="w-full max-w-[56px] transition-[height] duration-500 ease-out"
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
              <p className="font-mono text-[9px] tracking-[0.16em] uppercase text-ink-soft">
                {BUCKET_LABEL[bucket]}
              </p>
              <p className="font-mono text-[8px] text-ink-faint">
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
      <div className="font-mono text-[9px] tracking-[0.2em] uppercase text-ink-faint">
        {label}
      </div>
      <div className="font-display font-black text-3xl text-ink leading-none mt-1 tabular-nums">
        {value}
        <span className="font-mono text-[10px] text-ink-faint ml-1 align-top">{unit}</span>
      </div>
    </div>
  );
}

export function CafeDetail({
  station,
  onClose,
}: {
  station: CafeStation | null;
  onClose: () => void;
}) {
  // `detail` holds the hydrated (or optimistically updated) record. We never
  // set it synchronously inside an effect — it's seeded from the `station` prop
  // during render and only replaced from async callbacks.
  const [detail, setDetail] = useState<CafeDetail | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Displayed record: the hydrated detail when it matches the open station,
  // otherwise an instant seed from the station we already have in memory.
  const d: CafeDetail | null = station
    ? detail && detail.id === station.id
      ? detail
      : { ...station, distribution: [], recent: [] }
    : null;
  const loading = Boolean(d) && d!.distribution.length === 0;

  const refetch = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/cafes/${id}`);
      if (res.ok) {
        const { cafe } = (await res.json()) as { cafe: CafeDetail };
        setDetail(cafe);
      }
    } catch {
      /* keep whatever we have; the header still renders from `station` */
    }
  }, []);

  useEffect(() => {
    if (!station) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/cafes/${station.id}`);
        if (!cancelled && res.ok) {
          const { cafe } = (await res.json()) as { cafe: CafeDetail };
          setDetail(cafe);
        }
      } catch {
        /* seeded header stays visible */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [station]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (station) {
      document.addEventListener("keydown", onKey);
      panelRef.current?.focus();
    }
    return () => document.removeEventListener("keydown", onKey);
  }, [station, onClose]);

  // Optimistically fold a freshly contributed reading into the visible stats
  // and time-of-day curve, then re-sync from the server in the background.
  const onContributed = useCallback(
    (r: MeasurementReading) => {
      if (!station) return;
      const base: CafeDetail =
        detail && detail.id === station.id
          ? detail
          : { ...station, distribution: [], recent: [] };
      const n = base.measurementCount;
      const blend = (old: number, val: number) => (old * n + val) / (n + 1);
      const hour = new Date().getHours();
      const bucket: TimeBucket =
        hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
      const distribution = BUCKET_ORDER.map((b) => {
        const existing = base.distribution.find((x) => x.timeBucket === b);
        if (b !== bucket) {
          return existing ?? { timeBucket: b, medianDownMbps: 0, sampleSize: 0 };
        }
        const s = existing?.sampleSize ?? 0;
        const m = existing?.medianDownMbps ?? r.downMbps;
        return {
          timeBucket: b,
          medianDownMbps: (m * s + r.downMbps) / (s + 1),
          sampleSize: s + 1,
        };
      });
      setDetail({
        ...base,
        measurementCount: n + 1,
        medianDownMbps: blend(base.medianDownMbps, r.downMbps),
        medianUpMbps: blend(base.medianUpMbps, r.upMbps),
        medianLatencyMs: blend(base.medianLatencyMs, r.latencyMs),
        // Blend jitter/loss only when the reading includes them (auto-test).
        // Manual entries don't have these, so we keep the existing medians.
        medianJitterMs:
          r.jitterMs !== undefined
            ? blend(base.medianJitterMs, r.jitterMs)
            : base.medianJitterMs,
        medianLossPct:
          r.lossPct !== undefined
            ? blend(base.medianLossPct, r.lossPct)
            : base.medianLossPct,
        distribution,
      });
      // Reconcile with the authoritative materialized view once it refreshes.
      setTimeout(() => void refetch(station.id), 1200);
    },
    [station, detail, refetch],
  );

  const open = Boolean(station);

  return (
    <div
      aria-hidden={!open}
      className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-ink/40 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Drawer */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={d ? `${d.name} details` : "Café details"}
        tabIndex={-1}
        className={`absolute right-0 top-0 h-full w-full max-w-[440px] bg-cream border-l border-ink/80 shadow-[-12px_0_40px_rgba(26,22,18,0.25)] overflow-y-auto outline-none transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {d && (
          <div className="p-6 md:p-8">
            <div className="flex items-start justify-between gap-4">
              <span
                className="font-mono text-[10px] tracking-[0.22em] uppercase px-2.5 py-1 text-cream"
                style={{ background: TIER_COLOUR[d.tier] }}
              >
                {TIER_LABEL[d.tier]}
              </span>
              <div className="flex items-center gap-3">
                <a
                  href={`/cafes/${slugify(d.name)}`}
                  className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-soft hover:text-ink transition-colors inline-flex items-center gap-1"
                >
                  Open page <span aria-hidden>↗</span>
                </a>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="font-mono text-[11px] tracking-[0.2em] uppercase text-ink-soft hover:text-ink"
                >
                  Close ✕
                </button>
              </div>
            </div>

            <h2 className="font-display font-black uppercase leading-[0.92] text-4xl md:text-5xl tracking-[-0.02em] text-ink mt-4">
              {d.name}
            </h2>
            <p className="font-serif italic text-ink-faint text-lg mt-2">
              {d.neighbourhood} · {d.vibe}
            </p>
            {d.vibeTags && d.vibeTags.length > 0 && (
              <div className="mt-2.5">
                <VibeChips tags={d.vibeTags} />
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <SponsorBadge cafeName={d.name} />
            </div>
            <div className="mt-1.5">
              <SponsorTagline cafeName={d.name} />
            </div>
            <div className="flex items-baseline justify-between gap-3 mt-3">
              <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-soft">
                {TIER_ROAST[d.tier]}
              </p>
              <a
                href="#contribute-form"
                className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-faint hover:text-ink transition-colors whitespace-nowrap"
              >
                Tier wrong? log a reading ↓
              </a>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-ink/15">
              <Stat label="Down" value={String(Math.round(d.medianDownMbps))} unit="Mbps" />
              <Stat label="Up" value={d.medianUpMbps.toFixed(1)} unit="Mbps" />
              <Stat label="Ping" value={String(Math.round(d.medianLatencyMs))} unit="ms" />
            </div>

            <div className="mt-4 pt-3 border-t border-ink/10">
              <SignalQuality
                jitterMs={d.medianJitterMs}
                lossPct={d.medianLossPct}
              />
            </div>
            {d.metadata && (
              <div className="mt-4 pt-3 border-t border-ink/10">
                <CafeMetadataRows cafe={d} />
              </div>
            )}
            {d.measurementCount > 0 ? (
              <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-ink-faint mt-3">
                {d.measurementCount} measurements on file
                {loading && <span className="ml-2 text-ink-faint/60">· syncing…</span>}
              </p>
            ) : (
              <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-ink-soft mt-3">
                <span className="text-ink">Tier estimated</span> · no readings yet ·
                <span className="ml-1 text-ink-faint">be the first below ↓</span>
              </p>
            )}

            {d.recent.length > 0 && (
              <div className="mt-7 pt-6 border-t border-ink/15">
                <RecentReadings readings={d.recent} />
              </div>
            )}

            <div className="mt-7 pt-6 border-t border-ink/15">
              <Distribution detail={d} />
            </div>

            <div id="contribute-form" className="mt-7 pt-6 border-t border-ink/15">
              <MeasurementForm
                cafeId={d.id}
                cafeName={d.name}
                onContributed={onContributed}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
