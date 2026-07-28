"use client";

// MapShell — the product-first home's map. Two modes, one toggle:
//
//   schematic    Static SVG with all 12 stations on three Bezier line tracks.
//                Renders immediately, no scroll, no cinematic timeline.
//   geographic   Real Leaflet basemap (CARTO Light tiles over OpenStreetMap),
//                stations as tier-coloured markers at actual lat/lng,
//                polylines connecting same-tier stations west-to-east.
//
// Click any station — schematic or geographic — opens the CafeDetail drawer.
// "Find me" locates the user; if they're far from the active city,
// it offers neighbourhood quick-picks to explore from.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import type { CafeStation, CityId, Tier } from "@/lib/types";
import {
  TIER_COLOUR,
  TIER_PATH,
  TIER_RANK,
  TIER_TINT,
  TIER_USE,
  VIEW_H,
  VIEW_W,
  splitName,
  tierForDown,
  waypointsForCity,
} from "@/lib/map-data";
import { CITIES } from "@/lib/cities";
import { stalenessOpacity, needsFreshTest } from "@/lib/staleness";
import { useCheckins } from "@/hooks/use-checkins";
import { assessStability, STABILITY_COLOUR } from "@/lib/stability";
import { CafeDetail } from "./cafe-detail";
import { CafeContributionForm } from "./cafe-contribution-form";
import { useMapToast } from "./map-toast";
import { LiveNetworkBadge } from "./live-network-badge";
import { usePersonalTrail } from "@/hooks/use-personal-trail";
import { useOverlay } from "./overlay-context";

// Anything farther than this from the active city's centre is treated as
// "demo from afar" and the neighbourhood quick-picks stay visible.
const NEAR_CITY_KM = 50;

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Leaflet pulls in window; ssr: false keeps it client-only. While it loads we
// paint the schematic grid (the tier lines come from city config, not data)
// so the map reads as a network immediately instead of a blank spinner.
const MapLeaflet = dynamic(() => import("./map-leaflet"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 w-full h-full bg-cream overflow-hidden">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
        {TIER_ORDER.map((tier) => (
          <path
            key={tier}
            d={TIER_PATH[tier]}
            fill="none"
            stroke={TIER_COLOUR[tier]}
            strokeWidth={tier === "suspended" ? 14 : 16}
            strokeLinecap={tier === "suspended" ? "butt" : "round"}
            strokeLinejoin="round"
            strokeDasharray={tier === "suspended" ? "14 10" : undefined}
            opacity={0.14}
          />
        ))}
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <p className="font-mono text-[11px] tracking-[0.22em] uppercase text-ink-faint">
          plotting stations…
        </p>
      </div>
    </div>
  ),
});

type ViewMode = "schematic" | "geographic";

const TIER_BADGE: Record<Tier, string> = {
  express: "X",
  local: "L",
  suspended: "S",
};
const TIER_THRESHOLD: Record<Tier, string> = {
  express: "≥ 50 MBPS",
  local: "10 – 49",
  suspended: "< 10",
};
const TIER_ORDER: Tier[] = ["express", "local", "suspended"];

// ── Helpers ──────────────────────────────────────────────────────────────────

function NameLabel({ name, x, y }: { name: string; x: number; y: number }) {
  const [line1, line2] = splitName(name);
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fontFamily="var(--font-display)"
      fontWeight={800}
      fontSize={13}
      letterSpacing="0.04em"
      fill="var(--color-ink)"
      style={{ pointerEvents: "none" }}
    >
      <tspan x={x}>{line1}</tspan>
      {line2 && (
        <tspan x={x} dy={14}>
          {line2}
        </tspan>
      )}
    </text>
  );
}

// ── Schematic (SVG) layer ────────────────────────────────────────────────────

