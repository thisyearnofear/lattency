// City registry — curated cities get hand-tuned schematic layouts.
// Any city can activate dynamically: app/[city]/page.tsx now resolves
// centre/zoom/bounds from the cafés that exist there.

import type { CafeStation, CityId } from "./types";

export interface CityConfig {
  id: CityId;
  /** Display name in nav, title bar, headings. */
  name: string;
  /** Country, used in metadata and city switcher. */
  country: string;
  /** Where Leaflet centres when this city is active. */
  centre: { lat: number; lng: number };
  /** Default Leaflet zoom for a sensible "see all stations" view. */
  zoom: number;
  /** Bounds covering the city's neighbourhoods. Used for fit-bounds and
   *  for the "is this geolocation near our city?" check. */
  bounds: { south: number; west: number; north: number; east: number };
  /** Quick-pick neighbourhoods exposed on the locate panel. */
  demoLocations: Array<{ id: string; name: string; lat: number; lng: number }>;
}

export interface LiveCity {
  id: CityId;
  name: string;
  country: string;
  count: number;
}

export const CITIES: Record<CityId, CityConfig> = {
  london: {
    id: "london",
    name: "London",
    country: "UK",
    centre: { lat: 51.525, lng: -0.077 },
    zoom: 15,
    bounds: { south: 51.515, west: -0.095, north: 51.535, east: -0.055 },
    demoLocations: [
      { id: "shoreditch", name: "Shoreditch", lat: 51.525, lng: -0.077 },
      { id: "hoxton", name: "Hoxton", lat: 51.53, lng: -0.08 },
      { id: "old-street", name: "Old Street", lat: 51.526, lng: -0.088 },
      { id: "bethnal-green", name: "Bethnal Green", lat: 51.524, lng: -0.061 },
    ],
  },
  nairobi: {
    id: "nairobi",
    name: "Nairobi",
    country: "Kenya",
    centre: { lat: -1.292, lng: 36.77 },
    zoom: 12,
    bounds: { south: -1.45, west: 36.65, north: -1.15, east: 36.95 },
    demoLocations: [
      { id: "westlands", name: "Westlands", lat: -1.262, lng: 36.806 },
      { id: "kilimani", name: "Kilimani", lat: -1.293, lng: 36.7891 },
      { id: "cbd", name: "CBD", lat: -1.285, lng: 36.8226 },
      { id: "karen", name: "Karen", lat: -1.331, lng: 36.7102 },
    ],
  },
  sf: {
    id: "sf",
    name: "San Francisco",
    country: "USA",
    centre: { lat: 37.776, lng: -122.42 },
    zoom: 12,
    bounds: { south: 37.7, west: -122.55, north: 37.83, east: -122.36 },
    demoLocations: [
      { id: "soma", name: "SOMA", lat: 37.7833, lng: -122.4054 },
      { id: "mission", name: "Mission", lat: 37.7599, lng: -122.4148 },
      { id: "hayes", name: "Hayes Valley", lat: 37.7765, lng: -122.4262 },
      { id: "marina", name: "Marina", lat: 37.7993, lng: -122.4368 },
    ],
  },
};

/** Curated cities, in display order. */
export const CITY_ORDER: CityId[] = ["london", "nairobi", "sf"];

/** Default city shown when a user lands on `/`. */
export const DEFAULT_CITY_ID: CityId = "london";

/** Returns the canonical route for a curated city. */
export function cityPath(cityId: CityId): string {
  return `/${cityId}`;
}

/** True when the city is one of the curated, seeded cities. */
export function isCuratedCity(cityId: string): cityId is CityId {
  return cityId in CITIES;
}

