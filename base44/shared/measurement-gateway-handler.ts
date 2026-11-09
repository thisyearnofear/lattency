import { authorizeGateway } from "./gateway-auth.ts";
import {
  isVenueFactField,
  venueFactValue,
  venuePhotoError,
} from "./cafe-vocabulary.ts";
import {
  measurementInputFromRecord,
  measurementRecord,
  validateMeasurement,
} from "./measurement-validation.ts";
import { publicCafe } from "./public-cafe.ts";

export interface GatewayClient {
  asServiceRole: {
    entities: {
      Measurement: {
        filter: (
          query: Record<string, unknown>,
          sort?: string,
          limit?: number,
          offset?: number,
        ) => Promise<Record<string, unknown>[]>;
        create: (record: Record<string, unknown>) => Promise<{ id: string }>;
      };
      Cafe: {
        get: (id: string) => Promise<Record<string, unknown> | null>;
        update: (
          id: string,
          record: Record<string, unknown>,
        ) => Promise<unknown>;
      };
      VenueScan: {
        filter: (
          query: Record<string, unknown>,
          sort?: string,
          limit?: number,
          offset?: number,
        ) => Promise<Record<string, unknown>[]>;
        get: (id: string) => Promise<Record<string, unknown> | null>;
        create: (record: Record<string, unknown>) => Promise<{ id: string }>;
        update: (
          id: string,
          record: Record<string, unknown>,
        ) => Promise<unknown>;
      };
      Bounty: {
        get: (id: string) => Promise<Record<string, unknown> | null>;
        create: (record: Record<string, unknown>) => Promise<{ id: string }>;
        update: (
          id: string,
          record: Record<string, unknown>,
        ) => Promise<unknown>;
      };
    };
  };
}

const NO_STORE = { "Cache-Control": "no-store" } as const;

function err(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: NO_STORE });
}

// Capture-run v2 constants — kept inline because this file ships to the
// Deno backend and can't import from the Next.js lib/ tree.
const SCAN_SECTORS = new Set(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
// Statuses a public reader may hear about. rejected / taken_down /
// superseded are exits — never projected.
const SCAN_PUBLIC_STATUSES = new Set([
  "captured",
  "processing",
  "preview",
  "refining",
  "published",
]);
const SCAN_MAX_SEQ = 4999;
const SCAN_MAX_FRAME_BYTES = 512 * 1024;
const SCAN_MAX_MANIFEST = 2000;
const SCAN_MAX_URL = 2048;
// Pipeline status state machine (docs/venue-3d-ux-research.md §7). Strictly
// forward along captured → processing → preview → refining → published;
// rejected is a QC exit reachable before publish, superseded retires a
// published scan. taken_down is never a target here — the owner-veto path
// owns it — and no state may regress.
const SCAN_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  captured: new Set(["processing", "rejected"]),
  processing: new Set(["preview", "rejected"]),
  preview: new Set(["refining", "rejected"]),
  refining: new Set(["published", "rejected"]),
  published: new Set(["superseded"]),
  rejected: new Set(),
  taken_down: new Set(),
  superseded: new Set(),
};
const SCAN_STATUSES = new Set(Object.keys(SCAN_TRANSITIONS));
// Bounty status enum (base44/entities/Bounty.json) — the only values a
// bounty-update patch may write.
const BOUNTY_STATUSES = new Set(["open", "claiming", "paid"]);

/** Optional blob URL field — must be an https URL. */
function scanUrlError(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "string" ||
    value.length > SCAN_MAX_URL ||
    !value.startsWith("https://")
  )
    return `${field} must be an https URL (max ${SCAN_MAX_URL} characters)`;
  return null;
}