function SchematicLayer({
  cafes,
  waypoints,
  activeTiers,
  onSelect,
  trailPoints,
  arrivalId,
  checkins,
}: {
  cafes: CafeStation[];
  waypoints: ReturnType<typeof waypointsForCity>;
  activeTiers: Set<Tier>;
  onSelect: (cafe: CafeStation) => void;
  trailPoints?: Array<{ x: number; y: number }>;
  /** Cafe id that just arrived — gets an arrival ring + pop. */
  arrivalId?: string | null;
  /** Check-in data for verification indicators. */
  checkins?: Record<string, { verified: boolean }>;
}) {
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="w-full h-full bg-cream"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Schematic network — stations across three speed tiers"
    >
      {/* Three line tracks — inactive tiers fade to a hint of themselves */}
      {TIER_ORDER.map((tier) => {
        const active = activeTiers.has(tier);
        return (
          <path
            key={tier}
            d={TIER_PATH[tier]}
            fill="none"
            stroke={TIER_COLOUR[tier]}
            strokeWidth={tier === "suspended" ? 14 : 16}
            strokeLinecap={tier === "suspended" ? "butt" : "round"}
            strokeLinejoin="round"
            strokeDasharray={tier === "suspended" ? "14 10" : undefined}
            opacity={active ? (tier === "suspended" ? 0.85 : 1) : 0.08}
            style={{ pointerEvents: "none", transition: "opacity 300ms" }}
          />
        );
      })}

      {/* Personal trail — the contributor's own line, drawn under the
          stations they've mapped, in ink with a dotted cadence. */}
      {trailPoints && trailPoints.length >= 2 && (
        <path
          d={trailPath(trailPoints)}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth={3}
          strokeDasharray="2 6"
          strokeLinecap="round"
          opacity={0.55}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Tier badges + thresholds + inline "what this line means" copy —
          slightly faded when their tier is off */}
      {TIER_ORDER.map((tier, i) => {
        const y = 220 + i * 160;
        const active = activeTiers.has(tier);
        return (
          <g
            key={`badge-${tier}`}
            style={{
              pointerEvents: "none",
              opacity: active ? 1 : 0.3,
              transition: "opacity 300ms",
            }}
          >
            <rect
              x={36}
              y={y - 20}
              width={44}
              height={40}
              rx={6}
              fill={TIER_COLOUR[tier]}
            />
            <text
              x={58}
              y={y + 8}
              textAnchor="middle"
              fontFamily="var(--font-display)"
              fontWeight={900}
              fontSize={24}
              fill="var(--color-cream)"
            >
              {TIER_BADGE[tier]}
            </text>
            {/* Inline translation — what the line means, no legend needed. */}
            <text
              x={96}
              y={y - 2}
              fontFamily="var(--font-serif)"
              fontStyle="italic"
              fontSize={14}
              fill="var(--color-ink-soft)"
            >
              {TIER_USE[tier]}
            </text>
            <text
              x={1408}
              y={y + 4}
              textAnchor="end"
              fontFamily="var(--font-mono)"
              fontWeight={500}
              fontSize={11}
              letterSpacing="0.18em"
              fill="var(--color-ink-soft)"
            >
              {TIER_THRESHOLD[tier]}
            </text>
          </g>
        );
      })}

      {/* Ghost pin — when a tier has zero visible stations, invite the
          first mapping right on the line where it's missing. */}
      {TIER_ORDER.filter((t) => activeTiers.has(t)).map((tier) => {
        const hasStation = cafes.some((c) => c.tier === tier);
        if (hasStation) return null;
        const ghost = ghostForTier(tier);
        return (
          <g
            key={`ghost-${tier}`}
            transform={`translate(${ghost.x},${ghost.y})`}
            className="ghost-pin"
            style={{ pointerEvents: "none" }}
          >
            <circle r={12} fill="none" stroke={TIER_COLOUR[tier]} strokeWidth={2.5} strokeDasharray="4 4" />
            <text x={0} y={-20} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={10} letterSpacing="0.14em" fill={TIER_COLOUR[tier]}>
              BE THE FIRST →
            </text>
          </g>
        );
      })}

      {/* Stations — filtered out entirely when their tier is off */}
      {cafes.filter((c) => activeTiers.has(c.tier)).map((cafe) => {
        const pos = waypoints[cafe.name];
        if (!pos) return null;
        const stroke =
          cafe.tier === "suspended"
            ? "var(--color-suspended-ink)"
            : "var(--color-ink)";
        const tint = TIER_TINT[cafe.tier];
        const justArrived = arrivalId === cafe.id;
        const staleOpacity = stalenessOpacity(cafe.lastReadingAt);
        const isStale = needsFreshTest(cafe.lastReadingAt);
        const hasCheckIn = checkins?.[cafe.id]?.verified ?? false;
        return (
          <g
            key={cafe.id}
            data-cafe-id={cafe.id}
            transform={`translate(${pos.x},${pos.y})`}
            onClick={() => onSelect(cafe)}
            role="button"
            tabIndex={0}
            aria-label={`Open ${cafe.name} details`}
            style={{ cursor: "pointer", opacity: staleOpacity, transition: "opacity 400ms" }}
            className={`group ${justArrived ? "station-arrive" : ""}`}
          >
            {/* Arrival ring — radiates once when this station just landed. */}
            {justArrived && (
              <circle
                r={12}
                fill="none"
                stroke={TIER_COLOUR[cafe.tier]}
                strokeWidth={3}
                className="arrival-ring"
                style={{ pointerEvents: "none" }}
              />
            )}
            <circle r={26} fill="transparent" stroke="transparent" />
            <circle
              r={18}
              fill={tint}
              opacity={0}
              className="transition-opacity duration-200 group-hover:opacity-50"
            />
            <text
              x={0}
              y={-22}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontWeight={600}
              fontSize={12}
              fill={TIER_COLOUR[cafe.tier]}
              letterSpacing="0.04em"
              style={{ pointerEvents: "none" }}
            >
              {Math.round(cafe.medianDownMbps)}
            </text>
            <circle
              r={12}
              fill="var(--color-cream)"
              stroke={stroke}
              strokeWidth={3}
              className="transition-transform duration-200 group-hover:scale-110"
              style={{ transformOrigin: "0 0", transformBox: "fill-box" }}
            />
            {/* Personal-trail marker — a small ink square so the contributor
                recognises their own stops at a glance. */}
            {trailPoints?.some((p) => p.x === pos.x && p.y === pos.y) && (
              <rect x={-3.5} y={-3.5} width={7} height={7} fill="var(--color-ink)" style={{ pointerEvents: "none" }} />
            )}
            {/* Stability ring — visible only when auto-test data exists.
                Green = stable, amber = variable, red = unstable. */}
            {(() => {
              const s = assessStability(cafe.medianJitterMs, cafe.medianLossPct);
              if (!s.hasData) return null;
              return (
                <circle
                  r={16}
                  fill="none"
                  stroke={STABILITY_COLOUR[s.stability]}
                  strokeWidth={2}
                  opacity={0.7}
                  style={{ pointerEvents: "none" }}
                />
              );
            })()}
            {/* Verification indicator — a small check mark when the user
                has checked in at this station (local data only). */}
            {hasCheckIn && (
              <g style={{ pointerEvents: "none" }}>
                <circle cx={10} cy={-10} r={6} fill="var(--color-express)" />
                <text x={10} y={-7} textAnchor="middle" fontFamily="var(--font-mono)" fontWeight={700} fontSize={9} fill="var(--color-cream)">✓</text>
              </g>
            )}
            {/* Staleness watermark — "stale" text when the station needs
                a fresh test. */}
            {isStale && (
              <text
                x={0}
                y={42}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fontSize={8}
                letterSpacing="0.14em"
                fill="var(--color-suspended)"
                opacity={0.6}
                style={{ pointerEvents: "none" }}
              >
                STALE
              </text>
            )}
            <NameLabel name={cafe.name} x={0} y={30} />
          </g>
        );
      })}
    </svg>
  );
}

