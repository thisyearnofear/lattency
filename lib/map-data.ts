// ─────────────────────────────────────────────────────────────────────────────
// Map data layer — shared between map-shell.tsx and cinematic-map.tsx.
// Viewbox constants, tier paths, station waypoints, neighbourhoods, and the
// world-city constellation used by the global finale.
// ─────────────────────────────────────────────────────────────────────────────

import type { Neighbourhood, Tier } from "./types";

// Re-export so consumers can pull the tier union from the map layer alongside
// the tier colours/paths (speed-test-page imports it from here).
export type { Tier };

// ── Stage ────────────────────────────────────────────────────────────────────

export const VIEW_W = 1440;
export const VIEW_H = 720;
export const CENTER_X = VIEW_W / 2;
export const CENTER_Y = VIEW_H / 2;

// ── Colours ──────────────────────────────────────────────────────────────────

export const TIER_COLOUR: Record<Tier, string> = {
  express: "#006D45",
  local: "#C77F00",
  suspended: "#B23A48",
};

export const TIER_TINT: Record<Tier, string> = {
  express: "#9FC7B5",
  local: "#E8C98A",
  suspended: "#DDA0A4",
};

// What each line actually means for a person trying to work. Surfaced inline
// on station cards and schematic badges so the metro metaphor needs no legend.
export const TIER_USE: Record<Tier, string> = {
  express: "video calls OK",
  local: "email & browsing",
  suspended: "avoid for calls",
};

// Numeric rank used to detect tier promotions (suspended < local < express).
export const TIER_RANK: Record<Tier, number> = {
  express: 2,
  local: 1,
  suspended: 0,
};

/** Client-safe tier derivation — the same thresholds the backend uses. */
export function tierForDown(downMbps: number): Tier {
  return downMbps >= 50 ? "express" : downMbps >= 10 ? "local" : "suspended";
}

// ── Neighbourhoods ────────────────────────────────────────────────────────────

export type Hood = {
  id: Neighbourhood;
  label: string;
  ordinal: string;
  d: string;
  anchor: { x: number; y: number };
};

export const HOODS: Hood[] = [
  {
    id: "Westlands",
    label: "WESTLANDS",
    ordinal: "01",
    d: "M 80 130 L 380 110 L 440 240 L 390 340 L 90 340 Z",
    anchor: { x: 250, y: 96 },
  },
  {
    id: "Kilimani",
    label: "KILIMANI",
    ordinal: "02",
    d: "M 440 240 L 680 220 L 720 460 L 460 490 Z",
    anchor: { x: 560, y: 196 },
  },
  {
    id: "CBD",
    label: "CBD",
    ordinal: "03",
    d: "M 720 200 L 1000 190 L 1040 470 L 740 470 Z",
    anchor: { x: 860, y: 168 },
  },
  {
    id: "Karen",
    label: "KAREN",
    ordinal: "04",
    d: "M 1040 360 L 1360 350 L 1380 640 L 1060 640 Z",
    anchor: { x: 1210, y: 326 },
  },
];

// ── Tier paths (schematic view) ──────────────────────────────────────────────
// Bezier paths — Q endpoints match the station waypoints below.

export const TIER_PATH: Record<Tier, string> = {
  express:
    "M 100 220 Q 200 260, 300 280 Q 410 350, 520 380 Q 720 410, 900 320 Q 1060 360, 1200 540 Q 1280 580, 1340 580",
  local:
    "M 100 360 Q 170 340, 250 360 Q 300 370, 340 380 Q 410 400, 480 420 Q 660 460, 820 420 Q 950 460, 1080 560 Q 1140 600, 1180 600 Q 1260 620, 1340 620",
  suspended:
    "M 140 480 Q 360 500, 560 510 Q 720 500, 900 480 Q 1020 460, 1100 460",
};

// ── Geographic projection ─────────────────────────────────────────────────────
// Maps Nairobi lat/lng → SVG x/y inside the 1440×720 stage.
// Calibrated so the four neighbourhoods land in their schematic columns.

export const NAIROBI_BOUNDS = {
  // Slightly wider than the data so nothing kisses the edge.
  minLng: 36.70,
  maxLng: 36.83,
  minLat: -1.35,
  maxLat: -1.25,
};

