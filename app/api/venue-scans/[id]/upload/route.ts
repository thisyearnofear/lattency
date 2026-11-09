import { NextRequest } from "next/server";
import {
  venueCaptureEnabled,
  VENUE_CAPTURE_PAUSED,
} from "@/lib/venue-capture-policy";
import { resolveVenueCaptureAccess } from "@/lib/venue-capture-gate";
import {
  base44Configured,
  b44AppendVenueScanFrame,
  b44FinalizeVenueScan,
  b44GetVenueScan,
  type B44VenueScanInternal,
} from "@/lib/base44-data";
import { CAPTURE_SECTOR_SET } from "@/lib/capture-quality";
import { sanitizeContributorId } from "@/lib/measurements";
import { checkRateLimit, hashIp } from "@/lib/rate-limit";
import { log, reqIdFrom } from "@/lib/log";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

// Frame-chunk limits — one JPEG keyframe per POST during a live run
// (docs/venue-3d-ux-research.md §7: keyframes, not big-blob resumable).
const MAX_SEQ = 4999;
const MAX_FRAME_BYTES = 512 * 1024; // ~500KB per frame cap
const MAX_FRAME_FIELD_CHARS = 800_000; // base64 envelope guard

function paused(): Response {
  return Response.json(
    { error: VENUE_CAPTURE_PAUSED, code: "VENUE_CAPTURE_PAUSED" },
    { status: 503, headers: NO_STORE },
  );
}

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

/**
 * Validates a frame payload — raw base64 or `data:image/jpeg;base64,` —
 * and returns the decoded byte length. JPEG magic bytes (FF D8 FF) are
 * checked on the decoded buffer so a mislabeled payload can't slip through.
 * The decoded bytes themselves are intentionally discarded: no object
 * storage exists yet (Phase 1 infra), so this route validates and records
 * the manifest entry only.
 */
function validateFrameBytes(raw: unknown): number | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (raw.length > MAX_FRAME_FIELD_CHARS) return null;

  let b64 = raw;
  if (raw.startsWith("data:")) {
    const match = /^data:image\/jpe?g;base64,([\s\S]+)$/i.exec(raw);
    if (!match) return null;
    b64 = match[1];
  }
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(b64)) return null;

  let buf: Buffer;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    return null;
  }
  if (buf.length === 0 || buf.length > MAX_FRAME_BYTES) return null;
  if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return null;
  return buf.length;
}

type RouteParams = { params: Promise<{ id: string }> };

async function scanIdFrom(params: RouteParams["params"]): Promise<string | null> {
  const { id } = await params;
  return typeof id === "string" && id && id.length <= 128 ? id : null;
}