// Smooth path through the contributor's trail points (west-to-east).
function trailPath(points: Array<{ x: number; y: number }>): string {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  if (sorted.length < 2) return "";
  let d = `M ${sorted[0].x} ${sorted[0].y}`;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const cx = (prev.x + curr.x) / 2;
    d += ` Q ${prev.x} ${prev.y}, ${cx} ${(prev.y + curr.y) / 2}`;
  }
  d += ` T ${sorted[sorted.length - 1].x} ${sorted[sorted.length - 1].y}`;
  return d;
}

// Where to drop the "be the first" ghost pin for an empty tier.
function ghostForTier(tier: Tier): { x: number; y: number } {
  return { express: { x: 720, y: 410 }, local: { x: 660, y: 460 }, suspended: { x: 720, y: 500 } }[tier];
}

// ── Component ────────────────────────────────────────────────────────────────

type LocateStatus = "idle" | "pending" | "here" | "far" | "denied" | "unavailable";

export function MapShell({
  cafes,
  city = "nairobi",
  readingFlash = false,
  readingFlashText = "",
}: {
  cafes: CafeStation[];
  city?: CityId;
  /** When a realtime reading lands, LiveMap briefly swaps the resting live
      badge in the bottom rail for a flash ticket — the flash *replaces* the
      badge instead of overlaying it, so the corner never stacks. */
  readingFlash?: boolean;
  readingFlashText?: string;
}) {
  const cityConfig = CITIES[city];
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useMapToast();
  const { trail, addToTrail } = usePersonalTrail();
  const checkinData = useCheckins();

  // Optimistic stations — dropped onto the map the moment a contribution is
  // submitted, before the API round-trips. Merged with the prop cafés.
  const [optimistic, setOptimistic] = useState<CafeStation[]>([]);
  const [arrivalId, setArrivalId] = useState<string | null>(null);

  const allCafes = useMemo(
    () => (optimistic.length ? [...cafes, ...optimistic] : cafes),
    [cafes, optimistic],
  );
  const waypoints = useMemo(() => waypointsForCity(allCafes, city), [allCafes, city]);

  // `?hood=<id>` deep link — start on the geographic view focused on that
  // neighbourhood. Resolved at render time (lazy init) so no post-mount
  // setState is needed.
  const hoodFocus = useMemo(() => {
    const hood = searchParams.get("hood");
    if (!hood) return null;
    const match = cityConfig.demoLocations.find(
      (d) => d.id === hood || d.name.toLowerCase() === hood.toLowerCase(),
    );
    return match ? { lat: match.lat, lng: match.lng, label: match.name } : null;
  }, [searchParams, cityConfig.demoLocations]);
  const { active, open, close } = useOverlay();
  const [view, setView] = useState<ViewMode>(() => (hoodFocus ? "geographic" : "schematic"));
  // Leaflet initialisation is heavy, so we lazy-mount it on first switch to
  // geographic and keep it alive afterwards. Keeping both layers mounted
  // (rather than swapping them) is what lets the mode switch crossfade
  // instead of hard-cutting between two differently-sized roots.
  const [leafletEverMounted, setLeafletEverMounted] = useState(
    () => view === "geographic",
  );
  const [selected, setSelected] = useState<CafeStation | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; label: string } | null>(hoodFocus);
  const [locStatus, setLocStatus] = useState<LocateStatus>("idle");
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  // URL-as-state: a `?tier=` deep link pre-filters the map to a single line.
  const [activeTiers, setActiveTiers] = useState<Set<Tier>>(() => {
    const t = searchParams.get("tier");
    if (t === "express" || t === "local" || t === "suspended") return new Set([t]);
    return new Set(["express", "local", "suspended"]);
  });

  // Mirror the active tier filter back into the URL so the view is shareable.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (activeTiers.size === 3) url.searchParams.delete("tier");
    else url.searchParams.set("tier", [...activeTiers][0] ?? "");
    window.history.replaceState({}, "", url.toString());
  }, [activeTiers]);

  // The contributor's own line, resolved to schematic waypoint coords.
  const trailPoints = useMemo(() => {
    const mine = trail[city] ?? [];
    return mine.flatMap((p) => {
      const w = waypoints[p.name];
      return w ? [{ x: w.x, y: w.y }] : [];
    });
  }, [trail, city, waypoints]);

  // ── Arrival & promotion detection ────────────────────────────────────────
  // When the prop cafés change (realtime refetch), diff against the previous
  // snapshot: a brand-new venue gets an arrival ring; a venue whose tier
  // climbed (more readings pushed its median up) gets a promotion toast —
  // the "this station just got an express upgrade" ceremony.
  const prevCafesRef = useRef<Map<string, CafeStation> | null>(null);
  useEffect(() => {
    const prev = prevCafesRef.current;
    prevCafesRef.current = new Map(cafes.map((c) => [c.id, c]));
    if (!prev || cafes.length === 0) return;

    const timers: Array<ReturnType<typeof setTimeout>> = [];
    for (const cafe of cafes) {
      const was = prev.get(cafe.id);
      if (!was) {
        // New station that arrived via the live stream (not our own
        // optimistic drop — those are tracked separately).
        setArrivalId(cafe.id);
        toast({
          tier: cafe.tier,
          title: `New station · ${cafe.name}`,
          body: `${Math.round(cafe.medianDownMbps)} Mbps just logged in ${cafe.neighbourhood}`,
        });
      } else if (TIER_RANK[cafe.tier] > TIER_RANK[was.tier]) {
        toast({
          tier: cafe.tier,
          title: `${cafe.name} upgraded`,
          body: `Enough readings — now riding the ${cafe.tier} line`,
        });
        setArrivalId(cafe.id);
      }
    }
    timers.push(setTimeout(() => setArrivalId(null), 1400));
    return () => timers.forEach(clearTimeout);
  }, [cafes, toast]);

  // Open the contribution modal automatically when the page is reached via
  // the top-nav "+ Map a café" CTA (?contribute=1). We react to the query
  // whenever it appears so same-page links also open the modal, then remove
  // it from the URL so a refresh does not re-trigger the modal.
  const shouldAutoOpen = searchParams.get("contribute") === "1";

  useEffect(() => {
    if (!shouldAutoOpen) return;
    open("contribute");
    const url = new URL(window.location.href);
    url.searchParams.delete("contribute");
    window.history.replaceState({}, "", url.toString());
  }, [shouldAutoOpen, open]);

  function toggleTier(tier: Tier) {
    setActiveTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  }

  function showAllTiers() {
    setActiveTiers(new Set(["express", "local", "suspended"]));
  }

  // Optimistic pin drop — called by the contribution form the moment the
  // speed test reading is in hand, BEFORE the POST /api/cafes round-trips.
  // The station appears on the map instantly (client-side), gets an arrival
  // ring, and is recorded on the contributor's personal trail. On API
  // success the real refetch replaces it; nothing is lost either way.
  const handleCafeCreated = useCallback(
    (input: {
      name: string;
      lat: number;
      lng: number;
      neighbourhood: string;
      downMbps: number;
      upMbps: number;
      latencyMs: number;
      photo?: string | null;
    }) => {
      const tier = tierForDown(input.downMbps);
      const id = `optimistic-${Date.now()}`;
      const station: CafeStation = {
        id,
        name: input.name,
        neighbourhood: input.neighbourhood,
        lat: input.lat,
        lng: input.lng,
        tier,
        medianDownMbps: input.downMbps,
        medianUpMbps: input.upMbps,
        medianLatencyMs: input.latencyMs,
        medianJitterMs: 0,
        medianLossPct: 0,
        measurementCount: 1,
        latestPhotoUrl: input.photo ?? null,
        vibe: "just mapped by you",
        city,
      };
      setOptimistic((prev) => [...prev, station]);
      setArrivalId(id);
      addToTrail(city, input.name, input.lat, input.lng);
      toast({
        tier,
        title: `${input.name} is on the map`,
        body: `${Math.round(input.downMbps)} Mbps · now riding the ${tier} line`,
      });
      setTimeout(() => setArrivalId(null), 1400);
    },
    [city, addToTrail, toast],
  );

  const tierCounts = TIER_ORDER.reduce<Record<Tier, number>>(
    (acc, t) => {
      acc[t] = allCafes.filter((c) => c.tier === t).length;
      return acc;
    },
    { express: 0, local: 0, suspended: 0 },
  );
  const allActive = activeTiers.size === 3;
  const noneActive = activeTiers.size === 0;

  function ensureGeographic() {
    if (view !== "geographic") setView("geographic");
    // Leaflet is lazy-mounted on first switch to geographic. The view
    // toggle handles this in its onClick, but ensureGeographic() is also
    // called from locateMe() and jumpTo() — without this, those paths
    // switch to geographic but leave a blank viewport (no Leaflet).
    setLeafletEverMounted(true);
  }

  function locateMe() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocStatus("unavailable");
      return;
    }
    setLocStatus("pending");
    ensureGeographic();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const d = haversineKm(here, cityConfig.centre);
        setDistanceKm(d);
        if (d > NEAR_CITY_KM) {
          setLocStatus("far");
          setFocus({ ...here, label: `You · ${Math.round(d).toLocaleString()} km away` });
        } else {
          setLocStatus("here");
          setFocus({ ...here, label: "You are here" });
        }
      },
      () => setLocStatus("denied"),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    );
  }

  function jumpTo(neighbourhood: (typeof cityConfig.demoLocations)[number]) {
    ensureGeographic();
    setFocus({
      lat: neighbourhood.lat,
      lng: neighbourhood.lng,
      label: `Demo · ${neighbourhood.name}`,
    });
    setLocStatus("here");
  }

  // Whether to surface the neighbourhood demo quick-picks. Show them when:
  //  - user is idle (haven't tried yet) — gentle prompt
  //  - user is far from Nairobi — meaningful fallback
  //  - permission denied / unavailable — only option
  const showDemoPicks =
    locStatus === "idle" || locStatus === "far" || locStatus === "denied" || locStatus === "unavailable";

  const locateLabel: Record<LocateStatus, string> = {
    idle: "Find me",
    pending: "Locating…",
    here: "Located",
    far: `You're far · pick a ${cityConfig.name} spot`,
    denied: "Permission denied",
    unavailable: "Geolocation unavailable",
  };

  return (
    <div className="relative w-full">
      {/* Tier filter chips — above the map. Click any to toggle, "All" resets.
          On narrow screens the chip labels collapse to keep the row to one line. */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={showAllTiers}
          aria-pressed={allActive}
          className={`px-2.5 sm:px-3 py-1.5 font-mono text-[10px] tracking-[0.22em] uppercase border transition-colors ${
            allActive
              ? "bg-ink text-cream border-ink"
              : "bg-cream text-ink-soft border-ink/30 hover:border-ink hover:text-ink"
          }`}
        >
          All<span className="hidden sm:inline"> lines</span>
        </button>
        {TIER_ORDER.map((tier) => {
          const active = activeTiers.has(tier);
          const bg =
            tier === "express"
              ? "bg-express"
              : tier === "local"
              ? "bg-local"
              : "bg-suspended";
          return (
            <button
              key={tier}
              type="button"
              onClick={() => toggleTier(tier)}
              aria-pressed={active}
              className={`pl-1.5 pr-2 sm:pl-2 sm:pr-3 py-1.5 inline-flex items-center gap-1.5 sm:gap-2 font-mono text-[10px] tracking-[0.22em] uppercase border transition-all ${
                active
                  ? "bg-cream text-ink border-ink"
                  : "bg-cream/60 text-ink-faint border-ink/15 hover:border-ink/40"
              }`}
            >
              <span
                className={`${bg} ${active ? "" : "opacity-30"} w-5 h-5 inline-flex items-center justify-center text-cream font-display font-black text-[12px]`}
              >
                {TIER_BADGE[tier]}
              </span>
              <span className="hidden sm:inline">{tier}</span>
              <span className={active ? "text-ink-faint" : "text-ink-faint/60"}>
                {tierCounts[tier]}
              </span>
            </button>
          );
        })}
        {/* The v9 "+ Map a café" CTA used to live here, but it collided with
            the absolute-positioned locate panel in the map's top-right
            corner. The v9.3 top-nav now carries the same action as a
            sticky, always-visible primary button — keeping it twice
            would just clutter the filter row and recreate the overlap. */}
      </div>

      {/* Map viewport + all map-local overlays — wrapped in one relative
          container so absolute-positioned controls (locate panel, bottom
          rail, tap hint) resolve against the viewport, not the outer
          MapShell which includes the filter row above. Without this wrapper
          the locate panel's top-2 was the top of the filter row, not the
          top of the map, overlapping chips on mobile. */}
      <div className="relative">
      {/* Shared map viewport — both modes render inside one fixed-height
          frame (see .map-viewport) so switching never resizes the page. The
          two layers overlap and crossfade instead of being swapped out, which
          removes the hard cut the reviewer flagged as the main transition
          problem on mobile. Schematic sits on top (z-10) but becomes
          pointer-transparent when geographic is active so the Leaflet map
          underneath stays interactive. */}
      <div className="map-viewport relative w-full overflow-hidden bg-cream">
        {leafletEverMounted && (
          <div
            className={`absolute inset-0 transition-opacity duration-300 ${
              view === "geographic" ? "opacity-100" : "opacity-0"
            }`}
          >
            <MapLeaflet
              cafes={allCafes}
              onSelectStation={(cafe) => {
                setSelected(cafe);
                open("map-cafe");
              }}
              focusOn={focus}
              activeTiers={activeTiers}
              centre={cityConfig.centre}
              zoom={cityConfig.zoom}
            />
          </div>
        )}
        <div
          className={`absolute inset-0 z-10 transition-opacity duration-300 ${
            view === "schematic"
              ? "opacity-100"
              : "pointer-events-none opacity-0"
          }`}
        >
          <SchematicLayer
            cafes={allCafes}
            waypoints={waypoints}
            activeTiers={activeTiers}
            onSelect={(cafe) => {
              setSelected(cafe);
              open("map-cafe");
            }}
            trailPoints={trailPoints}
            arrivalId={arrivalId}
            checkins={checkinData.checkins}
          />
        </div>
      </div>

      {noneActive && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none z-[400]">
          <p className="bg-cream border border-ink/80 px-4 py-2 font-mono text-[10px] tracking-[0.22em] uppercase text-ink-soft shadow-[3px_4px_0_0_var(--color-ink)]">
            All tiers hidden — click a chip to show stations
          </p>
        </div>
      )}

      {/* Locate panel — top-right of the map. On mobile the demo picks
          collapse behind a disclosure to keep the map readable; on
          desktop the full panel is always visible. */}
      <div className="absolute top-2 right-2 sm:top-3 sm:right-3 md:top-4 md:right-4 z-[500] pointer-events-auto w-[190px] sm:max-w-[260px] sm:w-auto md:max-w-[300px]">
        <div className="bg-cream/95 border border-ink/80 shadow-[3px_4px_0_0_var(--color-ink)] sm:shadow-[4px_5px_0_0_var(--color-ink)] font-mono text-[10px] tracking-[0.2em] uppercase">
          <button
            type="button"
            onClick={locateMe}
            disabled={locStatus === "pending"}
            className="w-full px-2.5 sm:px-3 py-2 flex items-center justify-between gap-2 sm:gap-3 bg-ink text-cream hover:bg-ink-soft disabled:opacity-60 transition-colors"
          >
            <span className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <span aria-hidden>◎</span>
              <span className="truncate">{locateLabel[locStatus]}</span>
            </span>
            {distanceKm !== null && locStatus !== "pending" && (
              <span className="text-cream/70 whitespace-nowrap">
                {distanceKm < 1
                  ? "<1 km"
                  : `${Math.round(distanceKm).toLocaleString()} km`}
              </span>
            )}
          </button>

          {/* On mobile, demo picks are hidden by default. Only the "far"
              and "denied/unavailable" states open them automatically —
              that's where the user clearly needs them. */}
          {showDemoPicks && (
            <div
              className={`px-2.5 sm:px-3 py-2 border-t border-ink/20 ${
                locStatus === "idle" ? "hidden sm:block" : ""
              }`}
            >
              <p className="text-ink-faint mb-1.5 tracking-[0.18em]">
                {locStatus === "far"
                  ? `Demo from a ${cityConfig.name} neighbourhood`
                  : locStatus === "denied" || locStatus === "unavailable"
                  ? "Pick a demo spot"
                  : "Or jump in"}
              </p>
              <div className="grid grid-cols-2 gap-1">
                {cityConfig.demoLocations.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => jumpTo(n)}
                    className="px-2 py-1.5 text-left text-ink-soft hover:text-ink hover:bg-cream-edge transition-colors border border-ink/15 normal-case tracking-normal font-mono text-[10px]"
                  >
                    {n.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom control rail — view toggle + live status share one strip.
          Previously the toggle, the live badge, and the realtime flash all
          used the same bottom-left coordinates and stacked on top of each
          other. Now they live in a single flex row. When a reading lands,
          the flash ticket replaces the resting badge in the same slot rather
          than overlaying it, so nothing ever collides. */}
      <div className="absolute bottom-2 left-2 sm:bottom-4 sm:left-4 z-[500] flex items-end gap-2 pointer-events-none">
        <div
          role="tablist"
          aria-label="Map view"
          className="pointer-events-auto flex items-center gap-1 bg-cream/95 border border-ink/80 p-1 font-mono text-[10px] tracking-[0.2em] uppercase shadow-sm"
        >
          {(["schematic", "geographic"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={view === mode}
              onClick={() => {
                setView(mode);
                // Lazy-mount Leaflet on first switch to geographic (kept
                // alive afterwards); driven from the click, not an effect,
                // to avoid a cascading render.
                if (mode === "geographic") setLeafletEverMounted(true);
              }}
              className={`px-2.5 py-1.5 transition-colors ${
                view === mode
                  ? "bg-ink text-cream"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {/* Full labels on sm+, abbreviations on the narrowest
                  phones — "schematic" and "geographic" are ~10 chars
                  each and consume the full 272px available at 320px
                  before the status slot even renders. */}
              <span className="hidden sm:inline">{mode}</span>
              <span className="sm:hidden">
                {mode === "schematic" ? "Map" : "Geo"}
              </span>
            </button>
          ))}
        </div>

        {/* Live status slot — the flash ticket takes over while a reading is
            landing; otherwise the resting badge (or nothing, when offline).
            The resting badge is hidden below sm to preserve rail width on
            the narrowest phones; the flash ticket still shows because it's
            important realtime feedback. min-w-0 lets the slot shrink rather
            than push the rail past the viewport edge. */}
        <div className="min-w-0">
        {readingFlash ? (
          <div
            aria-live="polite"
            className="pointer-events-none inline-flex items-center gap-2 border border-express bg-express text-cream px-2.5 py-1.5 shadow-[3px_4px_0_0_var(--color-ink)] transition-all duration-300"
          >
            <span className="inline-block h-1.5 w-1.5 bg-cream" aria-hidden />
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] max-w-[42vw] sm:max-w-[220px] truncate">
              {readingFlashText}
            </span>
          </div>
        ) : (
          <div className="hidden sm:block">
            <LiveNetworkBadge variant="map" />
          </div>
        )}
        </div>
      </div>

      {/* Tap-target hint, bottom-right */}
      <p
        aria-hidden
        className="absolute bottom-4 right-4 z-[500] font-mono text-[9px] tracking-[0.24em] uppercase text-ink-faint pointer-events-none"
      >
        {view === "schematic" ? "tap any station →" : "tap any pin →"}
      </p>
      </div>

      <CafeDetail
        station={active === "map-cafe" ? selected : null}
        onClose={() => {
          setSelected(null);
          close();
        }}
      />

      {active === "contribute" && (
        <CafeContributionForm
          currentCity={city}
          onClose={close}
          onCreated={handleCafeCreated}
          onSuccess={(slug) => {
            close();
            // Linger on the map so the contributor sees their pin land
            // (already dropped optimistically), then take them to the
            // new venue page.
            toast({ title: "Reading verified", body: "Opening your new station…" });
            setTimeout(() => router.push(`/cafes/${slug}`), 1200);
          }}
        />
      )}
    </div>
  );
}
