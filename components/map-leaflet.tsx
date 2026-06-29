"use client";

// Leaflet-backed geographic view. Real OpenStreetMap tiles underneath,
// stations plotted at their actual lat/lng as tier-coloured circle markers,
// polylines connecting same-tier stations sorted west-to-east.
// Loaded only on the client (Leaflet needs `window`) via next/dynamic.

import { useEffect, useRef } from "react";
import type {
  Map as LeafletMap,
  Marker as LeafletMarker,
  Layer as LeafletLayer,
} from "leaflet";
import type { CafeStation, Tier } from "@/lib/types";
import { TIER_COLOUR } from "@/lib/map-data";
import "leaflet/dist/leaflet.css";

const TIER_ORDER: Tier[] = ["express", "local", "suspended"];

interface Props {
  cafes: CafeStation[];
  onSelectStation: (cafe: CafeStation) => void;
  /** When set, drops a "you are here" marker and pans the map to it. */
  focusOn: { lat: number; lng: number; label: string } | null;
  /** Which tiers to display. Markers + polylines for hidden tiers are removed. */
  activeTiers: Set<Tier>;
  /** Map centre on first paint — varies per city. */
  centre: { lat: number; lng: number };
  /** Initial zoom — wider for smaller cities, tighter for sprawling ones. */
  zoom: number;
}

