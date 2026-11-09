// Client-safe venue-scan types. Kept free of server-only imports (no
// `./base44`, no `server-only`) so client components like
// venue-tour-stamp.tsx can import from here — same convention as
// lib/bounty-types.ts.

// Pipeline states (capture run v2, docs/venue-3d-ux-research.md §7):
// captured → processing → preview → refining → published, with rejected /
// taken_down / superseded as exits. `superseded` marks a scan replaced by a
// newer run for the same venue (Scaniverse-style gap-fill/rescan).
export const VENUE_SCAN_STATUSES = [
  "captured",
  "processing",
  "preview",
  "refining",
  "published",
  "rejected",
  "taken_down",
  "superseded",
] as const;

export type VenueScanStatus = (typeof VENUE_SCAN_STATUSES)[number];

/** Statuses a reader may hear about — rejected, taken-down, and superseded
 *  scans never surface publicly (they're exits, not destinations). */
export const VENUE_SCAN_PUBLIC_STATUSES: readonly VenueScanStatus[] = [
  "captured",
  "processing",
  "preview",
  "refining",
  "published",
];

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

/** One frame-manifest entry — seq/timestamp/byte-size plus, since blob
 *  storage shipped (Phase 1), the `url` of the stored JPEG. Entries written
 *  before object storage landed carry no url. */
export interface VenueScanFrameRef {
  seq: number;
  ts: string;
  bytes: number;
  /** Vercel Blob URL of the stored frame (private access). */
  url?: string;
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
  /** 0–100 client-computed capture score (sharpness/coverage/pace). */
  qualityScore: number | null;
  /** Compass sectors the run recorded views in, e.g. ["N","NE","E"]. */
  coverageSectors: string[];
  /** Count of face-in-frame events flagged during the run. */
  faceEvents: number | null;
  /** Scan this run replaces (rescan / gap-fill), or null. */
  supersedesId: string | null;
  /** Frames the client reported at finalize time. */
  frameCount: number | null;
  /** Server-side manifest of frame chunks received (no image bytes). */
  framesReceived: VenueScanFrameRef[];
  created: string;
  updated: string;
}

/** Body of POST /api/venue-scans. The attestation booleans must both be
 *  true — the consent checkpoint is the trust mechanism, not a formality. */
export interface VenueScanSubmission {
  venueId: string;
  contributorId?: string;
  /** Raw capture asset location — null until blob storage ships. */
  captureAssetUrl?: string;
  /** Prior scan this run replaces; must reference the same venue. */
  supersedesId?: string;
  consentAttestation: {
    venue_permission: boolean;
    patron_notice: boolean;
    timestamp?: string;
  };
}

/** The only fields a reader may see — the gateway projection for
 *  publicly-visible scans. Pipeline status and quality are transparent;
 *  contributor identity, consent records, and the frame manifest are not.
 *  splat_url is projected only once status is `published`. */
export interface PublicVenueScan {
  id: string;
  venueId: string;
  splatUrl: string | null;
  status: VenueScanStatus;
  qualityScore: number | null;
  created: string | null;
}
