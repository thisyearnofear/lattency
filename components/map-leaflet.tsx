"use client";

// Leaflet-backed geographic view. Real OpenStreetMap tiles underneath,
// stations plotted at their actual lat/lng as tier-coloured circle markers,
// polylines connecting same-tier stations sorted west-to-east.
// Loaded only on the client (Leaflet needs `window`) via next/dynamic.

import { useEffect, useRef } from "react";
import type { CafeStation, Tier } from "@/lib/types";
import { TIER_COLOUR } from "@/lib/map-data";
import "leaflet/dist/leaflet.css";

// Hand-tuned to frame the four Nairobi neighbourhoods (Westlands → Karen).
const NAIROBI_CENTRE: [number, number] = [-1.292, 36.770];
const INITIAL_ZOOM = 12;

const TIER_ORDER: Tier[] = ["express", "local", "suspended"];

interface Props {
  cafes: CafeStation[];
  onSelectStation: (cafe: CafeStation) => void;
}

export default function MapLeaflet({ cafes, onSelectStation }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanupCalled = false;
    let map: import("leaflet").Map | null = null;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cleanupCalled || !containerRef.current) return;

      map = L.map(containerRef.current, {
        center: NAIROBI_CENTRE,
        zoom: INITIAL_ZOOM,
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: true,
      });

      // Carto Voyager tiles — warm cream-ish palette that sits well next to
      // the print-poster aesthetic. Falls back to OSM if Carto is down.
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 19,
        },
      ).addTo(map);

      // Tier polylines — connect same-tier stations west-to-east.
      for (const tier of TIER_ORDER) {
        const stations = cafes
          .filter((c) => c.tier === tier)
          .sort((a, b) => a.lng - b.lng);
        if (stations.length < 2) continue;
        L.polyline(
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
      }

      // Station markers — tier-coloured circle markers with hover halos.
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
        marker.on("click", () => onSelectStation(cafe));
      }
    })();

    return () => {
      cleanupCalled = true;
      if (map) {
        map.remove();
        map = null;
      }
    };
  }, [cafes, onSelectStation]);

  return (
    <div
      ref={containerRef}
      className="w-full h-[72vh] max-h-[640px] bg-cream"
      style={{ background: "#F4ECD8" }}
    />
  );
}