export default function MapLeaflet({
  cafes,
  onSelectStation,
  focusOn,
  activeTiers,
  centre,
  zoom,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const focusMarkerRef = useRef<LeafletMarker | null>(null);
  // Layers grouped by tier so we can toggle visibility without re-creating the map.
  const tierLayersRef = useRef<Record<Tier, LeafletLayer[]>>({
    express: [],
    local: [],
    suspended: [],
  });
  // Stash the callback in a ref so the init effect can call the latest one
  // without listing it as a dependency (otherwise we'd re-init the map on
  // every parent render). Updated via useEffect to satisfy react-hooks rules.
  const onSelectRef = useRef(onSelectStation);
  useEffect(() => {
    onSelectRef.current = onSelectStation;
  }, [onSelectStation]);

  // One-time map setup. cafes is the only data dependency.
  useEffect(() => {
    if (!containerRef.current) return;
    let cleanupCalled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cleanupCalled || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        center: [centre.lat, centre.lng],
        zoom,
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: true,
      });
      mapRef.current = map;

      // Carto Light tiles — warm cream-ish palette that sits well next to
      // the print-poster aesthetic.
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 19,
        },
      ).addTo(map);

      // Tier polylines — connect same-tier stations west-to-east. Each
      // polyline is stashed in tierLayersRef so visibility toggling can
      // add/remove it without re-creating the map.
      for (const tier of TIER_ORDER) {
        const stations = cafes
          .filter((c) => c.tier === tier)
          .sort((a, b) => a.lng - b.lng);
        if (stations.length < 2) continue;
        const line = L.polyline(
          stations.map((c) => [c.lat, c.lng] as [number, number]),
          {
            color: TIER_COLOUR[tier],
            weight: tier === "suspended" ? 4 : 5,
            opacity: tier === "suspended" ? 0.5 : 0.8,
            dashArray: tier === "suspended" ? "8 8" : undefined,
            lineCap: "round",
            lineJoin: "round",
          },
        ).addTo(map);
        tierLayersRef.current[tier].push(line);
      }

      // Station markers — cream-fill, ink-stroke circle markers.
      for (const cafe of cafes) {
        const marker = L.circleMarker([cafe.lat, cafe.lng], {
          radius: 9,
          color: "#1A1612",
          weight: 3,
          fillColor: "#F4ECD8",
          fillOpacity: 1,
          opacity: 1,
        }).addTo(map);

        const tierLabel = cafe.tier[0].toUpperCase() + cafe.tier.slice(1);
        const downMbps = Math.round(cafe.medianDownMbps);
        marker.bindTooltip(
          `<div style="font-family: var(--font-display, system-ui); font-weight: 800; text-transform: uppercase; font-size: 13px; letter-spacing: 0.04em; color: #1A1612;">${cafe.name}</div>
           <div style="font-family: var(--font-mono, ui-monospace); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: ${TIER_COLOUR[cafe.tier]}; margin-top: 2px;">${tierLabel} · ${downMbps} Mbps</div>
           <div style="font-family: var(--font-serif, serif); font-style: italic; font-size: 11px; color: #8A7F6B; margin-top: 2px;">${cafe.vibe || cafe.neighbourhood}</div>`,
          {
            direction: "top",
            offset: [0, -8],
            opacity: 1,
            className: "lattency-tooltip",
          },
        );
        marker.on("click", () => onSelectRef.current(cafe));
        tierLayersRef.current[cafe.tier].push(marker);
      }
    })();

    return () => {
      cleanupCalled = true;
      if (focusMarkerRef.current) {
        focusMarkerRef.current.remove();
        focusMarkerRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      tierLayersRef.current = { express: [], local: [], suspended: [] };
    };
    // centre/zoom are read on init only — we don't re-mount the map when they
    // change. Switching city unmounts MapShell entirely, so this is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cafes]);

  // Reactive: when the activeTiers set changes, add or remove the layers
  // for each tier from the map without rebuilding it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const tier of TIER_ORDER) {
      const want = activeTiers.has(tier);
      for (const layer of tierLayersRef.current[tier]) {
        if (want && !map.hasLayer(layer)) layer.addTo(map);
        else if (!want && map.hasLayer(layer)) layer.removeFrom(map);
      }
    }
  }, [activeTiers]);

  // Reactive: handle focus marker / pan whenever focusOn changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map = mapRef.current;
      if (!map) return;
      const L = (await import("leaflet")).default;
      if (cancelled) return;

      // Remove previous focus marker if any.
      if (focusMarkerRef.current) {
        focusMarkerRef.current.remove();
        focusMarkerRef.current = null;
      }
      if (!focusOn) return;

      // Inverted palette so the focus marker is distinct from station roundels:
      // ink interior, cream outline. Pulsing halo via a HTML divIcon overlay.
      const halo = L.divIcon({
        className: "lattency-focus-halo",
        html: `<div class="halo-ring"></div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });
      const haloMarker = L.marker([focusOn.lat, focusOn.lng], {
        icon: halo,
        interactive: false,
        keyboard: false,
      }).addTo(map);

      const dot = L.circleMarker([focusOn.lat, focusOn.lng], {
        radius: 8,
        color: "#F4ECD8",
        weight: 3,
        fillColor: "#1A1612",
        fillOpacity: 1,
        opacity: 1,
      }).addTo(map);
      dot.bindTooltip(focusOn.label, {
        direction: "top",
        offset: [0, -10],
        permanent: true,
        opacity: 1,
        className: "lattency-tooltip",
      });

      // Track both so cleanup removes them.
      focusMarkerRef.current = dot as unknown as LeafletMarker;
      // Stash the halo on the dot so we can remove it together.
      (focusMarkerRef.current as unknown as { _halo: LeafletMarker })._halo = haloMarker;

      // Pan / fit: if focusOn is near Nairobi (within ~30km of any café),
      // fit bounds; otherwise just pan to the focus point at a sensible zoom.
      const NEAR_KM = 30;
      const nearest = cafes
        .map((c) => ({ c, d: haversineKm(focusOn, { lat: c.lat, lng: c.lng }) }))
        .sort((a, b) => a.d - b.d)[0];

      if (nearest && nearest.d < NEAR_KM) {
        const bounds = L.latLngBounds([
          [focusOn.lat, focusOn.lng],
          ...cafes.slice(0, 4).map((c) => [c.lat, c.lng] as [number, number]),
        ]);
        map.flyToBounds(bounds, { padding: [40, 40], duration: 0.8, maxZoom: 14 });
      } else {
        map.flyTo([focusOn.lat, focusOn.lng], 13, { duration: 0.8 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [focusOn, cafes]);

  // Cleanup the halo when focus marker is removed (covers cleanup ref above).
  useEffect(() => {
    return () => {
      const marker = focusMarkerRef.current as unknown as
        | (LeafletMarker & { _halo?: LeafletMarker })
        | null;
      if (marker?._halo) marker._halo.remove();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-[72vh] max-h-[640px] bg-cream"
      style={{ background: "#F4ECD8" }}
    />
  );
}

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
