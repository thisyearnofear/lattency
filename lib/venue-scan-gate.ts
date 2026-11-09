// Shared gating helpers for the venue-scan write routes (upload, process).
// Extracted from app/api/venue-scans/[id]/upload/route.ts so every route
// that mutates a scan resolves contributor → scan record → crew/backend/
// city access the same way, against the scan's own venue record.

import "server-only";
import {
  base44Configured,
  b44GetVenueScan,
  type B44VenueScanInternal,
} from "./base44-data";
import { resolveVenueCaptureAccess } from "./venue-capture-gate";
import { sanitizeContributorId } from "./measurements";
import { log } from "./log";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export type ScanRouteParams = { params: Promise<{ id: string }> };

export async function scanIdFrom(
  params: ScanRouteParams["params"],
): Promise<string | null> {
  const { id } = await params;
  return typeof id === "string" && id && id.length <= 128 ? id : null;
}

export async function scanJsonBody(
  req: Request,
): Promise<Record<string, unknown> | null> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return null;
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

/**
 * Shared gate for the scan write routes: contributor id → scan record →
 * contributor match → crew/backend/city access resolved from the scan's
 * venue. Returns the scan on success or a ready-made error response.
 */
export async function gateScanWrite(
  body: Record<string, unknown>,
  scanId: string,
  reqId: string | undefined,
  scope: string,
): Promise<
  | { ok: true; scan: B44VenueScanInternal; contributorId: string }
  | { ok: false; res: Response }
> {
  const contributorId = sanitizeContributorId(
    typeof body.contributor_id === "string" ? body.contributor_id : null,
  );
  if (!contributorId) {
    return {
      ok: false,
      res: Response.json({ error: "contributor_id required" }, { status: 400 }),
    };
  }

  if (!base44Configured) {
    return {
      ok: false,
      res: Response.json(
        { error: "venue capture backend unavailable" },
        { status: 503, headers: NO_STORE },
      ),
    };
  }

  let scan: B44VenueScanInternal | null;
  try {
    scan = await b44GetVenueScan(scanId);
  } catch (err) {
    log.error("venue-scan lookup failed", {
      reqId,
      scope,
      reason: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      res: Response.json(
        { error: "couldn't verify the scan — please try again" },
        { status: 503, headers: NO_STORE },
      ),
    };
  }
  if (!scan) {
    return {
      ok: false,
      res: Response.json({ error: "scan not found" }, { status: 404 }),
    };
  }
  // Writes can only land on the scan of the contributor who owns it.
  if (scan.contributorId && scan.contributorId !== contributorId) {
    return {
      ok: false,
      res: Response.json({ error: "contributor mismatch" }, { status: 403 }),
    };
  }

  // Crew + jurisdiction gates, resolved from the scan's venue record — a
  // client-supplied city would be meaningless here, so none is accepted.
  const access = await resolveVenueCaptureAccess({
    contributorId,
    venueId: scan.venueId,
    reqId,
    scope,
  });
  if (!access.ok) return access;
  return { ok: true, scan, contributorId };
}
