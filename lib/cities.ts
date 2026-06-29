// City registry — single source of truth for the (currently 2) supported
// cities. Adding a third city is: append an entry here, seed the cafés
// with city: that id, add the route at app/{id}/page.tsx.

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
  /** Path the home redirects to when this city is selected from the
   *  switcher. Nairobi is "/" since the project started there; everyone
   *  else lives at /{id}. */
  path: string;
  /** Quick-pick neighbourhoods exposed on the locate panel. */
  demoLocations: Array<{ id: string; name: string; lat: number; lng: number }>;
}

export const CITIES: Record<CityId, CityConfig> = {
  nairobi: {
    id: "nairobi",
    name: "Nairobi",
    country: "Kenya",
    centre: { lat: -1.292, lng: 36.77 },
    zoom: 12,
    bounds: { south: -1.45, west: 36.65, north: -1.15, east: 36.95 },
    path: "/",
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
    path: "/sf",
    demoLocations: [
      { id: "soma", name: "SOMA", lat: 37.7833, lng: -122.4054 },
      { id: "mission", name: "Mission", lat: 37.7599, lng: -122.4148 },
      { id: "hayes", name: "Hayes Valley", lat: 37.7765, lng: -122.4262 },
      { id: "marina", name: "Marina", lat: 37.7993, lng: -122.4368 },
    ],
  },
};

export const CITY_ORDER: CityId[] = ["nairobi", "sf"];