/** Convert a slug like "rio-de-janeiro" to "Rio De Janeiro" for display. */
export function cityDisplayName(cityId: string): string {
  return cityId
    .split(/[-_]/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

/** Compute a Leaflet centre from a set of cafés. */
function computeCentroid(cafes: CafeStation[]): { lat: number; lng: number } {
  if (cafes.length === 0) return { lat: 0, lng: 0 };
  const sum = cafes.reduce(
    (acc, c) => ({ lat: acc.lat + c.lat, lng: acc.lng + c.lng }),
    { lat: 0, lng: 0 },
  );
  return { lat: sum.lat / cafes.length, lng: sum.lng / cafes.length };
}

/** Compute a sensible Leaflet zoom from coordinate spread. */
function computeZoom(cafes: CafeStation[]): number {
  if (cafes.length === 0) return 3;
  if (cafes.length === 1) return 15;
  const lats = cafes.map((c) => c.lat);
  const lngs = cafes.map((c) => c.lng);
  const latSpread = Math.max(...lats) - Math.min(...lats);
  const lngSpread = Math.max(...lngs) - Math.min(...lngs);
  const maxSpread = Math.max(latSpread, lngSpread);
  if (maxSpread < 0.01) return 15;
  if (maxSpread < 0.05) return 14;
  if (maxSpread < 0.15) return 13;
  if (maxSpread < 0.4) return 12;
  if (maxSpread < 1.5) return 11;
  if (maxSpread < 5) return 10;
  return 9;
}

/** Compute bounds from café coordinates with a small padding. */
function computeBounds(cafes: CafeStation[]): CityConfig["bounds"] {
  if (cafes.length === 0) {
    return { south: -90, west: -180, north: 90, east: 180 };
  }
  const lats = cafes.map((c) => c.lat);
  const lngs = cafes.map((c) => c.lng);
  const pad = 0.01;
  return {
    south: Math.min(...lats) - pad,
    west: Math.min(...lngs) - pad,
    north: Math.max(...lats) + pad,
    east: Math.max(...lngs) + pad,
  };
}

/**
 * Resolve a city config for any slug.
 * Curated cities keep their hand-tuned config; all others derive centre,
 * zoom, bounds, and demo locations from the cafés that exist there.
 */
export function resolveCityConfig(
  cityId: string,
  cafes: CafeStation[],
): CityConfig {
  if (isCuratedCity(cityId)) {
    return CITIES[cityId];
  }
  const cityCafes = cafes.filter((c) => c.city === cityId);
  const centre = computeCentroid(cityCafes);
  const zoom = computeZoom(cityCafes);
  const bounds = computeBounds(cityCafes);
  // Derive demo locations from neighbourhood clusters, newest first.
  const neighbourhoodMap = new Map<string, { id: string; name: string; lat: number; lng: number }>();
  for (const cafe of cityCafes) {
    if (!neighbourhoodMap.has(cafe.neighbourhood)) {
      const id = cafe.neighbourhood.toLowerCase().replace(/\s+/g, "-");
      neighbourhoodMap.set(cafe.neighbourhood, {
        id,
        name: cafe.neighbourhood,
        lat: cafe.lat,
        lng: cafe.lng,
      });
    }
  }
  const demoLocations = Array.from(neighbourhoodMap.values()).slice(0, 6);

  return {
    id: cityId,
    name: cityDisplayName(cityId),
    country: "",
    centre,
    zoom,
    bounds,
    demoLocations,
  };
}

/**
 * Derive the list of cities that currently have cafés, merged with the
 * curated order so hand-tuned cities keep their position.
 */
export function getLiveCities(cafes: CafeStation[]): LiveCity[] {
  const byCity = new Map<CityId, LiveCity>();
  for (const cityId of CITY_ORDER) {
    const config = CITIES[cityId];
    byCity.set(cityId, { id: cityId, name: config.name, country: config.country, count: 0 });
  }
  for (const cafe of cafes) {
    const existing = byCity.get(cafe.city);
    if (existing) {
      existing.count += 1;
    } else {
      byCity.set(cafe.city, {
        id: cafe.city,
        name: cityDisplayName(cafe.city),
        country: "",
        count: 1,
      });
    }
  }
  return Array.from(byCity.values()).sort((a, b) => {
    const aOrder = CITY_ORDER.indexOf(a.id);
    const bOrder = CITY_ORDER.indexOf(b.id);
    if (aOrder !== -1 && bOrder !== -1) return aOrder - bOrder;
    if (aOrder !== -1) return -1;
    if (bOrder !== -1) return 1;
    return b.count - a.count || a.name.localeCompare(b.name);
  });
}
