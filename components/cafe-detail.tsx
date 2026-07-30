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
import { AiVenueSummary } from "./ai-venue-summary";
import { TickNumber } from "./tick-number";
import { VTLink } from "./vt-link";
import { CrossfadePanel } from "@/components/crossfade-panel";
import { useCheckins } from "@/hooks/use-checkins";
import { stalenessLabel, needsFreshTest } from "@/lib/staleness";

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

function Stat({
  label,
  value,
  unit,
  decimals = 0,
}: {
  label: string;
  value: number;
  unit: string;
  decimals?: number;
}) {
  return (
    <div>
      <div className="font-mono text-[9px] tracking-[0.2em] uppercase text-ink-faint">
        {label}
      </div>
      <div className="font-display font-black text-3xl text-ink leading-none mt-1 tabular-nums">
        <TickNumber value={value} decimals={decimals} />
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

  // ── Check-in state ────────────────────────────────────────────────────
  const { checkIn, getCheckIn } = useCheckins();
  const [checkInStatus, setCheckInStatus] = useState<"idle" | "pending" | "verified" | "far" | "denied">("idle");
  const [checkInDistance, setCheckInDistance] = useState<number | null>(null);
  const [receiptPhoto, setReceiptPhoto] = useState<string | null>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  const existingCheckIn = station ? getCheckIn(station.id) : null;
  const alreadyCheckedIn = existingCheckIn?.verified ?? false;
  const alreadyCheckedInBadge = alreadyCheckedIn ? (
    <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-express inline-flex items-center gap-1">
      <span aria-hidden>✓</span> Verified visitor
    </span>
  ) : null;

  // Reset check-in UI when the station changes — keyed on station id so
  // switching between cafés resets the form without an effect.
  const stationKey = station?.id ?? "";
  const [prevStationKey, setPrevStationKey] = useState(stationKey);
  if (stationKey !== prevStationKey) {
    setPrevStationKey(stationKey);
    setCheckInStatus(existingCheckIn?.verified ? "verified" : "idle");
    setCheckInDistance(null);
    setReceiptPhoto(existingCheckIn?.receiptPhoto ?? null);
  }

  function handleReceiptSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 800;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setReceiptPhoto(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  async function handleCheckIn() {
    if (!station) return;
    setCheckInStatus("pending");
    try {
      const { verified, distanceM } = await checkIn(
        station.id,
        station.lat,
        station.lng,
        receiptPhoto,
      );
      setCheckInDistance(Math.round(distanceM));
      setCheckInStatus(verified ? "verified" : "far");
    } catch {
      setCheckInStatus("denied");
    }
  }

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

      {/* Panel — centered overlay on desktop, bottom sheet on mobile */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={d ? `${d.name} details` : "Café details"}
        tabIndex={-1}
        className={`absolute bg-cream border-ink/80 shadow-[6px_8px_0_0_var(--color-ink)] overflow-y-auto outline-none transition-all duration-300 ease-out pb-[env(safe-area-inset-bottom)] ${
          open
            ? "opacity-100"
            : "opacity-0 pointer-events-none"
        } max-h-[90dvh] w-full max-w-[640px] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border ${
          open ? "scale-100" : "scale-95"
        } max-md:bottom-0 max-md:top-auto max-md:left-0 max-md:translate-x-0 max-md:translate-y-0 max-md:max-h-[88dvh] max-md:w-full max-md:rounded-t-none`}
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
                <VTLink
                  href={`/cafes/${slugify(d.name)}`}
                  className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-soft hover:text-ink inline-flex items-center gap-1"
                >
                  Open page <span aria-hidden>↗</span>
                </VTLink>
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
            <AiVenueSummary cafeId={d.id} measurementCount={d.measurementCount} />
            {d.vibeTags && d.vibeTags.length > 0 && (
              <div className="mt-2.5">
                <VibeChips tags={d.vibeTags} />
              </div>
            )}
            {d.sponsor && (
              <>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <SponsorBadge sponsor={d.sponsor} />
                </div>
                <div className="mt-1.5">
                  <SponsorTagline sponsor={d.sponsor} />
                </div>
              </>
            )}
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
              <Stat label="Down" value={Math.round(d.medianDownMbps)} unit="Mbps" />
              <Stat label="Up" value={d.medianUpMbps} unit="Mbps" decimals={1} />
              <Stat label="Ping" value={Math.round(d.medianLatencyMs)} unit="ms" />
            </div>

            <div className="mt-4 pt-3 border-t border-ink/10">
              <SignalQuality
                jitterMs={d.medianJitterMs}
                lossPct={d.medianLossPct}
              />
            </div>
            {d.measurementCount > 0 ? (
              <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-ink-faint mt-3">
                {d.measurementCount} measurements on file
                {stalenessLabel(d.lastReadingAt) && (
                  <span className="ml-2">· last: {stalenessLabel(d.lastReadingAt)}</span>
                )}
                {loading && <span className="ml-2 text-ink-faint/60">· syncing…</span>}
              </p>
            ) : (
              <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-ink-soft mt-3">
                <span className="text-ink">Tier estimated</span> · no readings yet ·
                <span className="ml-1 text-ink-faint">be the first under Contribute ↓</span>
              </p>
            )}

            {/* Staleness banner — when a station hasn't been tested recently. */}
            {needsFreshTest(d.lastReadingAt) && (
              <div className="mt-3 border border-suspended/40 bg-suspended/5 px-4 py-2.5 flex items-center gap-3">
                <span className="bg-suspended text-cream font-display font-black text-lg w-8 h-10 flex items-center justify-center shrink-0">
                  !
                </span>
                <div>
                  <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-suspended">
                    This station needs a fresh test
                  </p>
                  <p className="font-serif italic text-[13px] text-ink-soft mt-0.5">
                    Last reading {stalenessLabel(d.lastReadingAt)} — re-test to keep this station on the {d.tier} line.
                  </p>
                </div>
              </div>
            )}

            {/* Check-in — "I was here" confirmation. Collapsed by default;
                it's a secondary action, not part of the headline scan.
                Geolocation proximity check + optional receipt photo.
                Privacy-preserving: only the verified boolean and photo are
                stored locally, never the user's exact coordinates. */}
            <details className="mt-5 pt-4 border-t border-ink/15 group">
              <summary className="flex items-baseline justify-between gap-3 cursor-pointer list-none">
                <p className="stamp">Check in here</p>
                {alreadyCheckedInBadge}
                <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-faint group-open:hidden ml-auto">+ Show</span>
                <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-faint hidden group-open:inline ml-auto">Hide</span>
              </summary>
              <CheckInBody
                status={checkInStatus}
                distance={checkInDistance}
                receiptPhoto={receiptPhoto}
                receiptInputRef={receiptInputRef}
                onReceiptSelect={handleReceiptSelect}
                onCheckIn={handleCheckIn}
                existingCheckIn={existingCheckIn}
              />
            </details>

            {/* Tabbed sections — keeps the headline (tier + identity +
                stats + signal quality) always visible while letting the
                deeper data live below without fighting for space. */}
            <DrawerTabs
              defaultTab={d.recent.length > 0 ? "recent" : "contribute"}
              tabs={[
                {
                  id: "recent",
                  label: "Recent",
                  count: d.recent.length || undefined,
                  content:
                    d.recent.length > 0 ? (
                      <RecentReadings readings={d.recent} />
                    ) : (
                      <EmptyTab
                        body="No readings on file yet. Log the first one — the tier and the ticker both update the moment your measurement commits."
                        ctaLabel="Log a reading"
                        targetTab="contribute"
                      />
                    ),
                },
                {
                  id: "hours",
                  label: "Hours",
                  content: <Distribution detail={d} />,
                },
                {
                  id: "contribute",
                  label: "Contribute",
                  primary: true,
                  content: (
                    <MeasurementForm
                      cafeId={d.id}
                      cafeName={d.name}
                      onContributed={onContributed}
                    />
                  ),
                },
                {
                  id: "about",
                  label: "About",
                  content:
                    d.metadata &&
                    (d.metadata.priceTier ||
                      d.metadata.milkOptions?.length ||
                      d.metadata.powerOutlets !== undefined ||
                      d.metadata.seating ||
                      d.metadata.wifiNetwork) ? (
                      <CafeMetadataRows cafe={d} />
                    ) : (
                      <EmptyTab
                        body="No coffee metadata on file yet — price tier, milk options, power outlets, seating. The contribution form collects these when you add a reading."
                        ctaLabel="Add metadata"
                        targetTab="contribute"
                      />
                    ),
                },
              ]}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// --- Drawer tabs --------------------------------------------------------

interface DrawerTab {
  id: string;
  label: string;
  /** Optional badge count rendered next to the label. */
  count?: number;
  /** Highlights the tab as the recommended action. */
  primary?: boolean;
  content: React.ReactNode;
}

function DrawerTabs({
  tabs,
  defaultTab,
}: {
  tabs: DrawerTab[];
  defaultTab: string;
}) {
  const [active, setActive] = useState<string>(defaultTab);
  // Make sure the default tab is valid (the parent passes a value based on
  // detail state, which may not match a tab id in edge cases).
  const activeTab =
    tabs.find((t) => t.id === active) ?? tabs.find((t) => t.id === defaultTab) ?? tabs[0];

  return (
    <div className="mt-7 pt-6 border-t border-ink/15">
      <div
        role="tablist"
        aria-label="Café detail sections"
        className="flex flex-nowrap items-center gap-1 overflow-x-auto no-scrollbar mb-5 pb-px"
      >
        {tabs.map((t) => {
          const isActive = t.id === activeTab.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`drawer-panel-${t.id}`}
              id={`drawer-tab-${t.id}`}
              onClick={() => setActive(t.id)}
              className={[
                "pressable font-mono text-[10px] tracking-[0.2em] uppercase px-3 py-2",
                isActive
                  ? "bg-ink text-cream"
                  : t.primary
                    ? "border border-ink/40 text-ink hover:bg-ink/5"
                    : "border border-transparent text-ink-soft hover:text-ink",
              ].join(" ")}
            >
              {t.label}
              {t.count !== undefined && (
                <span
                  className={`ml-1.5 ${isActive ? "text-cream/70" : "text-ink-faint"}`}
                >
                  {t.count}
                </span>
              )}
              {t.primary && !isActive && (
                <span aria-hidden className="ml-1.5 text-ink-faint">+</span>
              )}
            </button>
          );
        })}
      </div>

      <CrossfadePanel
        activeKey={activeTab.id}
        className="min-h-[180px]"
        render={(tabId) => {
          const tab = tabs.find((t) => t.id === tabId);
          return (
            <div
              role="tabpanel"
              id={`drawer-panel-${tabId}`}
              aria-labelledby={`drawer-tab-${tabId}`}
            >
              {tab?.content ?? null}
            </div>
          );
        }}
      />
    </div>
  );
}

function EmptyTab({
  body,
  ctaLabel,
  targetTab,
}: {
  body: string;
  ctaLabel: string;
  targetTab: string;
}) {
  return (
    <div className="border border-dashed border-ink/25 bg-cream-edge/40 p-6 text-center">
      <p className="font-serif italic text-ink-soft text-base leading-snug">
        {body}
      </p>
      <button
        type="button"
        onClick={() => {
          const trigger = document.getElementById(`drawer-tab-${targetTab}`);
          trigger?.click();
        }}
        className="pressable bg-ink text-cream font-mono text-[10px] tracking-[0.22em] uppercase px-4 py-2 inline-flex items-center gap-1.5 hover:bg-ink/90 mt-4"
      >
        <span aria-hidden>+</span> {ctaLabel}
      </button>
    </div>
  );
}

// ── Check-in section ──────────────────────────────────────────────────────
// Privacy-preserving "I was here" confirmation. Verifies the user's
// geolocation is within ~150m of the café, stores only the boolean result
// + optional receipt photo locally. Never stores exact coordinates.

type CheckInStatus = "idle" | "pending" | "verified" | "far" | "denied";

function CheckInBody({
  status,
  distance,
  receiptPhoto,
  receiptInputRef,
  onReceiptSelect,
  onCheckIn,
  existingCheckIn,
}: {
  status: CheckInStatus;
  distance: number | null;
  receiptPhoto: string | null;
  receiptInputRef: React.RefObject<HTMLInputElement | null>;
  onReceiptSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCheckIn: () => void;
  existingCheckIn: { verified: boolean; at: string; receiptPhoto?: string | null } | null;
}) {
  const alreadyCheckedIn = existingCheckIn?.verified ?? false;

  return (
    <div className="mt-3">
      <p className="font-serif italic text-ink-soft text-sm leading-snug">
        Confirm you&rsquo;re at this café right now. We check your device location against the café&rsquo;s coordinates — your exact position is never stored.
      </p>

      {/* Receipt photo — optional, client-side resized */}
      <input
        ref={receiptInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onReceiptSelect}
        className="hidden"
      />

      {receiptPhoto ? (
        <div className="mt-3 space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- Base64 preview */}
          <img
            src={receiptPhoto}
            alt="Receipt or café photo"
            className="w-full max-h-48 object-cover border border-ink/30"
          />
          <button
            type="button"
            onClick={() => receiptInputRef.current?.click()}
            className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-soft hover:text-ink underline underline-offset-4"
          >
            Change photo
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => receiptInputRef.current?.click()}
          className="mt-3 w-full py-2.5 border border-dashed border-ink/30 font-mono text-[10px] tracking-[0.18em] uppercase text-ink-soft hover:border-ink hover:text-ink transition-colors"
        >
          + Add receipt photo (optional)
        </button>
      )}

      {/* Check-in button */}
      {status === "idle" && !alreadyCheckedIn && (
        <button
          type="button"
          onClick={onCheckIn}
          className="mt-3 w-full py-2.5 bg-ink text-cream font-mono text-[11px] tracking-[0.22em] uppercase hover:bg-ink/90 transition-colors"
        >
          ◎ Check in here
        </button>
      )}

      {status === "pending" && (
        <button
          type="button"
          disabled
          className="mt-3 w-full py-2.5 bg-ink/60 text-cream font-mono text-[11px] tracking-[0.22em] uppercase"
        >
          Checking your location…
        </button>
      )}

      {status === "verified" && (
        <div className="mt-3 border border-express/40 bg-express/5 px-4 py-3 flex items-center gap-3">
          <span className="bg-express text-cream font-display font-black text-xl w-9 h-11 flex items-center justify-center shrink-0">
            ✓
          </span>
          <div>
            <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-express">
              Verified — you&rsquo;re here
            </p>
            <p className="font-serif italic text-[13px] text-ink-soft mt-0.5">
              {distance !== null && `${distance}m from the pin · `}
              Check-in stamped. Your exact location was not stored.
            </p>
          </div>
        </div>
      )}

      {status === "far" && (
        <div className="mt-3 border border-local/40 bg-local/5 px-4 py-3 flex items-center gap-3">
          <span className="bg-local text-cream font-display font-black text-xl w-9 h-11 flex items-center justify-center shrink-0">
            !
          </span>
          <div>
            <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-local">
              {distance !== null ? `${distance}m away` : "Too far"}
            </p>
            <p className="font-serif italic text-[13px] text-ink-soft mt-0.5">
              You&rsquo;re more than 150m from this café. Try checking in
              when you&rsquo;re inside.
            </p>
          </div>
        </div>
      )}

      {status === "denied" && (
        <div className="mt-3 border border-suspended/40 bg-suspended/5 px-4 py-3">
          <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-suspended">
            Location permission denied
          </p>
          <p className="font-serif italic text-[13px] text-ink-soft mt-0.5">
            Enable location access to verify your visit.
          </p>
        </div>
      )}

      {alreadyCheckedIn && status !== "verified" && (
        <div className="mt-3 border border-express/30 bg-express/5 px-4 py-2.5 flex items-center gap-2">
          <span aria-hidden className="text-express">✓</span>
          <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-soft">
            You checked in here{" "}
            {new Date(existingCheckIn!.at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>
      )}
    </div>
  );
}
