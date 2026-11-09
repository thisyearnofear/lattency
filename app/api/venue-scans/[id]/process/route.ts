// POST /api/venue-scans/:id/process — the pipeline contract (Phase 1 infra,
// docs/venue-3d-ux-research.md §7). Two callers:
//
//   Contributor mode (no worker header): {contributor_id} — the same
//   flag+crew+city gate as the upload route, then the scan is marked
//   `processing` via the gateway's venue-scan-status action and an enqueue
//   POST is attempted at SCAN_WORKER_URL. Unset env = honest stub: the scan
//   sits at `processing` and the response reports `queued: false`.
//
//   Worker mode (x-scan-worker-key header): operator-trusted transitions.
//   The key is checked against SCAN_WORKER_KEY with the same constant-time
//   compare as the server↔Base44 gateway. The worker may request
//   processing/preview/refining/published/rejected (+ splat_url,
//   blur_verified) — the gateway state machine still validates every
//   transition, and `published` cannot land without splat_url AND
//   blur_verified === true.

import { NextRequest } from "next/server";
import {
  venueCaptureEnabled,
  VENUE_CAPTURE_PAUSED,
} from "@/lib/venue-capture-policy";
import { b44SetVenueScanStatus } from "@/lib/base44-data";
import { authorizeGateway } from "@/base44/shared/gateway-auth";
import {
  gateScanWrite,
  scanIdFrom,
  scanJsonBody,
  type ScanRouteParams,
} from "@/lib/venue-scan-gate";
import { log, reqIdFrom } from "@/lib/log";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const MAX_URL = 2048;

// Statuses a worker key may request. `captured` is the upload-side state,
// `taken_down` belongs to the owner-veto path, and `superseded` is set by
// the rescan insert path — none are worker-callable targets.
const WORKER_STATUSES = new Set([
  "processing",
  "preview",
  "refining",
  "published",
  "rejected",
]);

function paused(): Response {
  return Response.json(
    { error: VENUE_CAPTURE_PAUSED, code: "VENUE_CAPTURE_PAUSED" },
    { status: 503, headers: NO_STORE },
  );
}

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

/** Maps a gateway failure from b44SetVenueScanStatus to a safe response. */
function statusWriteFailed(
  err: unknown,
  reqId: string | undefined,
  scope: string,
): Response {
  const status = (err as { status?: number })?.status;
  if (status === 400)
    return badRequest("invalid transition request");
  if (status === 404)
    return Response.json({ error: "scan not found" }, { status: 404 });
  if (status === 409)
    return Response.json(
      { error: "illegal status transition for this scan" },
      { status: 409 },
    );
  log.error("venue-scan status write failed", {
    reqId,
    scope,
    reason: err instanceof Error ? err.message : String(err),
  });
  return Response.json(
    { error: "couldn't update the scan — please try again" },
    { status: 503, headers: NO_STORE },
  );
}

/**
 * Worker path — x-scan-worker-key + {status, splat_url?, blur_verified?}.
 * Field shapes are checked here; legality of the transition itself is
 * checked in the gateway (single source of truth for the state machine).
 */
async function workerTransition(
  body: Record<string, unknown>,
  scanId: string,
  reqId: string | undefined,
): Promise<Response> {
  const status = body.status;
  if (typeof status !== "string" || !WORKER_STATUSES.has(status))
    return badRequest(
      "status must be one of processing|preview|refining|published|rejected",
    );

  const splatUrl = body.splat_url;
  if (
    splatUrl !== undefined &&
    splatUrl !== null &&
    (typeof splatUrl !== "string" ||
      splatUrl.length > MAX_URL ||
      !splatUrl.startsWith("https://"))
  )
    return badRequest("splat_url must be an https URL");

  const blurVerified = body.blur_verified;
  if (
    blurVerified !== undefined &&
    blurVerified !== null &&
    typeof blurVerified !== "boolean"
  )
    return badRequest("blur_verified must be a boolean");

  // Fail fast on a malformed publish — the gateway independently enforces
  // the same gate (splat_url AND blur_verified === true) authoritatively.
  if (status === "published") {
    if (typeof splatUrl !== "string" || splatUrl.length === 0)
      return badRequest("published requires splat_url");
    if (blurVerified !== true)
      return badRequest("published requires blur_verified === true");
  }

  try {
    const result = await b44SetVenueScanStatus({
      scanId,
      status,
      splatUrl: typeof splatUrl === "string" ? splatUrl : null,
      blurVerified: typeof blurVerified === "boolean" ? blurVerified : undefined,
    });
    return Response.json(
      { ok: true, status: result.status, deduped: result.deduped },
      { headers: NO_STORE },
    );
  } catch (err) {
    return statusWriteFailed(err, reqId, "venueScans.process.worker");
  }
}

