// ─────────────────────────────────────────────────────────────────────────────
// Map data layer — shared between cinematic-map.tsx and transit-map.tsx.
// Viewbox constants, tier paths, station waypoints, neighbourhoods, and the
// world-city constellation used by the global finale.
// ─────────────────────────────────────────────────────────────────────────────

import type { Neighbourhood, Tier } from "./types";

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
// Keyed by café NAME (not id) so the cinematic resolves correctly against
// either mock data or live Aurora rows. UUIDs change between environments;
// names don't.

export const STATION_WAYPOINT: Record<
  string,
  { x: number; y: number; progress: number }
> = {
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

// ── Geographic tier connectors ────────────────────────────────────────────────
// For the geographic view, we build smooth curves through the projected
// station points of each tier. These are generated at runtime — see
// cinematic-map.tsx.

// ── World-city constellation (global finale) ──────────────────────────────────

export type WorldCity = {
  id: string;
  name: string;
  country: string;
  // Normalized 0-1 position on the world stage (lon/lat → t).
  x: number;
  y: number;
  // Number of "stations" — purely for visual density of the dot.
  stations: number;
  lit: boolean; // Nairobi is lit at the start; others light up in the finale.
};

// A stylized continent outline as a single path d-attribute, drawn in the
// finale background to give the constellation geographic context.
export const WORLD_OUTLINE_D =
  "M 180 200 C 220 170 280 165 320 180 C 360 195 380 230 390 270 C 400 310 380 350 350 380 C 310 410 250 415 210 395 C 170 375 150 330 155 285 C 158 250 165 220 180 200 Z " +
  "M 430 180 C 470 165 530 170 570 195 C 600 215 615 250 610 290 C 605 330 575 360 535 365 C 490 370 450 350 430 315 C 415 285 415 245 430 180 Z " +
  "M 640 220 C 680 200 750 205 790 235 C 820 260 830 300 815 335 C 795 370 750 385 705 375 C 660 365 635 335 630 295 C 628 265 632 240 640 220 Z " +
  "M 870 250 C 910 235 970 240 1010 265 C 1040 285 1050 315 1035 345 C 1015 375 970 385 925 375 C 885 365 865 340 862 305 C 861 285 865 265 870 250 Z " +
  "M 1070 200 C 1120 185 1200 190 1250 220 C 1290 245 1310 285 1295 325 C 1275 365 1225 385 1170 380 C 1115 375 1075 350 1065 310 C 1060 280 1065 250 1070 200 Z";

// Cities positioned on the same 1440×720 stage. Coordinates are hand-placed
// to sit on top of the stylized continent outline above.
export const WORLD_CITIES: WorldCity[] = [
  // Nairobi — the origin, already lit.
  { id: "nairobi", name: "Nairobi", country: "Kenya", x: 820, y: 360, stations: 12, lit: true },
  // African capitals — the "next stops" from the page tail, made literal.
  { id: "lagos", name: "Lagos", country: "Nigeria", x: 470, y: 330, stations: 0, lit: false },
  { id: "accra", name: "Accra", country: "Ghana", x: 380, y: 340, stations: 0, lit: false },
  { id: "kampala", name: "Kampala", country: "Uganda", x: 770, y: 340, stations: 0, lit: false },
  { id: "kigali", name: "Kigali", country: "Rwanda", x: 760, y: 380, stations: 0, lit: false },
  { id: "capetown", name: "Cape Town", country: "South Africa", x: 540, y: 460, stations: 0, lit: false },
  // A few global peers for the "twelve thousand" ambition.
  { id: "berlin", name: "Berlin", country: "Germany", x: 690, y: 215, stations: 0, lit: false },
  { id: "tokyo", name: "Tokyo", country: "Japan", x: 1230, y: 245, stations: 0, lit: false },
  { id: "nyc", name: "New York", country: "USA", x: 320, y: 230, stations: 0, lit: false },
  { id: "saopaulo", name: "São Paulo", country: "Brazil", x: 380, y: 410, stations: 0, lit: false },
  { id: "mumbai", name: "Mumbai", country: "India", x: 950, y: 290, stations: 0, lit: false },
  { id: "singapore", name: "Singapore", country: "Singapore", x: 1080, y: 330, stations: 0, lit: false },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

export function splitName(name: string): [string, string?] {
  const upper = name.toUpperCase();
  const words = upper.split(" ");
  if (words.length <= 2 && upper.length <= 16) return [upper];
  const splitAt = words.length <= 3 ? 1 : 2;
  return [words.slice(0, splitAt).join(" "), words.slice(splitAt).join(" ")];
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