export function projectLatLng(
  lat: number,
  lng: number,
): { x: number; y: number } {
  const { minLng, maxLng, minLat, maxLat } = NAIROBI_BOUNDS;
  const padX = 90;
  const padY = 110;
  const usableW = VIEW_W - padX * 2;
  const usableH = VIEW_H - padY * 2 - 40; // leave room for bottom chrome
  const tLng = (lng - minLng) / (maxLng - minLng);
  const tLat = (lat - minLat) / (maxLat - minLat);
  // lng → x (east right), lat → y (north up, so invert)
  return {
    x: padX + tLng * usableW,
    y: padY + (1 - tLat) * usableH,
  };
}

// ── Station waypoints ─────────────────────────────────────────────────────────
// Per-cafe waypoint along its tier's *schematic* path (x/y and 0-1 progress).
// The geographic view derives positions from projectLatLng() at render time.
//
// Keyed by café NAME (not id) so it works against either mock data or live
// Aurora rows. UUIDs change between environments; names don't.
//
// Nairobi positions are hand-tuned for storytelling order (Westlands first,
// Karen last — neighbourhood-driven, not strictly geographic). New cities
// derive positions automatically via `computeWaypoints` below.

import type { CafeStation, CityId } from "./types";

export interface Waypoint {
  x: number;
  y: number;
  progress: number;
}

export const STATION_WAYPOINT: Record<string, Waypoint> = {
  // Express line — 4 stations end to end
  "Connect Coffee Roasters":    { x: 300,  y: 280, progress: 0.13 },
  "About Thyme":                { x: 520,  y: 380, progress: 0.42 },
  "Savanna Coffee Lounge":      { x: 900,  y: 320, progress: 0.68 },
  "Karen Blixen Coffee Garden": { x: 1200, y: 540, progress: 0.95 },

  // Local line — 6 stations across all four neighbourhoods
  "Java House Sarit Centre":    { x: 250,  y: 360, progress: 0.07 },
  "Artcaffe Westgate":          { x: 340,  y: 380, progress: 0.18 },
  "Kaldi's Coffee Yaya":        { x: 480,  y: 420, progress: 0.35 },
  "Java House Mama Ngina":      { x: 820,  y: 420, progress: 0.62 },
  "Talisman":                   { x: 1080, y: 560, progress: 0.84 },
  "Java House The Hub Karen":   { x: 1180, y: 600, progress: 0.93 },

  // Suspended line — 2 stations, dashed gaps between
  "Brew Bistro Kilimani":       { x: 560,  y: 510, progress: 0.50 },
  "Dormans Standard Street":    { x: 900,  y: 480, progress: 0.88 },
};

// ── Auto-layout ──────────────────────────────────────────────────────────────
// For cities other than Nairobi, derive schematic positions automatically:
// extract anchor points from each tier's Bezier path (the M endpoint plus
// each Q's endpoint = the points the curve actually passes through), skip
// the first + last (so lines extend past the outermost stations), sort
// stations by longitude west-to-east, and distribute evenly.
//
// This generalises to any city — the only per-city setup is adding cafés
// to mock-cafes.ts with the city tag.

// Quadratic segments (start anchor, control, end anchor) parsed from a path.
function extractQuadSegments(
  d: string,
): Array<{ p0: { x: number; y: number }; c: { x: number; y: number }; p1: { x: number; y: number } }> {
  const start = /M\s+([\d.-]+)\s+([\d.-]+)/.exec(d);
  if (!start) return [];
  let prev = { x: parseFloat(start[1]), y: parseFloat(start[2]) };
  const segs: Array<{ p0: { x: number; y: number }; c: { x: number; y: number }; p1: { x: number; y: number } }> = [];
  const regex = /Q\s+([\d.-]+)\s+([\d.-]+)\s*,\s*([\d.-]+)\s+([\d.-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(d)) !== null) {
    const c = { x: parseFloat(m[1]), y: parseFloat(m[2]) };
    const p1 = { x: parseFloat(m[3]), y: parseFloat(m[4]) };
    segs.push({ p0: prev, c, p1 });
    prev = p1;
  }
  return segs;
}

