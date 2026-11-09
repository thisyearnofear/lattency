export const VENUE_CAPTURE_PAUSED =
  "Venue capture is not live yet. 3D venue scans ship only after the consent checkpoint, pre-publication blur verification, and the owner-veto path are in place.";

export const VENUE_CAPTURE_JURISDICTION_DENIED =
  "Capture pilot is London-only for now";

export const VENUE_CAPTURE_CREW_DENIED = "Pilot crew only";

export function venueCaptureEnabled(): boolean {
  return process.env.VENUE_CAPTURE_ENABLED === "1";
}

function csvList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/** Pilot cities where scans may be created (VENUE_CAPTURE_CITIES,
 *  comma-separated city ids). Empty list = capture allowed nowhere. */
export function venueCaptureCities(): string[] {
  return csvList(process.env.VENUE_CAPTURE_CITIES);
}

/** Launch-jurisdiction gate. True only when the feature flag is on AND the
 *  venue's resolved city is on the pilot list. Callers must resolve the city
 *  server-side — a client-supplied hint is never trusted on its own. */
export function venueCaptureAllowedForCity(city: string | undefined): boolean {
  if (!venueCaptureEnabled() || !city) return false;
  return venueCaptureCities().includes(city.trim().toLowerCase());
}

/** Invite list for the pilot (VENUE_CAPTURE_CREW, comma-separated
 *  contributor ids). Unset/empty = no restriction while the flag is on. */
export function venueCaptureCrew(): string[] {
  return csvList(process.env.VENUE_CAPTURE_CREW);
}

export function venueCaptureCrewAllowed(contributorId: string): boolean {
  const crew = venueCaptureCrew();
  return crew.length === 0 || crew.includes(contributorId.trim().toLowerCase());
}

/** Client-safe twin of the jurisdiction list — NEXT_PUBLIC_VENUE_CAPTURE_CITIES
 *  decides where the capture affordances (link, tour stamp) render. Default:
 *  hidden everywhere. */
export function venueCaptureUiCityAllowed(city: string | undefined): boolean {
  if (!city) return false;
  return csvList(process.env.NEXT_PUBLIC_VENUE_CAPTURE_CITIES).includes(
    city.trim().toLowerCase(),
  );
}