/**
 * The honest enqueue stub: when SCAN_WORKER_URL is configured, POST
 * {scan_id} to it with the worker key; a reachable GPU queue picks the
 * scan up from `processing`. Unset/misbehaving = queued:false — the scan
 * stays at `processing` and this route reports it, nothing is faked.
 */
async function enqueueScan(
  scanId: string,
  reqId: string | undefined,
): Promise<boolean> {
  const workerUrl = process.env.SCAN_WORKER_URL;
  if (!workerUrl) return false;
  try {
    const res = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.SCAN_WORKER_KEY
          ? { "x-scan-worker-key": process.env.SCAN_WORKER_KEY }
          : {}),
      },
      body: JSON.stringify({ scan_id: scanId }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      log.warn("scan worker enqueue rejected", {
        reqId,
        scope: "venueScans.process.enqueue",
        status: res.status,
      });
    }
    return res.ok;
  } catch (err) {
    log.warn("scan worker enqueue failed", {
      reqId,
      scope: "venueScans.process.enqueue",
      reason: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/** Contributor path — {contributor_id} only. Transitions the scan to
 *  `processing` (the single forward step a contributor may take) and then
 *  attempts the worker enqueue. A scan already at `processing` skips the
 *  status write but still retries the enqueue — that is the recovery path
 *  for a scan stranded by an unset worker URL. */
async function contributorEnqueue(
  body: Record<string, unknown>,
  scanId: string,
  reqId: string | undefined,
): Promise<Response> {
  if (
    body.status !== undefined &&
    body.status !== null &&
    body.status !== "processing"
  )
    return badRequest("contributors can only enqueue a scan (status: processing)");

  const gate = await gateScanWrite(body, scanId, reqId, "venueScans.process");
  if (!gate.ok) return gate.res;

  if (gate.scan.status === "captured") {
    try {
      await b44SetVenueScanStatus({ scanId, status: "processing" });
    } catch (err) {
      return statusWriteFailed(err, reqId, "venueScans.process");
    }
  } else if (gate.scan.status !== "processing") {
    return Response.json(
      { error: "scan can no longer be queued for processing" },
      { status: 409 },
    );
  }

  const queued = await enqueueScan(scanId, reqId);
  return Response.json(
    { ok: true, status: "processing", queued },
    { headers: NO_STORE },
  );
}

export async function POST(req: NextRequest, routeParams: ScanRouteParams) {
  if (!venueCaptureEnabled()) return paused();
  const reqId = reqIdFrom(req);

  const scanId = await scanIdFrom(routeParams.params);
  if (!scanId) return badRequest("invalid scan id");

  const body = await scanJsonBody(req);
  if (!body) return badRequest("body must be an object");

  // Worker mode is selected purely by the presence of the key header — a
  // bad key fails authorization, it doesn't fall through to contributor
  // mode (which would leak that the header was ignored).
  if (req.headers.get("x-scan-worker-key") !== null) {
    const unauthorized = await authorizeGateway(
      req,
      process.env.SCAN_WORKER_KEY,
      "x-scan-worker-key",
    );
    if (unauthorized) return unauthorized;
    return workerTransition(body, scanId, reqId);
  }

  return contributorEnqueue(body, scanId, reqId);
}