function quadAt(
  seg: { p0: { x: number; y: number }; c: { x: number; y: number }; p1: { x: number; y: number } },
  t: number,
): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: u * u * seg.p0.x + 2 * u * t * seg.c.x + t * t * seg.p1.x,
    y: u * u * seg.p0.y + 2 * u * t * seg.c.y + t * t * seg.p1.y,
  };
}

// Walk a polyline by arc length: t ∈ [0,1] → point that fraction of the way
// along the total length.
function pointAlong(
  points: Array<{ x: number; y: number }>,
  t: number,
): { x: number; y: number } {
  if (points.length === 1) return points[0];
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    lengths.push(d);
    total += d;
  }
  let target = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < lengths.length; i++) {
    if (target <= lengths[i] || i === lengths.length - 1) {
      const r = lengths[i] === 0 ? 0 : Math.min(1, target / lengths[i]);
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * r,
        y: points[i].y + (points[i + 1].y - points[i].y) * r,
      };
    }
    target -= lengths[i];
  }
  return points[points.length - 1];
}

/** Point a fraction `t` ∈ [0,1] along a tier's schematic Bezier, in VIEW_W×VIEW_H coords. */
export function pointAlongTier(tier: Tier, t: number): { x: number; y: number } {
  const segs = extractQuadSegments(TIER_PATH[tier]);
  const SAMPLES = 16;
  const polyline: Array<{ x: number; y: number }> = [quadAt(segs[0], 0)];
  segs.forEach((seg) => {
    for (let i = 1; i <= SAMPLES; i++) polyline.push(quadAt(seg, i / SAMPLES));
  });
  return pointAlong(polyline, t);
}

export function computeWaypoints(cafes: CafeStation[]): Record<string, Waypoint> {
  const out: Record<string, Waypoint> = {};
  (Object.keys(TIER_PATH) as Tier[]).forEach((tier) => {
    const segs = extractQuadSegments(TIER_PATH[tier]);
    const stations = cafes
      .filter((c) => c.tier === tier)
      .sort((a, b) => a.lng - b.lng);
    if (stations.length === 0 || segs.length === 0) return;
    // Interior of the curve — skip the first and last segment so the line
    // extends past the outermost stations. Flatten the remaining Beziers
    // into a polyline, then place stations by even arc length so two
    // stations can never share coordinates (the old anchor-snapping
    // produced identical positions when stations outnumbered anchors,
    // stacking their labels).
    const interior = segs.length > 2 ? segs.slice(1, -1) : segs;
    const SAMPLES = 16;
    const polyline: Array<{ x: number; y: number }> = [quadAt(interior[0], 0)];
    interior.forEach((seg) => {
      for (let i = 1; i <= SAMPLES; i++) polyline.push(quadAt(seg, i / SAMPLES));
    });
    stations.forEach((cafe, i) => {
      const t = stations.length === 1 ? 0.5 : i / (stations.length - 1);
      const point = pointAlong(polyline, t);
      out[cafe.name] = { x: point.x, y: point.y, progress: t };
    });
  });
  return out;
}

/**
 * Resolves waypoints for a city. Nairobi returns the hand-tuned canonical
 * positions; everywhere else gets auto-layout. Callers pass the full cafe
 * list and we filter to the city internally.
 */
export function waypointsForCity(
  cafes: CafeStation[],
  city: CityId,
): Record<string, Waypoint> {
  if (city === "nairobi") return STATION_WAYPOINT;
  return computeWaypoints(cafes.filter((c) => c.city === city));
}

// ── Geographic tier connectors ────────────────────────────────────────────────
// For the geographic view, we build smooth curves through the projected
// station points of each tier. These are generated at runtime — see
// cinematic-map.tsx.

// ── World-city constellation (global finale) ──────────────────────────────────

export type WorldCity = {
  id: string;
  name: string;
  country: string;
  // Projected pixel position on the 1440×720 world stage (see projectWorld).
  x: number;
  y: number;
  // Number of "stations" — purely for visual density of the dot.
  stations: number;
  lit: boolean; // Nairobi is lit at the start; others light up in the finale.
  // Optional label placement overrides to avoid collisions in dense clusters
  // (e.g. the Nairobi / Kampala / Kigali knot in East Africa).
  lx?: number;
  ly?: number;
  anchor?: "start" | "middle" | "end";
};

