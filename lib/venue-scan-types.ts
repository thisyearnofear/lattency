// Client-safe venue-scan types. Kept free of server-only imports (no
// `./base44`, no `server-only`) so client components like
// venue-tour-stamp.tsx can import from here — same convention as
// lib/bounty-types.ts.

export const VENUE_SCAN_STATUSES = [
  "captured",
  "processing",
  "published",
  "rejected",
  "taken_down",
] as const;

export type VenueScanStatus = (typeof VENUE_SCAN_STATUSES)[number];

/** Contributor's signed attestation, recorded verbatim on the entity in
 *  snake_case so the wire payload and the stored row read identically. */
export interface VenueScanConsentAttestation {
  /** Contributor affirms the venue permitted interior capture. */
  venue_permission: boolean;
  /** Contributor affirms patrons were notified (or none identifiable). */
  patron_notice: boolean;
  /** ISO timestamp of the attestation. */
  timestamp: string;
}

/** Full entity shape — server-side only in practice; nothing publishes
 *  contributor_id or consent details to readers. */
export interface VenueScan {
  id: string;
  venueId: string;
  contributorId: string | null;
  captureAssetUrl: string | null;
  consentAttestation: VenueScanConsentAttestation;
  status: VenueScanStatus;
  splatUrl: string | null;
  takedownRequested: boolean;
  blurVerified: boolean;
  created: string;
  updated: string;
}

/** Body of POST /api/venue-scans. The attestation booleans must both be
 *  true — the consent checkpoint is the trust mechanism, not a formality. */
export interface VenueScanSubmission {
  venueId: string;
  contributorId?: string;
  /** Raw capture asset location — null until the upload pipeline ships. */
  captureAssetUrl?: string;
  consentAttestation: {
    venue_permission: boolean;
    patron_notice: boolean;
    timestamp?: string;
  };
}

/** The only fields a reader may see — the gateway projection for published
 *  scans. Anything beyond this stays server-side. */
export interface PublicVenueScan {
  id: string;
  venueId: string;
  splatUrl: string | null;
  status: VenueScanStatus;
  created: string | null;
}
