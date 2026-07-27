// City registry — single source of truth for the supported cities.
// Adding a city is: append an entry here, seed the cafés with city: that id,
// and the dynamic route at app/[city]/page.tsx will serve it automatically.

import type { CityId } from "./types";

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