async function jsonBody(req: NextRequest): Promise<Record<string, unknown> | null> {
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
 * Shared gate for both write verbs on this route: contributor id → scan
 * record → contributor match → crew/backend/city access resolved from the
 * scan's venue. Returns the scan on success or a ready-made error response.
 */
async function gateScanWrite(
  body: Record<string, unknown>,
  scanId: string,
  reqId: string | undefined,
  scope: string,
): Promise<{ ok: true; scan: B44VenueScanInternal; contributorId: string } | { ok: false; res: Response }> {
  const contributorId = sanitizeContributorId(
    typeof body.contributor_id === "string" ? body.contributor_id : null,
  );
  if (!contributorId) {
    return { ok: false, res: badRequest("contributor_id required") };
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
  // Chunks can only land on the scan of the contributor who owns it.
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

// POST /api/venue-scans/:id/upload
// Body: { seq, ts, contributor_id, frame }
// One JPEG keyframe chunk of a live capture run. The frame bytes are
// validated (JPEG magic, ≤512KB) and then *discarded* — only the
// {seq, ts, bytes} manifest entry is persisted on the entity. Real frame
// storage requires object storage (Phase 1 infra); see AGENTS.md.
export async function POST(req: NextRequest, routeParams: RouteParams) {
  if (!venueCaptureEnabled()) return paused();
  const reqId = reqIdFrom(req);

  const scanId = await scanIdFrom(routeParams.params);
  if (!scanId) return badRequest("invalid scan id");

  const body = await jsonBody(req);
  if (!body) return badRequest("body must be an object");

  const seq = body.seq;
  if (
    typeof seq !== "number" ||
    !Number.isInteger(seq) ||
    seq < 0 ||
    seq > MAX_SEQ
  )
    return badRequest("seq must be an integer 0–4999");

  const ts = body.ts;
  if (typeof ts !== "string" || !ts.trim() || ts.length > 64)
    return badRequest("ts required (string, max 64 characters)");

  const bytes = validateFrameBytes(body.frame);
  if (bytes === null)
    return badRequest("frame must be a JPEG image (base64 or data-url, max 500KB)");

  const gate = await gateScanWrite(body, scanId, reqId, "venueScans.upload");
  if (!gate.ok) return gate.res;

  const ipHash = hashIp(
    req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
  );
  const allowed = await checkRateLimit(ipHash, { kind: "scanframe", scanId });
  if (!allowed) {
    return Response.json(
      { error: "Rate limited — too many frames for this run. Slow down or start a new scan." },
      { status: 429 },
    );
  }

  try {
    const { received } = await b44AppendVenueScanFrame({
      scanId,
      contributorId: gate.contributorId,
      seq,
      ts,
      bytes,
    });
    return Response.json({ received }, { headers: NO_STORE });
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 403 || status === 404 || status === 409) {
      return Response.json(
        { error: status === 409 ? "scan is not accepting frames" : "scan not writable" },
        { status },
      );
    }
    log.error("venue-scan frame append failed", {
      reqId,
      scope: "venueScans.upload",
      reason: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { error: "couldn't record the frame — the run keeps going" },
      { status: 503, headers: NO_STORE },
    );
  }
}

// PATCH /api/venue-scans/:id/upload
// Body: { done: true, contributor_id, frameCount, qualityScore,
//         coverageSectors, faceEvents }
// End-of-run finalization: writes the capture manifest (client-computed
// quality signals, honestly self-reported) and leaves status at `captured`
// — the GPU pipeline owns every transition past this point.
export async function PATCH(req: NextRequest, routeParams: RouteParams) {
  if (!venueCaptureEnabled()) return paused();
  const reqId = reqIdFrom(req);

  const scanId = await scanIdFrom(routeParams.params);
  if (!scanId) return badRequest("invalid scan id");

  const body = await jsonBody(req);
  if (!body) return badRequest("body must be an object");
  if (body.done !== true) return badRequest("done must be true to finalize");

  const frameCount = body.frameCount;
  if (
    typeof frameCount !== "number" ||
    !Number.isInteger(frameCount) ||
    frameCount < 0 ||
    frameCount > 10000
  )
    return badRequest("frameCount must be an integer 0–10000");

  const qualityScore = body.qualityScore;
  if (
    qualityScore !== undefined &&
    qualityScore !== null &&
    (typeof qualityScore !== "number" ||
      !Number.isFinite(qualityScore) ||
      qualityScore < 0 ||
      qualityScore > 100)
  )
    return badRequest("qualityScore must be a number 0–100 or null");

  const coverageSectors = body.coverageSectors;
  if (
    !Array.isArray(coverageSectors) ||
    coverageSectors.length > 16 ||
    coverageSectors.some(
      (s) => typeof s !== "string" || !CAPTURE_SECTOR_SET.has(s),
    )
  )
    return badRequest("coverageSectors must be an array of compass sectors");

  const faceEvents = body.faceEvents;
  if (
    faceEvents !== undefined &&
    faceEvents !== null &&
    (typeof faceEvents !== "number" ||
      !Number.isInteger(faceEvents) ||
      faceEvents < 0 ||
      faceEvents > 10000)
  )
    return badRequest("faceEvents must be an integer 0–10000 or null");

  const gate = await gateScanWrite(body, scanId, reqId, "venueScans.finalize");
  if (!gate.ok) return gate.res;

  try {
    await b44FinalizeVenueScan({
      scanId,
      contributorId: gate.contributorId,
      frameCount,
      qualityScore: qualityScore ?? null,
      coverageSectors,
      faceEvents: faceEvents ?? null,
    });
    return Response.json({ ok: true, status: "captured" }, { headers: NO_STORE });
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 403 || status === 404 || status === 409) {
      return Response.json(
        { error: status === 409 ? "scan can no longer be finalized" : "scan not writable" },
        { status },
      );
    }
    log.error("venue-scan finalize failed", {
      reqId,
      scope: "venueScans.finalize",
      reason: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { error: "couldn't finalize the run — please try again" },
      { status: 503, headers: NO_STORE },
    );
  }
}
