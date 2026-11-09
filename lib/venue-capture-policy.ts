export const VENUE_CAPTURE_PAUSED =
  "Venue capture is not live yet. 3D venue scans ship only after the consent checkpoint, pre-publication blur verification, and the owner-veto path are in place.";

export function venueCaptureEnabled(): boolean {
  return process.env.VENUE_CAPTURE_ENABLED === "1";
}
