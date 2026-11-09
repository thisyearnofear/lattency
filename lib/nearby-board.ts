// Pure decision helper for the "is there a live board near me?" nudge —
// extracted from components/near-you-city-nudge.tsx so the distance logic is
// testable without a browser. The component decides *when* to locate the
// user (user gesture only); this decides *what* to say once a fix arrives.

import { CITIES, CITY_ORDER } from "./cities";
import { haversineKm } from "./geo";

/** Rough "you're not near any live board" threshold. */
export const NEARBY_BOARD_FAR_KM = 80;

export type NearbyBoardHint =
  | { kind: "near"; cityId: string; cityName: string; km: number }
  | { kind: "far" }
  | null;

/**
 * Resolve the visitor's position against the curated boards:
 *  - inside the FAR_KM bubble of the city they're already viewing → null
 *    (nothing to nudge about),
 *  - inside the bubble of a different curated city → "near" hint for it,
 *  - outside every bubble → "far" hint.
 */
export function nearbyBoardHint(
  lat: number,
  lng: number,
  currentCity: string,
  farKm: number = NEARBY_BOARD_FAR_KM,
): NearbyBoardHint {
  let best: { id: string; name: string; km: number } | null = null;
  for (const id of CITY_ORDER) {
    const c = CITIES[id];
    const km = haversineKm(
      { lat, lng },
      { lat: c.centre.lat, lng: c.centre.lng },
    );
    if (!best || km < best.km) {
      best = { id, name: c.name, km };
    }
  }
  if (best && best.km <= farKm) {
    if (best.id !== currentCity) {
      return { kind: "near", cityId: best.id, cityName: best.name, km: best.km };
    }
    return null;
  }
  return { kind: "far" };
}
