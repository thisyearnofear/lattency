// Shared geo helpers — one canonical haversine so the map, directory, and
// check-in flows don't each carry their own copy.

/** WGS84 latitude bounds check — mirrors the server rule in POST /api/cafes. */
export function isValidLatitude(lat: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

/** WGS84 longitude bounds check — mirrors the server rule in POST /api/cafes. */
export function isValidLongitude(lng: number): boolean {
  return Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

/** Both halves of a coordinate pair are in range. */
export function isValidCoordinates(lat: number, lng: number): boolean {
  return isValidLatitude(lat) && isValidLongitude(lng);
}

// Geolocation policy — the browser permission prompt must only ever appear
// from an explicit click/tap ("Find me", "Share my location"). Mount effects,
// timers, and page heuristics must never trigger it; Chrome flags
// permission-request-on-load patterns and users can't grant what they
// weren't asked for deliberately.
export type GeoRequestTrigger = "user-gesture" | "auto";

/** Returns true only when the request originates from a user gesture. */
export function shouldRequestGeolocation(trigger: GeoRequestTrigger): boolean {
  return trigger === "user-gesture";
}

/** Great-circle distance in kilometres between two {lat, lng} points. */
export function haversineKm(
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