export async function measurementGatewayHandler(
  req: Request,
  secret: string | undefined,
  makeClient: () => GatewayClient,
): Promise<Response> {
  if (req.method !== "POST") return err(405, "Method not allowed");

  const unauthorized = await authorizeGateway(req, secret);
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err(400, "body must be JSON");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body))
    return err(400, "body must be an object");
  const action = (body as Record<string, unknown>).action;
  if (typeof action !== "string") return err(400, "action required");

  try {
    const base44 = makeClient();

    if (action === "insert") {
      const measurement = (body as Record<string, unknown>).measurement;
      if (measurement === null || typeof measurement !== "object" || Array.isArray(measurement))
        return err(400, "measurement object required");
      const record = measurement as Record<string, unknown>;
      const cafeId = record.cafe_id;
      if (typeof cafeId !== "string" || cafeId.length === 0 || cafeId.length > 128)
        return err(400, "measurement.cafe_id required");

      const validationError = validateMeasurement(measurementInputFromRecord(record));
      if (validationError) return err(400, validationError);

      let cafe: Record<string, unknown> | null;
      try {
        cafe = await base44.asServiceRole.entities.Cafe.get(cafeId);
      } catch (e) {
        const status = (e as { status?: number })?.status;
        if (status === 404) return err(404, "cafe not found");
        throw e;
      }
      if (!cafe) return err(404, "cafe not found");

      const row = await base44.asServiceRole.entities.Measurement.create(
        measurementRecord(record, cafeId),
      );
      return Response.json({ measurementId: row.id }, { status: 201, headers: NO_STORE });
    }

    if (action === "leaderboard") {
      const rows = await base44.asServiceRole.entities.Measurement.filter(
        {},
        "-measured_at",
        500,
        0,
      );
      return Response.json(
        {
          rows: rows.map((r) => ({
            contributor_user_id: r.contributor_user_id,
            cafe_id: r.cafe_id,
            measured_at: r.measured_at,
          })),
        },
        { headers: NO_STORE },
      );
    }

    if (action === "venue-scan-insert") {
      const scan = (body as Record<string, unknown>).scan;
      if (scan === null || typeof scan !== "object" || Array.isArray(scan))
        return err(400, "scan object required");
      const record = scan as Record<string, unknown>;
      const venueId = record.venue_id;
      if (typeof venueId !== "string" || venueId.length === 0 || venueId.length > 128)
        return err(400, "scan.venue_id required");
      const contributorId = record.contributor_id;
      if (
        contributorId !== undefined &&
        contributorId !== null &&
        (typeof contributorId !== "string" || contributorId.length > 128)
      )
        return err(400, "scan.contributor_id invalid");
      const assetUrl = record.capture_asset_url;
      if (
        assetUrl !== undefined &&
        assetUrl !== null &&
        (typeof assetUrl !== "string" || assetUrl.length > 2048)
      )
        return err(400, "scan.capture_asset_url invalid");

      // Rescan/gap-fill: the new scan may supersede a prior one, which must
      // exist and belong to the same venue. Validated before anything writes.
      const supersedesId = record.supersedes_id;
      if (
        supersedesId !== undefined &&
        supersedesId !== null &&
        (typeof supersedesId !== "string" ||
          supersedesId.length === 0 ||
          supersedesId.length > 128)
      )
        return err(400, "scan.supersedes_id invalid");
      let prior: Record<string, unknown> | null = null;
      if (typeof supersedesId === "string") {
        try {
          prior = await base44.asServiceRole.entities.VenueScan.get(supersedesId);
        } catch (e) {
          const status = (e as { status?: number })?.status;
          if (status === 404)
            return err(400, "scan.supersedes_id references no existing scan");
          throw e;
        }
        if (!prior)
          return err(400, "scan.supersedes_id references no existing scan");
        if (prior.venue_id !== venueId)
          return err(400, "superseded scan must belong to the same venue");
      }

      // The consent checkpoint is re-verified server-side: a scan record
      // cannot be created without both affirmations, regardless of what the
      // caller's UI enforced.
      const consent = record.consent_attestation;
      if (consent === null || typeof consent !== "object" || Array.isArray(consent))
        return err(400, "scan.consent_attestation required");
      const attestation = consent as Record<string, unknown>;
      if (attestation.venue_permission !== true || attestation.patron_notice !== true)
        return err(400, "consent attestation must affirm venue permission and patron notice");
      const ts = attestation.timestamp;
      const timestamp =
        typeof ts === "string" && !Number.isNaN(Date.parse(ts))
          ? ts
          : new Date().toISOString();

      const row = await base44.asServiceRole.entities.VenueScan.create({
        venue_id: venueId,
        contributor_id: typeof contributorId === "string" ? contributorId : null,
        capture_asset_url: typeof assetUrl === "string" ? assetUrl : null,
        consent_attestation: {
          venue_permission: true,
          patron_notice: true,
          timestamp,
        },
        status: "captured",
        splat_url: null,
        takedown_requested: false,
        blur_verified: false,
        quality_score: null,
        coverage_sectors: [],
        face_events: null,
        supersedes_id: typeof supersedesId === "string" ? supersedesId : null,
        frame_count: null,
        frames_received: [],
      });

      // The new run exists — retire the prior scan unless it's already in a
      // terminal takedown state (a legal hold outranks supersession). The
      // update is best-effort: the scan is created either way, so a failed
      // supersede must not lose the run.
      let superseded = false;
      if (prior && prior.status !== "taken_down") {
        try {
          await base44.asServiceRole.entities.VenueScan.update(
            supersedesId as string,
            { status: "superseded" },
          );
          superseded = true;
        } catch {
          /* supersede bookkeeping can be retried — the run itself is safe */
        }
      }
      return Response.json(
        { scanId: row.id, superseded },
        { status: 201, headers: NO_STORE },
      );
    }

    if (action === "venue-scans") {
      const venueId = (body as Record<string, unknown>).venue_id;
      if (typeof venueId !== "string" || venueId.length === 0 || venueId.length > 128)
        return err(400, "venue_id required");
      const rows = await base44.asServiceRole.entities.VenueScan.filter(
        { venue_id: venueId },
        "-created_date",
        50,
        0,
      );
      // Public projection, capture-run v2: pipeline status is transparent
      // (readers see processing/preview/refining, not just published), but
      // splat_url is projected only once the scan is actually published, and
      // contributor_id / consent records / the frame manifest never leave.
      return Response.json(
        {
          scans: rows
            .filter(
              (r) =>
                typeof r.status === "string" && SCAN_PUBLIC_STATUSES.has(r.status),
            )
            .map((r) => ({
              id: r.id,
              venue_id: r.venue_id,
              splat_url: r.status === "published" ? (r.splat_url ?? null) : null,
              status: r.status,
              quality_score:
                typeof r.quality_score === "number" ? r.quality_score : null,
              created: r.created_date ?? null,
            })),
        },
        { headers: NO_STORE },
      );
    }

    if (action === "venue-scan-get") {
      // Internal read used by the Next.js routes for gating (venue/city
      // resolution, contributor match). Returns only the fields the routes
      // need — this is never forwarded to the client verbatim.
      const scanId = (body as Record<string, unknown>).scan_id;
      if (typeof scanId !== "string" || scanId.length === 0 || scanId.length > 128)
        return err(400, "scan_id required");
      let scan: Record<string, unknown> | null;
      try {
        scan = await base44.asServiceRole.entities.VenueScan.get(scanId);
      } catch (e) {
        const status = (e as { status?: number })?.status;
        if (status === 404)
          return Response.json({ scan: null }, { headers: NO_STORE });
        throw e;
      }
      return Response.json(
        {
          scan: scan
            ? {
                id: scan.id,
                venue_id: scan.venue_id,
                contributor_id: scan.contributor_id ?? null,
                status: scan.status,
                supersedes_id: scan.supersedes_id ?? null,
              }
            : null,
        },
        { headers: NO_STORE },
      );
    }

    if (action === "venue-scan-frame") {
      // Appends one keyframe-chunk manifest entry to a live scan. The Next.js
      // route validates the JPEG and stores the bytes in object storage
      // before calling — we record {seq, ts, bytes, url} pointing at the
      // stored frame. `url` stays optional so in-flight clients that predate
      // blob storage don't break mid-run.
      const b = body as Record<string, unknown>;
      const scanId = b.scan_id;
      if (typeof scanId !== "string" || scanId.length === 0 || scanId.length > 128)
        return err(400, "scan_id required");
      const contributorId = b.contributor_id;
      if (
        typeof contributorId !== "string" ||
        contributorId.length === 0 ||
        contributorId.length > 128
      )
        return err(400, "contributor_id required");
      const seq = b.seq;
      if (
        typeof seq !== "number" ||
        !Number.isInteger(seq) ||
        seq < 0 ||
        seq > SCAN_MAX_SEQ
      )
        return err(400, "seq must be an integer 0–4999");
      const ts = b.ts;
      if (typeof ts !== "string" || ts.length === 0 || ts.length > 64)
        return err(400, "ts required (string, max 64 characters)");
      const bytes = b.bytes;
      if (
        typeof bytes !== "number" ||
        !Number.isInteger(bytes) ||
        bytes <= 0 ||
        bytes > SCAN_MAX_FRAME_BYTES
      )
        return err(400, "bytes must be an integer byte count (max 512KB)");
      const urlError = scanUrlError(b.url, "url");
      if (urlError) return err(400, urlError);

      let scan: Record<string, unknown> | null;
      try {
        scan = await base44.asServiceRole.entities.VenueScan.get(scanId);
      } catch (e) {
        const status = (e as { status?: number })?.status;
        if (status === 404) return err(404, "scan not found");
        throw e;
      }
      if (!scan) return err(404, "scan not found");
      // Frames can only land on the scan of the contributor who owns it.
      if (
        typeof scan.contributor_id === "string" &&
        scan.contributor_id !== contributorId
      )
        return err(403, "contributor mismatch");
      if (scan.status !== "captured")
        return err(409, "scan is not accepting frames");

      const existing = Array.isArray(scan.frames_received)
        ? (scan.frames_received as Record<string, unknown>[])
        : [];
      // Idempotent on seq — a retried chunk isn't double-counted.
      if (existing.some((f) => f && f.seq === seq)) {
        return Response.json(
          { received: existing.length, deduped: true },
          { headers: NO_STORE },
        );
      }
      if (existing.length >= SCAN_MAX_MANIFEST)
        return err(400, "frame manifest full");

      await base44.asServiceRole.entities.VenueScan.update(scanId, {
        frames_received: [
          ...existing,
          {
            seq,
            ts,
            bytes,
            ...(typeof b.url === "string" ? { url: b.url } : {}),
          },
        ],
      });
      return Response.json(
        { received: existing.length + 1 },
        { headers: NO_STORE },
      );
    }

    if (action === "venue-scan-status") {
      // Pipeline state machine — the only path that moves a scan past
      // `captured`. Called by the Next.js process route (contributor enqueue)
      // and by the scan worker (every later transition). Forward-only:
      // captured → processing → preview → refining → published, with
      // rejected as a pre-publish QC exit and superseded retiring a
      // published scan. `published` additionally requires a splat_url AND
      // blur_verified === true — blur-before-publish is enforced here, not
      // trusted to the caller (docs/venue-3d-insights.md guardrails).
      const b = body as Record<string, unknown>;
      const scanId = b.scan_id;
      if (typeof scanId !== "string" || scanId.length === 0 || scanId.length > 128)
        return err(400, "scan_id required");
      const status = b.status;
      if (typeof status !== "string" || !SCAN_STATUSES.has(status))
        return err(400, "status must be a valid scan status");
      const urlError = scanUrlError(b.splat_url, "splat_url");
      if (urlError) return err(400, urlError);
      const blurVerified = b.blur_verified;
      if (
        blurVerified !== undefined &&
        blurVerified !== null &&
        typeof blurVerified !== "boolean"
      )
        return err(400, "blur_verified must be a boolean");

      // Publish gate — checked on the request before the entity is even
      // read, so a malformed publish can't move the scan at all.
      if (status === "published") {
        if (typeof b.splat_url !== "string" || b.splat_url.length === 0)
          return err(400, "published requires splat_url");
        if (blurVerified !== true)
          return err(400, "published requires blur_verified === true");
      }

      let scan: Record<string, unknown> | null;
      try {
        scan = await base44.asServiceRole.entities.VenueScan.get(scanId);
      } catch (e) {
        const s = (e as { status?: number })?.status;
        if (s === 404) return err(404, "scan not found");
        throw e;
      }
      if (!scan) return err(404, "scan not found");

      const from = typeof scan.status === "string" ? scan.status : "";
      // Same-status requests are idempotent retries — acknowledge without
      // writing so a re-fired worker step is safe.
      if (from === status)
        return Response.json(
          { ok: true, status, deduped: true },
          { headers: NO_STORE },
        );
      if (!SCAN_TRANSITIONS[from]?.has(status))
        return err(409, `cannot transition scan from ${from || "unknown"} to ${status}`);

      await base44.asServiceRole.entities.VenueScan.update(scanId, {
        status,
        ...(typeof b.splat_url === "string" ? { splat_url: b.splat_url } : {}),
        ...(typeof blurVerified === "boolean"
          ? { blur_verified: blurVerified }
          : {}),
      });
      return Response.json({ ok: true, status }, { headers: NO_STORE });
    }

    if (action === "venue-scan-finalize") {
      // End-of-run manifest write: the coach's self-reported capture
      // metrics. Status stays "captured" — the GPU pipeline owns every
      // transition past this point.
      const b = body as Record<string, unknown>;
      const scanId = b.scan_id;
      if (typeof scanId !== "string" || scanId.length === 0 || scanId.length > 128)
        return err(400, "scan_id required");
      const contributorId = b.contributor_id;
      if (
        typeof contributorId !== "string" ||
        contributorId.length === 0 ||
        contributorId.length > 128
      )
        return err(400, "contributor_id required");
      const frameCount = b.frame_count;
      if (
        typeof frameCount !== "number" ||
        !Number.isInteger(frameCount) ||
        frameCount < 0 ||
        frameCount > 10000
      )
        return err(400, "frame_count must be an integer 0–10000");
      const qualityScore = b.quality_score;
      if (
        qualityScore !== null &&
        (typeof qualityScore !== "number" ||
          !Number.isFinite(qualityScore) ||
          qualityScore < 0 ||
          qualityScore > 100)
      )
        return err(400, "quality_score must be a number 0–100 or null");
      const coverageSectors = b.coverage_sectors;
      if (
        !Array.isArray(coverageSectors) ||
        coverageSectors.length > 16 ||
        coverageSectors.some(
          (s) => typeof s !== "string" || !SCAN_SECTORS.has(s),
        )
      )
        return err(400, "coverage_sectors must be an array of compass sectors");
      const faceEvents = b.face_events;
      if (
        faceEvents !== null &&
        (typeof faceEvents !== "number" ||
          !Number.isInteger(faceEvents) ||
          faceEvents < 0 ||
          faceEvents > 10000)
      )
        return err(400, "face_events must be an integer 0–10000 or null");

      let scan: Record<string, unknown> | null;
      try {
        scan = await base44.asServiceRole.entities.VenueScan.get(scanId);
      } catch (e) {
        const status = (e as { status?: number })?.status;
        if (status === 404) return err(404, "scan not found");
        throw e;
      }
      if (!scan) return err(404, "scan not found");
      if (
        typeof scan.contributor_id === "string" &&
        scan.contributor_id !== contributorId
      )
        return err(403, "contributor mismatch");
      if (scan.status !== "captured")
        return err(409, "scan can no longer be finalized");

      await base44.asServiceRole.entities.VenueScan.update(scanId, {
        frame_count: frameCount,
        quality_score: qualityScore,
        coverage_sectors: coverageSectors,
        face_events: faceEvents,
      });
      return Response.json({ ok: true }, { headers: NO_STORE });
    }

    if (action === "venue-scan-takedown") {
      const scanId = (body as Record<string, unknown>).scan_id;
      if (typeof scanId !== "string" || scanId.length === 0 || scanId.length > 128)
        return err(400, "scan_id required");
      const venueId = (body as Record<string, unknown>).venue_id;
      if (typeof venueId !== "string" || venueId.length === 0 || venueId.length > 128)
        return err(400, "venue_id required");
      const reason = (body as Record<string, unknown>).reason;
      if (typeof reason !== "string" || reason.trim().length === 0 || reason.length > 500)
        return err(400, "reason required (max 500 characters)");

      let scan: Record<string, unknown> | null;
      try {
        scan = await base44.asServiceRole.entities.VenueScan.get(scanId);
      } catch (e) {
        const status = (e as { status?: number })?.status;
        if (status === 404) return err(404, "scan not found");
        throw e;
      }
      // A venue_id that doesn't match the scan's venue gets the same 404 —
      // confirming the pair exists would leak scan metadata.
      if (!scan || scan.venue_id !== venueId) return err(404, "scan not found");

      await base44.asServiceRole.entities.VenueScan.update(scanId, {
        takedown_requested: true,
        takedown_reason: reason.trim(),
      });
      return Response.json({ ok: true }, { headers: NO_STORE });
    }

    if (action === "venue-fact") {
      // Rung-2 micro-contribution: one confirmed fact on the venue record.
      // The field allowlist is the whole write surface — nothing outside
      // VENUE_FACT_FIELDS can reach Cafe.update.
      const b = body as Record<string, unknown>;
      const cafeId = b.cafe_id;
      if (typeof cafeId !== "string" || cafeId.length === 0 || cafeId.length > 128)
        return err(400, "cafe_id required");
      const field = b.field;
      if (!isVenueFactField(field))
        return err(400, "field is not an allowed venue fact");
      const contributorId = b.contributor_id;
      if (
        contributorId !== undefined &&
        contributorId !== null &&
        (typeof contributorId !== "string" || contributorId.length > 128)
      )
        return err(400, "contributor_id invalid");
      const contributorIpHash = b.contributor_ip_hash;
      if (
        contributorIpHash !== undefined &&
        contributorIpHash !== null &&
        (typeof contributorIpHash !== "string" || contributorIpHash.length > 128)
      )
        return err(400, "contributor_ip_hash invalid");

      const fact = venueFactValue(field, b.value);
      if (!fact.ok) return err(400, fact.error);

      let cafe: Record<string, unknown> | null;
      try {
        cafe = await base44.asServiceRole.entities.Cafe.get(cafeId);
      } catch (e) {
        const status = (e as { status?: number })?.status;
        if (status === 404) return err(404, "cafe not found");
        throw e;
      }
      if (!cafe) return err(404, "cafe not found");

      let update: Record<string, unknown>;
      if (field === "milk_options") {
        // Newest observation appends to the menu rather than replacing it —
        // a café that added oat milk didn't stop pouring dairy. Deduped.
        const existing = Array.isArray(cafe.milk_options)
          ? (cafe.milk_options as unknown[]).filter(
              (v): v is string => typeof v === "string",
            )
          : [];
        update = {
          milk_options: [
            ...new Set([...existing, ...(fact.value as string[])]),
          ],
        };
      } else {
        update = { [field]: fact.value };
      }
      await base44.asServiceRole.entities.Cafe.update(cafeId, update);
      return Response.json({ ok: true }, { headers: NO_STORE });
    }

    if (action === "venue-photo") {
      // Rung-3 micro-contribution: one photo becomes the venue's face.
      // Newest-wins on the single Cafe.photo_url field.
      const b = body as Record<string, unknown>;
      const cafeId = b.cafe_id;
      if (typeof cafeId !== "string" || cafeId.length === 0 || cafeId.length > 128)
        return err(400, "cafe_id required");
      const contributorId = b.contributor_id;
      if (
        contributorId !== undefined &&
        contributorId !== null &&
        (typeof contributorId !== "string" || contributorId.length > 128)
      )
        return err(400, "contributor_id invalid");
      const contributorIpHash = b.contributor_ip_hash;
      if (
        contributorIpHash !== undefined &&
        contributorIpHash !== null &&
        (typeof contributorIpHash !== "string" || contributorIpHash.length > 128)
      )
        return err(400, "contributor_ip_hash invalid");
      const photoError = venuePhotoError(b.photo_url);
      if (photoError) return err(400, photoError);

      let cafe: Record<string, unknown> | null;
      try {
        cafe = await base44.asServiceRole.entities.Cafe.get(cafeId);
      } catch (e) {
        const status = (e as { status?: number })?.status;
        if (status === 404) return err(404, "cafe not found");
        throw e;
      }
      if (!cafe) return err(404, "cafe not found");

      await base44.asServiceRole.entities.Cafe.update(cafeId, {
        photo_url: b.photo_url,
      });
      return Response.json({ ok: true }, { headers: NO_STORE });
    }

    if (action === "cafe") {
      const cafeId = (body as Record<string, unknown>).cafe_id;
      if (typeof cafeId !== "string" || cafeId.length === 0 || cafeId.length > 128)
        return err(400, "cafe_id required");
      let cafe: Record<string, unknown> | null;
      try {
        cafe = await base44.asServiceRole.entities.Cafe.get(cafeId);
      } catch (e) {
        const status = (e as { status?: number })?.status;
        if (status === 404) return Response.json({ cafe: null }, { headers: NO_STORE });
        throw e;
      }
      return Response.json(
        { cafe: cafe ? publicCafe(cafe) : null },
        { headers: NO_STORE },
      );
    }

    if (action === "bounty-insert") {
      // Sponsor/founder bounty creation under service role — the Bounty
      // entity's create RLS is closed, so this action is the only write
      // path. The allowlist below is the entire write surface: id /
      // created_by / claimed_by / tx_hash / progress / status / active are
      // never taken from the caller. progress starts at 0 and status at
      // "open" because the update-bounty-progress function owns both, and
      // funding_status must be declared — a create that can't state its
      // backing lands "unverified", which the board hides and the progress
      // function refuses to advance (fail closed, never as-funded).
      const bounty = (body as Record<string, unknown>).bounty;
      if (bounty === null || typeof bounty !== "object" || Array.isArray(bounty))
        return err(400, "bounty object required");
      const record = bounty as Record<string, unknown>;

      const title = record.title;
      if (typeof title !== "string" || title.trim().length === 0 || title.length > 300)
        return err(400, "bounty.title required (max 300 characters)");
      const reward = record.reward;
      if (typeof reward !== "number" || !Number.isFinite(reward) || reward <= 0)
        return err(400, "bounty.reward must be a positive number");
      const fundingStatus = record.funding_status;
      if (fundingStatus !== "verified" && fundingStatus !== "unverified")
        return err(400, "bounty.funding_status must be verified or unverified");

      // The remaining allowlisted fields are optional — each is shape-checked
      // and collected with errors first so a malformed call writes nothing.
      const errors: string[] = [];
      const pickStr = (v: unknown, field: string, max: number): string | null => {
        if (v === undefined || v === null) return null;
        if (typeof v !== "string" || v.length > max) {
          errors.push(`bounty.${field} must be a string (max ${max} characters)`);
          return null;
        }
        return v;
      };
      const pickInt = (v: unknown, field: string, min: number, max: number): number | null => {
        if (v === undefined || v === null) return null;
        if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max) {
          errors.push(`bounty.${field} must be an integer ${min}–${max}`);
          return null;
        }
        return v;
      };
      const pickEnum = (v: unknown, field: string, allowed: readonly string[]): string | null => {
        if (v === undefined || v === null) return null;
        if (typeof v !== "string" || !allowed.includes(v)) {
          errors.push(`bounty.${field} must be one of ${allowed.join("|")}`);
          return null;
        }
        return v;
      };

      const description = pickStr(record.description, "description", 2000);
      const currency = pickStr(record.currency, "currency", 16);
      const rewardLunas = pickInt(record.reward_lunas, "reward_lunas", 0, Number.MAX_SAFE_INTEGER);
      const targetCity = pickStr(record.target_city, "target_city", 128);
      const targetNeighbourhood = pickStr(record.target_neighbourhood, "target_neighbourhood", 300);
      const criteria = pickStr(record.criteria, "criteria", 128);
      const target = pickInt(record.target, "target", 1, 100_000);
      const sponsorName = pickStr(record.sponsor_name, "sponsor_name", 300);
      const sponsorKind = pickEnum(record.sponsor_kind, "sponsor_kind", [
        "isp",
        "café",
        "community",
        "anon",
      ]);
      const kind = pickEnum(record.kind, "kind", [
        "first-in-neighbourhood",
        "attribute-match",
        "tier-target",
        "nth-contributor",
        "venue-capture",
      ]);
      const expiresAt = pickStr(record.expires_at, "expires_at", 64);
      const fundingTxHash = pickStr(record.funding_tx_hash, "funding_tx_hash", 256);
      const clientIntentId = pickStr(record.client_intent_id, "client_intent_id", 128);
      if (errors.length > 0) return err(400, errors[0]);

      const contributorIds = record.contributing_contributor_ids;
      if (
        contributorIds !== undefined &&
        contributorIds !== null &&
        (!Array.isArray(contributorIds) ||
          contributorIds.length > 1000 ||
          contributorIds.some(
            (x) => typeof x !== "string" || x.length === 0 || x.length > 128,
          ))
      )
        return err(400, "bounty.contributing_contributor_ids must be an array of ids");

      const row = await base44.asServiceRole.entities.Bounty.create({
        title: title.trim(),
        description,
        reward,
        // Every live row is NIM-denominated; the entity's KES default would
        // mislabel the unit if a caller omitted the field.
        currency: currency ?? "NIM",
        reward_lunas: rewardLunas ?? Math.round(reward * 100_000),
        target_city: targetCity,
        target_neighbourhood: targetNeighbourhood,
        criteria,
        target: target ?? 1,
        progress: 0,
        sponsor_name: sponsorName,
        sponsor_kind: sponsorKind ?? "community",
        kind: kind ?? "first-in-neighbourhood",
        expires_at: expiresAt,
        active: true,
        status: "open",
        claimed_by_address: null,
        tx_hash: null,
        funding_tx_hash: fundingTxHash,
        client_intent_id: clientIntentId,
        funding_status: fundingStatus,
        contributing_contributor_ids: contributorIds ?? [],
      });
      return Response.json({ bountyId: row.id }, { status: 201, headers: NO_STORE });
    }

    if (action === "bounty-update") {
      // Paid-marker persistence — the Bounty entity's RLS grants read only,
      // so the claim route's paid stamp rides the gateway like the create
      // did. The allowlist is exactly the claim-path patch: status /
      // claimed_by_address / tx_hash. progress and
      // contributing_contributor_ids stay owned by the update-bounty-progress
      // function (service role in-function); funding_tx_hash, funding_status
      // and client_intent_id are write-once at bounty-insert, so a patch
      // carrying them is rejected rather than silently dropped.
      const b = body as Record<string, unknown>;
      const bountyId = b.bounty_id;
      if (typeof bountyId !== "string" || bountyId.length === 0 || bountyId.length > 128)
        return err(400, "bounty_id required");
      const patch = b.patch;
      if (patch === null || typeof patch !== "object" || Array.isArray(patch))
        return err(400, "patch object required");
      const record = patch as Record<string, unknown>;
      const keys = Object.keys(record);
      if (keys.length === 0) return err(400, "patch must not be empty");

      const update: Record<string, unknown> = {};
      for (const key of keys) {
        const value = record[key];
        switch (key) {
          case "status":
            if (typeof value !== "string" || !BOUNTY_STATUSES.has(value))
              return err(400, "patch.status must be a valid bounty status");
            break;
          case "claimed_by_address":
          case "tx_hash":
            if (
              value !== null &&
              (typeof value !== "string" || value.length > 256)
            )
              return err(
                400,
                `patch.${key} must be a string (max 256 characters) or null`,
              );
            break;
          default:
            return err(400, `patch.${key} is not allowed`);
        }
        update[key] = value;
      }

      let bounty: Record<string, unknown> | null;
      try {
        bounty = await base44.asServiceRole.entities.Bounty.get(bountyId);
      } catch (e) {
        const status = (e as { status?: number })?.status;
        if (status === 404) return err(404, "bounty not found");
        throw e;
      }
      if (!bounty) return err(404, "bounty not found");

      await base44.asServiceRole.entities.Bounty.update(bountyId, update);
      return Response.json({ ok: true }, { headers: NO_STORE });
    }

    return err(400, "unknown action");
  } catch {
    return err(503, "Contribution gateway unavailable");
  }
}