// Real-world land silhouette (Natural Earth, equirectangular) — see
// lib/world-path.ts. The finale draws this so the global ambition lands on
// recognizable geography rather than abstract shapes.
export { WORLD_LAND_D as WORLD_OUTLINE_D } from "./world-path";

// Equirectangular projection onto the full 1440×720 stage. Used for the world
// finale so a city's pixel position is its true position on the globe.
export function projectWorld(lat: number, lng: number): { x: number; y: number } {
  return {
    x: ((lng + 180) / 360) * VIEW_W,
    y: ((90 - lat) / 180) * VIEW_H,
  };
}

// Cities placed by their real lat/lng via projectWorld — so Nairobi sits on
// East Africa, Tokyo on Japan, New York on the US eastern seaboard, etc.
export const WORLD_CITIES: WorldCity[] = [
  // Nairobi — the origin, already lit. Label sits to the right of the knot.
  { id: "nairobi", name: "Nairobi", country: "Kenya", x: 867.3, y: 365.1, stations: 12, lit: true, lx: 14, ly: 4, anchor: "start" },
  // African capitals — the "next stops" from the page tail, made literal.
  { id: "lagos", name: "Lagos", country: "Nigeria", x: 733.6, y: 334.2, stations: 0, lit: false, lx: 0, ly: -12, anchor: "middle" },
  { id: "accra", name: "Accra", country: "Ghana", x: 719.2, y: 337.6, stations: 0, lit: false, lx: -10, ly: 8, anchor: "end" },
  { id: "kampala", name: "Kampala", country: "Uganda", x: 850.3, y: 358.8, stations: 0, lit: false, lx: -12, ly: -8, anchor: "end" },
  { id: "kigali", name: "Kigali", country: "Rwanda", x: 840.2, y: 367.8, stations: 0, lit: false, lx: -12, ly: 16, anchor: "end" },
  { id: "capetown", name: "Cape Town", country: "South Africa", x: 793.7, y: 495.7, stations: 0, lit: false },
  // A few global peers for the "twelve thousand" ambition.
  { id: "berlin", name: "Berlin", country: "Germany", x: 773.6, y: 149.9, stations: 0, lit: false },
  { id: "tokyo", name: "Tokyo", country: "Japan", x: 1278.6, y: 217.3, stations: 0, lit: false },
  { id: "nyc", name: "New York", country: "USA", x: 424.0, y: 197.2, stations: 0, lit: false },
  { id: "saopaulo", name: "São Paulo", country: "Brazil", x: 533.5, y: 454.2, stations: 0, lit: false },
  { id: "mumbai", name: "Mumbai", country: "India", x: 1011.5, y: 283.7, stations: 0, lit: false },
  { id: "singapore", name: "Singapore", country: "Singapore", x: 1135.3, y: 354.6, stations: 0, lit: false },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

export function splitName(name: string): [string, string?] {
  const upper = name.toUpperCase();
  const words = upper.split(" ");
  if (words.length === 1 || upper.length <= 16) return [upper];
  // Pick the split that minimizes the wider line — keeps labels compact so
  // they don't run into neighbouring stations.
  let best: [string, string] = [words[0], words.slice(1).join(" ")];
  let bestWidth = Infinity;
  for (let i = 1; i < words.length; i++) {
    const l1 = words.slice(0, i).join(" ");
    const l2 = words.slice(i).join(" ");
    const width = Math.max(l1.length, l2.length);
    if (width < bestWidth) {
      bestWidth = width;
      best = [l1, l2];
    }
  }
  return best;
}

/**
 * Build a smooth Catmull-Rom-into-bezier path through a set of points,
 * used by the geographic view to draw tier lines between projected cafés.
 * Returns an SVG path d-attribute string.
 */
export function smoothPathThrough(
  points: Array<{ x: number; y: number }>,
): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2)
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    // Catmull-Rom → cubic bezier conversion, tension 0.5.
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}
