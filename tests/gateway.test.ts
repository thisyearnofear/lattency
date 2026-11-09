import { describe, it, expect, vi } from "vitest";
import {
  validateMeasurement,
  resolveTestMethod,
  measurementRecord,
} from "@/base44/shared/measurement-validation";
import { authorizeGateway } from "@/base44/shared/gateway-auth";
import { measurementGatewayHandler } from "@/base44/shared/measurement-gateway-handler";
import { publicCafe } from "@/base44/shared/public-cafe";
import { readFileSync } from "node:fs";

const NOW = Date.parse("2026-10-22T12:00:00Z");
const AUTO = { downMbps: 50, upMbps: 10, latencyMs: 20, downloadBytes: 10_485_760, downloadDurationMs: 1677.7216 };

describe("validateMeasurement", () => {
  it("rejects non-object bodies", () => {
    expect(validateMeasurement(null, NOW)).toBeTruthy();
    expect(validateMeasurement([1], NOW)).toBeTruthy();
    expect(validateMeasurement("x", NOW)).toBeTruthy();
  });
  it("rejects numeric strings", () => {
    expect(validateMeasurement({ ...AUTO, downMbps: "50" }, NOW)).toBeTruthy();
  });
  it("rejects future timestamps >5min", () => {
    const future = new Date(NOW + 10 * 60_000).toISOString();
    expect(validateMeasurement({ downMbps: 1, upMbps: 1, latencyMs: 1, measuredAt: future }, NOW)).toBeTruthy();
  });
  it("rejects invalid and leap-invalid dates", () => {
    for (const d of ["2026-02-30T00:00:00Z", "nope", "2026-10-22T25:00:00Z"])
      expect(validateMeasurement({ downMbps: 1, upMbps: 1, latencyMs: 1, measuredAt: d }, NOW)).toBeTruthy();
  });
  it("accepts historical and missing timestamps", () => {
    expect(validateMeasurement({ downMbps: 1, upMbps: 1, latencyMs: 1, measuredAt: "2020-01-01T00:00:00Z" }, NOW)).toBeNull();
    expect(validateMeasurement({ downMbps: 1, upMbps: 1, latencyMs: 1 }, NOW)).toBeNull();
  });
  it("rejects partial/zero/negative metadata", () => {
    expect(validateMeasurement({ downMbps: 1, upMbps: 1, latencyMs: 1, downloadBytes: 10_485_760 }, NOW)).toBeTruthy();
    expect(validateMeasurement({ ...AUTO, downloadDurationMs: 0 }, NOW)).toBeTruthy();
    expect(validateMeasurement({ ...AUTO, downloadDurationMs: -5 }, NOW)).toBeTruthy();
    expect(validateMeasurement({ ...AUTO, downloadBytes: 100 }, NOW)).toBeTruthy();
    for (const duration of [NaN, Infinity, 1e-320]) {
      expect(validateMeasurement({ ...AUTO, downloadDurationMs: duration }, NOW)).toBeTruthy();
    }
  });
  it("accepts consistent auto metadata and resolves browser-auto", () => {
    expect(validateMeasurement(AUTO, NOW)).toBeNull();
    expect(resolveTestMethod(AUTO)).toBe("browser-auto");
  });
  it("rejects mismatched down vs metadata and browser-auto claims without metadata", () => {
    expect(validateMeasurement({ ...AUTO, downMbps: 100 }, NOW)).toMatch(/does not match/);
    expect(validateMeasurement({ downMbps: 50, upMbps: 10, latencyMs: 20, testMethod: "browser-auto" }, NOW)).toBeTruthy();
  });
  it("resolves manual for claimed methods without metadata", () => {
    expect(resolveTestMethod({ downMbps: 1, upMbps: 1, latencyMs: 1, testMethod: "browser-auto" })).toBe("manual");
    expect(resolveTestMethod("junk")).toBe("manual");
  });
});

describe("measurementRecord allowlist", () => {
  it("drops injected fields and derives method", () => {
    const rec = measurementRecord(
      { down_mbps: 50, up_mbps: 10, latency_ms: 20, id: "evil", is_outlier: true, created_date: "x", hack: 1,
        download_bytes: 10_485_760, download_duration_ms: 1677.7216 },
      "cafe-1", NOW,
    );
    expect(rec).not.toHaveProperty("id");
    expect(rec).not.toHaveProperty("is_outlier");
    expect(rec).not.toHaveProperty("hack");
    expect(rec.test_method).toBe("browser-auto");
    expect(rec.cafe_id).toBe("cafe-1");
  });
});

const SECRET = "s".repeat(32);
function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://x/gw", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
}
describe("authorizeGateway", () => {
  it("503s on missing/short secret", async () => {
    expect((await authorizeGateway(req({}), undefined))!.status).toBe(503);
    expect((await authorizeGateway(req({}), "short"))!.status).toBe(503);
  });
  it("401s on missing/wrong supplied key, null on match", async () => {
    expect((await authorizeGateway(req({}), SECRET))!.status).toBe(401);
    expect((await authorizeGateway(req({}, { "x-lattency-server-key": "wrong" }), SECRET))!.status).toBe(401);
    expect(await authorizeGateway(req({}, { "x-lattency-server-key": SECRET }), SECRET)).toBeNull();
  });
  it("honors a custom header name (scan worker key surface)", async () => {
    expect(
      (await authorizeGateway(req({}, { "x-scan-worker-key": "wrong" }), SECRET, "x-scan-worker-key"))!.status,
    ).toBe(401);
    // The gateway key does not double as a worker key.
    expect(
      (await authorizeGateway(req({}, { "x-lattency-server-key": SECRET }), SECRET, "x-scan-worker-key"))!.status,
    ).toBe(401);
    expect(
      await authorizeGateway(req({}, { "x-scan-worker-key": SECRET }), SECRET, "x-scan-worker-key"),
    ).toBeNull();
  });
});

function makeClient(over: Partial<{
  rows: Record<string, unknown>[];
  cafe: Record<string, unknown> | null;
  createErr: Error;
  scanRows: Record<string, unknown>[];
  scan: Record<string, unknown> | null;
  scanGetErr: Error;
  bounty: Record<string, unknown> | null;
  bountyGetErr: Error;
}> = {}) {
  const create = vi.fn().mockImplementation(() =>
    over.createErr ? Promise.reject(over.createErr) : Promise.resolve({ id: "m-1" }));
  const cafeUpdate = vi.fn().mockResolvedValue({});
  const scanCreate = vi.fn().mockResolvedValue({ id: "vs-1" });
  const scanUpdate = vi.fn().mockResolvedValue({});
  const bountyCreate = vi.fn().mockResolvedValue({ id: "b-1" });
  const bountyGet = vi.fn().mockImplementation(() =>
    over.bountyGetErr
      ? Promise.reject(over.bountyGetErr)
      : Promise.resolve(over.bounty !== undefined ? over.bounty : { id: "b-1", status: "claiming" }));
  const bountyUpdate = vi.fn().mockResolvedValue({});
  const client = {
    asServiceRole: {
      entities: {
        Measurement: {
          filter: vi.fn().mockResolvedValue(over.rows ?? []),
          create,
        },
        Cafe: {
          get: vi.fn().mockResolvedValue(over.cafe !== undefined ? over.cafe : { id: "c1", name: "C" }),
          update: cafeUpdate,
        },
        VenueScan: {
          filter: vi.fn().mockResolvedValue(over.scanRows ?? []),
          get: vi.fn().mockImplementation(() =>
            over.scanGetErr
              ? Promise.reject(over.scanGetErr)
              : Promise.resolve(over.scan !== undefined ? over.scan : { id: "vs-1", venue_id: "c1" })),
          create: scanCreate,
          update: scanUpdate,
        },
        Bounty: { get: bountyGet, create: bountyCreate, update: bountyUpdate },
      },
    },
  };
  return { client, create, cafeUpdate, scanCreate, scanUpdate, bountyCreate, bountyGet, bountyUpdate };
}

describe("measurementGatewayHandler", () => {
  const H = "x-lattency-server-key" as const;
  it("405s non-POST and 400s bad bodies before client use", async () => {
    const { client } = makeClient();
    const mk = vi.fn(() => client);
    expect((await measurementGatewayHandler(new Request("http://x", { method: "GET" }), SECRET, mk)).status).toBe(405);
    expect((await measurementGatewayHandler(req("not json", { [H]: SECRET, "content-type": "text/plain" }), SECRET, mk)).status).toBe(400);
    expect(mk).not.toHaveBeenCalled();
  });
  it("never calls makeClient when unauthorized", async () => {
    const mk = vi.fn(() => makeClient().client);
    const res = await measurementGatewayHandler(req({ action: "leaderboard" }), SECRET, mk);
    expect(res.status).toBe(401);
    expect(mk).not.toHaveBeenCalled();
  });
  it("insert persists allowlist record and derives method", async () => {
    const { client, create } = makeClient();
    const res = await measurementGatewayHandler(
      req({ action: "insert", measurement: { cafe_id: "c1", down_mbps: 50, up_mbps: 10, latency_ms: 20, is_outlier: true, id: "x" } }, { [H]: SECRET }),
      SECRET, () => client);
    expect(res.status).toBe(201);
    const rec = create.mock.calls[0][0];
    expect(rec).not.toHaveProperty("is_outlier");
    expect(rec).not.toHaveProperty("id");
    expect(rec.test_method).toBe("manual");
  });
  it("404s on missing cafe and 503s on SDK failure without leaking", async () => {
    expect((await measurementGatewayHandler(
      req({ action: "insert", measurement: { cafe_id: "none", down_mbps: 1, up_mbps: 1, latency_ms: 1 } }, { [H]: SECRET }),
      SECRET, () => makeClient({ cafe: null }).client)).status).toBe(404);
    const res = await measurementGatewayHandler(
      req({ action: "insert", measurement: { cafe_id: "c1", down_mbps: 1, up_mbps: 1, latency_ms: 1 } }, { [H]: SECRET }),
      SECRET, () => makeClient({ createErr: new Error("PRIVATE DETAIL") }).client);
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("PRIVATE DETAIL");
  });
  it("leaderboard returns only the three allowed fields", async () => {
    const { client } = makeClient({ rows: [{ contributor_user_id: "u", cafe_id: "c", measured_at: "t", contributor_ip_hash: "SECRET", photo_url: "p" }] });
    const res = await measurementGatewayHandler(req({ action: "leaderboard" }, { [H]: SECRET }), SECRET, () => client);
    const body = await res.json();
    expect(body.rows[0]).toEqual({ contributor_user_id: "u", cafe_id: "c", measured_at: "t" });
    expect(client.asServiceRole.entities.Measurement.filter).toHaveBeenCalledWith({}, "-measured_at", 500, 0);
  });
  it("cafe action returns the public projection only", async () => {
    const { client } = makeClient({ cafe: { id: "c1", name: "C", created_by_ip_hash: "SECRET", referred_by: "r" } });
    const res = await measurementGatewayHandler(req({ action: "cafe", cafe_id: "c1" }, { [H]: SECRET }), SECRET, () => client);
    const body = await res.json();
    expect(body.cafe).not.toHaveProperty("created_by_ip_hash");
    expect(body.cafe).not.toHaveProperty("referred_by");
  });
  it("rejects unknown actions", async () => {
    expect((await measurementGatewayHandler(req({ action: "drop-table" }, { [H]: SECRET }), SECRET, () => makeClient().client)).status).toBe(400);
  });
});

describe("entity RLS policy files", () => {
  it("Measurement is fully closed, Cafe read/create closed", () => {
    const m = JSON.parse(readFileSync("base44/entities/Measurement.json", "utf8"));
    const c = JSON.parse(readFileSync("base44/entities/Cafe.json", "utf8"));
    expect(m.rls).toEqual({ create: false, read: false, update: false, delete: false });
    expect(c.rls.create).toBe(false);
    expect(c.rls.read).toBe(false);
    expect(c.rls.update).toBe(false);
    expect(c.rls.delete).toBe(false);
  });
  it("VenueScan is fully closed — gateway actions are the only path", () => {
    const v = JSON.parse(readFileSync("base44/entities/VenueScan.json", "utf8"));
    expect(v.rls).toEqual({ create: false, read: false, update: false, delete: false });
    expect(v.properties.status.enum).toEqual([
      "captured",
      "processing",
      "preview",
      "refining",
      "published",
      "rejected",
      "taken_down",
      "superseded",
    ]);
    // Capture run v2 manifest + supersede fields exist alongside the rest.
    for (const field of [
      "quality_score",
      "coverage_sectors",
      "face_events",
      "supersedes_id",
      "frame_count",
      "frames_received",
    ]) {
      expect(v.properties).toHaveProperty(field);
    }
    expect(v.required).toEqual(["venue_id"]);
  });
  it("Bounty create is closed — the gateway is the only write path", () => {
    const b = JSON.parse(readFileSync("base44/entities/Bounty.json", "utf8"));
    expect(b.rls.create).toBe(false);
    // The public board read is pre-existing behaviour, deliberately kept.
    expect(b.rls.read).toBe(true);
    // No update/delete keys either — absent keys deny, which is why the
    // claim path's paid marker must ride the bounty-update gateway action.
    expect(b.rls.update).toBeUndefined();
    expect(b.rls.delete).toBeUndefined();
  });
});

const CONSENT = { venue_permission: true, patron_notice: true, timestamp: "2026-11-10T08:00:00Z" };

describe("measurementGatewayHandler venue-scan actions", () => {
  const H = "x-lattency-server-key" as const;

  it("venue-scan-insert writes an allowlisted record in captured status", async () => {
    const { client, scanCreate } = makeClient();
    const res = await measurementGatewayHandler(
      req(
        {
          action: "venue-scan-insert",
          scan: {
            venue_id: "c1",
            contributor_id: "contrib-x",
            consent_attestation: CONSENT,
            status: "published",
            splat_url: "https://evil",
            blur_verified: true,
            takedown_requested: true,
            id: "injected",
          },
        },
        { [H]: SECRET },
      ),
      SECRET,
      () => client,
    );
    expect(res.status).toBe(201);
    const rec = scanCreate.mock.calls[0][0];
    expect(rec).toEqual({
      venue_id: "c1",
      contributor_id: "contrib-x",
      capture_asset_url: null,
      consent_attestation: CONSENT,
      status: "captured",
      splat_url: null,
      takedown_requested: false,
      blur_verified: false,
      quality_score: null,
      coverage_sectors: [],
      face_events: null,
      supersedes_id: null,
      frame_count: null,
      frames_received: [],
    });
    expect(await res.json()).toEqual({ scanId: "vs-1", superseded: false });
  });

  it("venue-scan-insert retires a same-venue prior scan to superseded", async () => {
    const { client, scanCreate, scanUpdate } = makeClient({
      scan: { id: "vs-old", venue_id: "c1", status: "published" },
    });
    const res = await measurementGatewayHandler(
      req(
        {
          action: "venue-scan-insert",
          scan: {
            venue_id: "c1",
            contributor_id: "contrib-x",
            consent_attestation: CONSENT,
            supersedes_id: "vs-old",
          },
        },
        { [H]: SECRET },
      ),
      SECRET,
      () => client,
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ scanId: "vs-1", superseded: true });
    expect(client.asServiceRole.entities.VenueScan.get).toHaveBeenCalledWith("vs-old");
    expect(scanUpdate).toHaveBeenCalledWith("vs-old", { status: "superseded" });
    expect(scanCreate.mock.calls[0][0].supersedes_id).toBe("vs-old");
  });

  it("venue-scan-insert 400s on a missing or cross-venue supersedes_id", async () => {
    const { client, scanCreate } = makeClient({ scan: null });
    const missing = await measurementGatewayHandler(
      req(
        {
          action: "venue-scan-insert",
          scan: { venue_id: "c1", consent_attestation: CONSENT, supersedes_id: "nope" },
        },
        { [H]: SECRET },
      ),
      SECRET,
      () => client,
    );
    expect(missing.status).toBe(400);

    const crossVenue = await measurementGatewayHandler(
      req(
        {
          action: "venue-scan-insert",
          scan: { venue_id: "c1", consent_attestation: CONSENT, supersedes_id: "vs-old" },
        },
        { [H]: SECRET },
      ),
      SECRET,
      () => makeClient({ scan: { id: "vs-old", venue_id: "other" } }).client,
    );
    expect(crossVenue.status).toBe(400);
    expect(scanCreate).not.toHaveBeenCalled();
  });

  it("venue-scan-insert leaves a taken_down prior untouched", async () => {
    const { scanUpdate, client } = makeClient({
      scan: { id: "vs-old", venue_id: "c1", status: "taken_down" },
    });
    const res = await measurementGatewayHandler(
      req(
        {
          action: "venue-scan-insert",
          scan: { venue_id: "c1", consent_attestation: CONSENT, supersedes_id: "vs-old" },
        },
        { [H]: SECRET },
      ),
      SECRET,
      () => client,
    );
    expect(res.status).toBe(201);
    expect((await res.json()).superseded).toBe(false);
    expect(scanUpdate).not.toHaveBeenCalled();
  });

  it("venue-scan-insert 400s on missing or partial consent before writing", async () => {
    const { client, scanCreate } = makeClient();
    for (const consent_attestation of [
      undefined,
      { venue_permission: true },
      { venue_permission: true, patron_notice: false },
      { venue_permission: false, patron_notice: true },
    ]) {
      const res = await measurementGatewayHandler(
        req(
          { action: "venue-scan-insert", scan: { venue_id: "c1", consent_attestation } },
          { [H]: SECRET },
        ),
        SECRET,
        () => client,
      );
      expect(res.status).toBe(400);
    }
    expect(scanCreate).not.toHaveBeenCalled();
  });

  it("venue-scans projects non-rejected states, splat only when published", async () => {
    const { client } = makeClient({
      scanRows: [
        {
          id: "vs-1",
          venue_id: "c1",
          splat_url: "https://cdn/x.spz",
          status: "published",
          quality_score: 87,
          created_date: "2026-11-10T08:00:00Z",
          contributor_id: "SECRET",
          consent_attestation: CONSENT,
          capture_asset_url: "SECRET",
          frames_received: [{ seq: 0, ts: "x", bytes: 1 }],
        },
        {
          id: "vs-2",
          venue_id: "c1",
          splat_url: "https://cdn/draft.spz",
          status: "preview",
          quality_score: null,
          created_date: "2026-11-11T08:00:00Z",
          contributor_id: "SECRET",
        },
        {
          id: "vs-3",
          venue_id: "c1",
          status: "rejected",
          created_date: "2026-11-12T08:00:00Z",
        },
        {
          id: "vs-4",
          venue_id: "c1",
          status: "taken_down",
          created_date: "2026-11-13T08:00:00Z",
        },
        {
          id: "vs-5",
          venue_id: "c1",
          status: "superseded",
          splat_url: "https://cdn/old.spz",
          created_date: "2026-11-14T08:00:00Z",
        },
      ],
    });
    const res = await measurementGatewayHandler(
      req({ action: "venue-scans", venue_id: "c1" }, { [H]: SECRET }),
      SECRET,
      () => client,
    );
    const body = await res.json();
    // Pipeline states are transparent; exits (rejected/taken_down/
    // superseded) never surface.
    expect(body.scans).toEqual([
      {
        id: "vs-1",
        venue_id: "c1",
        splat_url: "https://cdn/x.spz",
        status: "published",
        quality_score: 87,
        created: "2026-11-10T08:00:00Z",
      },
      {
        id: "vs-2",
        venue_id: "c1",
        splat_url: null,
        status: "preview",
        quality_score: null,
        created: "2026-11-11T08:00:00Z",
      },
    ]);
    expect(client.asServiceRole.entities.VenueScan.filter).toHaveBeenCalledWith(
      { venue_id: "c1" },
      "-created_date",
      50,
      0,
    );
  });

  it("venue-scan-get returns the gating fields or null", async () => {
    const { client } = makeClient({
      scan: {
        id: "vs-1",
        venue_id: "c1",
        contributor_id: "contrib-x",
        status: "captured",
        supersedes_id: null,
        consent_attestation: CONSENT,
        frames_received: [{ seq: 0 }],
      },
    });
    const res = await measurementGatewayHandler(
      req({ action: "venue-scan-get", scan_id: "vs-1" }, { [H]: SECRET }),
      SECRET,
      () => client,
    );
    const body = await res.json();
    expect(body.scan).toEqual({
      id: "vs-1",
      venue_id: "c1",
      contributor_id: "contrib-x",
      status: "captured",
      supersedes_id: null,
    });
    // Internal fields stay internal even on the gating read.
    expect(body.scan).not.toHaveProperty("consent_attestation");
    expect(body.scan).not.toHaveProperty("frames_received");

    const missing = await measurementGatewayHandler(
      req({ action: "venue-scan-get", scan_id: "nope" }, { [H]: SECRET }),
      SECRET,
      () => makeClient({ scan: null }).client,
    );
    expect((await missing.json()).scan).toBeNull();
  });

  it("venue-scan-frame appends manifest entries and dedupes on seq", async () => {
    const { client, scanUpdate } = makeClient({
      scan: {
        id: "vs-1",
        venue_id: "c1",
        contributor_id: "contrib-x",
        status: "captured",
        frames_received: [],
      },
    });
    const res = await measurementGatewayHandler(
      req(
        {
          action: "venue-scan-frame",
          scan_id: "vs-1",
          contributor_id: "contrib-x",
          seq: 3,
          ts: "2026-11-10T08:00:01Z",
          bytes: 12345,
        },
        { [H]: SECRET },
      ),
      SECRET,
      () => client,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: 1 });
    expect(scanUpdate).toHaveBeenCalledWith("vs-1", {
      frames_received: [{ seq: 3, ts: "2026-11-10T08:00:01Z", bytes: 12345 }],
    });

    // Duplicate seq → idempotent, no second write.
    const dup = await measurementGatewayHandler(
      req(
        {
          action: "venue-scan-frame",
          scan_id: "vs-1",
          contributor_id: "contrib-x",
          seq: 3,
          ts: "2026-11-10T08:00:01Z",
          bytes: 12345,
        },
        { [H]: SECRET },
      ),
      SECRET,
      () =>
        makeClient({
          scan: {
            id: "vs-1",
            contributor_id: "contrib-x",
            status: "captured",
            frames_received: [{ seq: 3, ts: "t", bytes: 1 }],
          },
        }).client,
    );
    expect((await dup.json()).deduped).toBe(true);
  });

  it("venue-scan-frame 403s contributor mismatch and 409s non-captured scans", async () => {
    const res = await measurementGatewayHandler(
      req(
        {
          action: "venue-scan-frame",
          scan_id: "vs-1",
          contributor_id: "contrib-y",
          seq: 0,
          ts: "t",
          bytes: 10,
        },
        { [H]: SECRET },
      ),
      SECRET,
      () =>
        makeClient({
          scan: { id: "vs-1", contributor_id: "contrib-x", status: "captured" },
        }).client,
    );
    expect(res.status).toBe(403);

    const processing = await measurementGatewayHandler(
      req(
        {
          action: "venue-scan-frame",
          scan_id: "vs-1",
          contributor_id: "contrib-x",
          seq: 0,
          ts: "t",
          bytes: 10,
        },
        { [H]: SECRET },
      ),
      SECRET,
      () =>
        makeClient({
          scan: { id: "vs-1", contributor_id: "contrib-x", status: "processing" },
        }).client,
    );
    expect(processing.status).toBe(409);
  });

  it("venue-scan-frame 400s on invalid seq/ts/bytes before reading", async () => {
    const { client, scanUpdate } = makeClient();
    for (const patch of [
      { seq: -1 },
      { seq: 1.5 },
      { seq: 5000 },
      { ts: "" },
      { ts: "x".repeat(65) },
      { bytes: 0 },
      { bytes: 512 * 1024 + 1 },
      { bytes: "10" },
    ]) {
      const res = await measurementGatewayHandler(
        req(
          {
            action: "venue-scan-frame",
            scan_id: "vs-1",
            contributor_id: "contrib-x",
            seq: 0,
            ts: "t",
            bytes: 10,
            ...patch,
          },
          { [H]: SECRET },
        ),
        SECRET,
        () => client,
      );
      expect(res.status).toBe(400);
    }
    expect(scanUpdate).not.toHaveBeenCalled();
  });

  it("venue-scan-frame stores the blob url in the manifest entry when provided", async () => {
    const { client, scanUpdate } = makeClient({
      scan: {
        id: "vs-1",
        contributor_id: "contrib-x",
        status: "captured",
        frames_received: [],
      },
    });
    const res = await measurementGatewayHandler(
      req(
        {
          action: "venue-scan-frame",
          scan_id: "vs-1",
          contributor_id: "contrib-x",
          seq: 0,
          ts: "t",
          bytes: 10,
          url: "https://store.private.blob.vercel-storage.com/scans/vs-1/0.jpg",
        },
        { [H]: SECRET },
      ),
      SECRET,
      () => client,
    );
    expect(res.status).toBe(200);
    expect(scanUpdate).toHaveBeenCalledWith("vs-1", {
      frames_received: [
        {
          seq: 0,
          ts: "t",
          bytes: 10,
          url: "https://store.private.blob.vercel-storage.com/scans/vs-1/0.jpg",
        },
      ],
    });

    // A non-https or over-long url is rejected before any entity read.
    for (const url of ["http://insecure/x.jpg", "x".repeat(2049), 42]) {
      const bad = await measurementGatewayHandler(
        req(
          {
            action: "venue-scan-frame",
            scan_id: "vs-1",
            contributor_id: "contrib-x",
            seq: 1,
            ts: "t",
            bytes: 10,
            url,
          },
          { [H]: SECRET },
        ),
        SECRET,
        () => client,
      );
      expect(bad.status).toBe(400);
    }
  });

  it("venue-scan-finalize writes the manifest and leaves status captured", async () => {
    const { client, scanUpdate } = makeClient({
      scan: {
        id: "vs-1",
        venue_id: "c1",
        contributor_id: "contrib-x",
        status: "captured",
      },
    });
    const res = await measurementGatewayHandler(
      req(
        {
          action: "venue-scan-finalize",
          scan_id: "vs-1",
          contributor_id: "contrib-x",
          frame_count: 120,
          quality_score: 82,
          coverage_sectors: ["N", "NE", "E"],
          face_events: 1,
        },
        { [H]: SECRET },
      ),
      SECRET,
      () => client,
    );
    expect(res.status).toBe(200);
    expect(scanUpdate).toHaveBeenCalledWith("vs-1", {
      frame_count: 120,
      quality_score: 82,
      coverage_sectors: ["N", "NE", "E"],
      face_events: 1,
    });
  });

  it("venue-scan-finalize rejects bad manifests and non-captured scans", async () => {
    const { client, scanUpdate } = makeClient();
    const base = {
      action: "venue-scan-finalize",
      scan_id: "vs-1",
      contributor_id: "contrib-x",
      frame_count: 10,
      quality_score: 50,
      coverage_sectors: ["N"],
      face_events: 0,
    };
    for (const patch of [
      { frame_count: -1 },
      { frame_count: 1.5 },
      { quality_score: 101 },
      { quality_score: "high" },
      { coverage_sectors: ["NNW"] },
      { coverage_sectors: "N" },
      { face_events: -1 },
      { face_events: 0.5 },
    ]) {
      const res = await measurementGatewayHandler(
        req({ ...base, ...patch }, { [H]: SECRET }),
        SECRET,
        () => client,
      );
      expect(res.status).toBe(400);
    }

    const done = await measurementGatewayHandler(
      req(base, { [H]: SECRET }),
      SECRET,
      () =>
        makeClient({
          scan: { id: "vs-1", contributor_id: "contrib-x", status: "published" },
        }).client,
    );
    expect(done.status).toBe(409);
    expect(scanUpdate).not.toHaveBeenCalled();
  });

  it("venue-scan-takedown sets the flag on a venue match, 404s otherwise", async () => {
    const { client, scanUpdate } = makeClient({ scan: { id: "vs-1", venue_id: "c1" } });
    const res = await measurementGatewayHandler(
      req(
        { action: "venue-scan-takedown", scan_id: "vs-1", venue_id: "c1", reason: "owner request" },
        { [H]: SECRET },
      ),
      SECRET,
      () => client,
    );
    expect(res.status).toBe(200);
    expect(scanUpdate).toHaveBeenCalledWith("vs-1", {
      takedown_requested: true,
      takedown_reason: "owner request",
    });

    const wrongVenue = await measurementGatewayHandler(
      req(
        { action: "venue-scan-takedown", scan_id: "vs-1", venue_id: "other", reason: "x" },
        { [H]: SECRET },
      ),
      SECRET,
      () => makeClient({ scan: { id: "vs-1", venue_id: "c1" } }).client,
    );
    expect(wrongVenue.status).toBe(404);

    const missing = await measurementGatewayHandler(
      req(
        { action: "venue-scan-takedown", scan_id: "nope", venue_id: "c1", reason: "x" },
        { [H]: SECRET },
      ),
      SECRET,
      () => makeClient({ scan: null }).client,
    );
    expect(missing.status).toBe(404);
  });

  it("venue-scan-takedown 400s on an over-long or missing reason", async () => {
    const { client } = makeClient();
    for (const reason of ["x".repeat(501), "", 42]) {
      const res = await measurementGatewayHandler(
        req(
          { action: "venue-scan-takedown", scan_id: "vs-1", venue_id: "c1", reason },
          { [H]: SECRET },
        ),
        SECRET,
        () => client,
      );
      expect(res.status).toBe(400);
    }
  });
});

describe("measurementGatewayHandler micro-contribution actions", () => {
  const H = "x-lattency-server-key" as const;

  it("venue-fact writes only the allowlisted field on the venue record", async () => {
    const { client, cafeUpdate } = makeClient();
    const res = await measurementGatewayHandler(
      req(
        {
          action: "venue-fact",
          cafe_id: "c1",
          field: "seating",
          value: "tables",
          contributor_id: "contrib-x",
          is_admin: true,
          photo_url: "data:image/jpeg;base64,evil",
        },
        { [H]: SECRET },
      ),
      SECRET,
      () => client,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(cafeUpdate).toHaveBeenCalledWith("c1", { seating: "tables" });
  });

  it("venue-fact 400s on non-allowlisted fields before touching the entity", async () => {
    const { client, cafeUpdate } = makeClient();
    for (const field of ["id", "created_by_user_id", "photo_url", "ai_summary", "milkOptions", 7]) {
      const res = await measurementGatewayHandler(
        req(
          { action: "venue-fact", cafe_id: "c1", field, value: "tables" },
          { [H]: SECRET },
        ),
        SECRET,
        () => client,
      );
      expect(res.status).toBe(400);
    }
    expect(cafeUpdate).not.toHaveBeenCalled();
  });

  it("venue-fact 400s on values outside the vocabulary", async () => {
    const { client, cafeUpdate } = makeClient();
    for (const [field, value] of [
      ["power_outlets", "yes"],
      ["seating", "hammocks"],
      ["price_tier", "ultra"],
      ["venue_type", "spaceship"],
      ["milk_options", "yak"],
      ["wifi_network", "x".repeat(65)],
    ] as const) {
      const res = await measurementGatewayHandler(
        req({ action: "venue-fact", cafe_id: "c1", field, value }, { [H]: SECRET }),
        SECRET,
        () => client,
      );
      expect(res.status).toBe(400);
    }
    expect(cafeUpdate).not.toHaveBeenCalled();
  });

  it("venue-fact merges milk_options into the existing menu, deduped", async () => {
    const { client, cafeUpdate } = makeClient({
      cafe: { id: "c1", milk_options: ["dairy", "oat", 42] },
    });
    const res = await measurementGatewayHandler(
      req(
        { action: "venue-fact", cafe_id: "c1", field: "milk_options", value: ["oat", "soy"] },
        { [H]: SECRET },
      ),
      SECRET,
      () => client,
    );
    expect(res.status).toBe(200);
    expect(cafeUpdate).toHaveBeenCalledWith("c1", {
      milk_options: ["dairy", "oat", "soy"],
    });
  });

  it("venue-fact 404s on an unknown café", async () => {
    const res = await measurementGatewayHandler(
      req(
        { action: "venue-fact", cafe_id: "none", field: "seating", value: "tables" },
        { [H]: SECRET },
      ),
      SECRET,
      () => makeClient({ cafe: null }).client,
    );
    expect(res.status).toBe(404);
  });

  it("venue-photo writes the data URL and newest-wins", async () => {
    const { client, cafeUpdate } = makeClient({
      cafe: { id: "c1", photo_url: "data:image/jpeg;base64,old" },
    });
    const res = await measurementGatewayHandler(
      req(
        {
          action: "venue-photo",
          cafe_id: "c1",
          photo_url: "data:image/jpeg;base64,bmV3",
          contributor_id: "contrib-x",
        },
        { [H]: SECRET },
      ),
      SECRET,
      () => client,
    );
    expect(res.status).toBe(200);
    expect(cafeUpdate).toHaveBeenCalledWith("c1", {
      photo_url: "data:image/jpeg;base64,bmV3",
    });
  });

  it("venue-photo 400s on non-image, oversized, or missing payloads", async () => {
    const { client, cafeUpdate } = makeClient();
    for (const photo_url of [
      undefined,
      42,
      "https://cdn.example/x.jpg",
      "data:image/gif;base64,R0lG",
      "data:text/plain;base64,aGk=",
      `data:image/png;base64,${"A".repeat(1_000_000)}`,
    ]) {
      const res = await measurementGatewayHandler(
        req({ action: "venue-photo", cafe_id: "c1", photo_url }, { [H]: SECRET }),
        SECRET,
        () => client,
      );
      expect(res.status).toBe(400);
    }
    expect(cafeUpdate).not.toHaveBeenCalled();
  });

  it("venue-photo 404s on an unknown café", async () => {
    const res = await measurementGatewayHandler(
      req(
        { action: "venue-photo", cafe_id: "none", photo_url: "data:image/png;base64,eA==" },
        { [H]: SECRET },
      ),
      SECRET,
      () => makeClient({ cafe: null }).client,
    );
    expect(res.status).toBe(404);
  });
});

describe("measurementGatewayHandler venue-scan-status action", () => {
  const H = "x-lattency-server-key" as const;

  function statusReq(
    status: string,
    scanStatus = "captured",
    extra: Record<string, unknown> = {},
  ) {
    const { client, scanUpdate } = makeClient({
      scan: { id: "vs-1", venue_id: "c1", status: scanStatus },
    });
    return {
      client,
      scanUpdate,
      call: () =>
        measurementGatewayHandler(
          req(
            {
              action: "venue-scan-status",
              scan_id: "vs-1",
              status,
              ...extra,
            },
            { [H]: SECRET },
          ),
          SECRET,
          () => client,
        ),
    };
  }

  it("walks the forward chain and writes only the status", async () => {
    const chain: [string, string][] = [
      ["captured", "processing"],
      ["processing", "preview"],
      ["preview", "refining"],
      ["refining", "published"],
    ];
    for (const [from, to] of chain) {
      const extra =
        to === "published"
          ? { splat_url: "https://blob/x.spz", blur_verified: true }
          : {};
      const { scanUpdate, call } = statusReq(to, from, extra);
      const res = await call();
      expect(res.status).toBe(200);
      expect(scanUpdate).toHaveBeenCalledWith(
        "vs-1",
        to === "published"
          ? {
              status: "published",
              splat_url: "https://blob/x.spz",
              blur_verified: true,
            }
          : { status: to },
      );
    }
  });

  it("409s illegal jumps — no regression, no skipping, no exits from terminal", async () => {
    const illegal: [string, string][] = [
      ["captured", "preview"],
      ["captured", "published"],
      ["processing", "published"],
      ["preview", "processing"],
      ["preview", "published"],
      ["rejected", "processing"],
      ["taken_down", "rejected"],
      ["superseded", "processing"],
      ["published", "rejected"],
      ["published", "refining"],
      ["captured", "taken_down"],
    ];
    for (const [from, to] of illegal) {
      const { scanUpdate, call } = statusReq(to, from, {
        splat_url: "https://blob/x.spz",
        blur_verified: true,
      });
      const res = await call();
      expect(res.status, `${from} → ${to}`).toBe(409);
      expect(scanUpdate).not.toHaveBeenCalled();
    }
  });

  it("allows rejected from any pre-publish stage and superseded from published", async () => {
    for (const from of ["captured", "processing", "preview", "refining"]) {
      const { scanUpdate, call } = statusReq("rejected", from);
      const res = await call();
      expect(res.status, `${from} → rejected`).toBe(200);
      expect(scanUpdate).toHaveBeenCalledWith("vs-1", { status: "rejected" });
    }
    const { scanUpdate, call } = statusReq("superseded", "published");
    expect((await call()).status).toBe(200);
    expect(scanUpdate).toHaveBeenCalledWith("vs-1", { status: "superseded" });
  });

  it("published requires splat_url AND blur_verified === true — enforced here", async () => {
    for (const extra of [
      {},
      { splat_url: "https://blob/x.spz" },
      { blur_verified: true },
      { splat_url: "https://blob/x.spz", blur_verified: false },
      { splat_url: "", blur_verified: true },
    ]) {
      const { scanUpdate, call } = statusReq("published", "refining", extra);
      const res = await call();
      expect(res.status, JSON.stringify(extra)).toBe(400);
      expect(scanUpdate).not.toHaveBeenCalled();
    }
  });

  it("400s on invalid status, non-https splat_url, and bad blur_verified", async () => {
    for (const [status, extra] of [
      ["garbage", {}],
      ["preview", { splat_url: "http://insecure/x" }],
      ["preview", { splat_url: "x".repeat(2049) }],
      ["preview", { blur_verified: "yes" }],
    ] as const) {
      const { scanUpdate, call } = statusReq(status, "captured", extra);
      expect((await call()).status).toBe(400);
      expect(scanUpdate).not.toHaveBeenCalled();
    }
  });

  it("dedupes same-status requests without writing", async () => {
    const { scanUpdate, call } = statusReq("processing", "processing");
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      status: "processing",
      deduped: true,
    });
    expect(scanUpdate).not.toHaveBeenCalled();
  });

  it("404s on a missing scan and stores splat_url on intermediate steps", async () => {
    const missing = await measurementGatewayHandler(
      req(
        { action: "venue-scan-status", scan_id: "nope", status: "processing" },
        { [H]: SECRET },
      ),
      SECRET,
      () => makeClient({ scan: null }).client,
    );
    expect(missing.status).toBe(404);

    const { scanUpdate, call } = statusReq("preview", "processing", {
      splat_url: "https://blob/draft.spz",
    });
    expect((await call()).status).toBe(200);
    expect(scanUpdate).toHaveBeenCalledWith("vs-1", {
      status: "preview",
      splat_url: "https://blob/draft.spz",
    });
  });
});

describe("measurementGatewayHandler bounty-insert action", () => {
  const H = "x-lattency-server-key" as const;
  const call = (
    bounty: unknown,
    client: ReturnType<typeof makeClient>["client"] = makeClient().client,
  ) =>
    measurementGatewayHandler(
      req({ action: "bounty-insert", bounty }, { [H]: SECRET }),
      SECRET,
      () => client,
    );

  it("writes an allowlisted record with server-enforced progress/status", async () => {
    const { client, bountyCreate } = makeClient();
    const res = await call(
      {
        title: "3 express cafés in Hoxton",
        description: "Sponsored",
        reward: 20,
        currency: "NIM",
        reward_lunas: 2_000_000,
        target_city: "london",
        target_neighbourhood: "Hoxton",
        criteria: "tier-target:express",
        target: 3,
        sponsor_name: "Community Fibre",
        sponsor_kind: "isp",
        kind: "tier-target",
        expires_at: "2099-12-31",
        funding_tx_hash: "deadbeef",
        client_intent_id: "ci-1",
        funding_status: "verified",
        contributing_contributor_ids: ["contrib-a"],
        // Everything below must be dropped or overridden.
        progress: 99,
        status: "paid",
        active: false,
        claimed_by_address: "NQ07",
        tx_hash: "0x",
        id: "injected",
        created_by: "attacker@example.com",
        approved: true,
      },
      client,
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ bountyId: "b-1" });
    const rec = bountyCreate.mock.calls[0][0];
    expect(rec).toEqual({
      title: "3 express cafés in Hoxton",
      description: "Sponsored",
      reward: 20,
      currency: "NIM",
      reward_lunas: 2_000_000,
      target_city: "london",
      target_neighbourhood: "Hoxton",
      criteria: "tier-target:express",
      target: 3,
      progress: 0,
      sponsor_name: "Community Fibre",
      sponsor_kind: "isp",
      kind: "tier-target",
      expires_at: "2099-12-31",
      active: true,
      status: "open",
      claimed_by_address: null,
      tx_hash: null,
      funding_tx_hash: "deadbeef",
      client_intent_id: "ci-1",
      funding_status: "verified",
      contributing_contributor_ids: ["contrib-a"],
    });
  });

  it("rejects missing or out-of-enum funding_status before writing", async () => {
    const { client, bountyCreate } = makeClient();
    for (const funding_status of [undefined, null, "unverfied", "VERIFIED", 42, true]) {
      const res = await call(
        { title: "t", reward: 1, funding_status },
        client,
      );
      expect(res.status, JSON.stringify(funding_status)).toBe(400);
    }
    expect(bountyCreate).not.toHaveBeenCalled();
  });

  it("keeps an honest unverified flag — the board hides it downstream", async () => {
    const { client, bountyCreate } = makeClient();
    const res = await call(
      { title: "t", reward: 1, funding_status: "unverified" },
      client,
    );
    expect(res.status).toBe(201);
    expect(bountyCreate.mock.calls[0][0].funding_status).toBe("unverified");
  });

  it("400s on missing title/reward and malformed fields", async () => {
    const { client, bountyCreate } = makeClient();
    for (const bounty of [
      { reward: 1, funding_status: "verified" },
      { title: "", reward: 1, funding_status: "verified" },
      { title: "t", funding_status: "verified" },
      { title: "t", reward: 0, funding_status: "verified" },
      { title: "t", reward: -5, funding_status: "verified" },
      { title: "t", reward: "20", funding_status: "verified" },
      { title: "t", reward: 1, funding_status: "verified", sponsor_kind: "government" },
      { title: "t", reward: 1, funding_status: "verified", kind: "rigged" },
      { title: "t", reward: 1, funding_status: "verified", target: 0 },
      { title: "t", reward: 1, funding_status: "verified", target: 1.5 },
      { title: "t", reward: 1, funding_status: "verified", reward_lunas: -1 },
      { title: "t", reward: 1, funding_status: "verified", contributing_contributor_ids: "contrib-a" },
      { title: "t", reward: 1, funding_status: "verified", contributing_contributor_ids: [42] },
    ]) {
      const res = await call(bounty, client);
      expect(res.status, JSON.stringify(bounty)).toBe(400);
    }
    expect(bountyCreate).not.toHaveBeenCalled();
  });

  it("defaults the entity-defaulted fields when omitted", async () => {
    const { client, bountyCreate } = makeClient();
    const res = await call(
      { title: "t", reward: 5, funding_status: "verified" },
      client,
    );
    expect(res.status).toBe(201);
    const rec = bountyCreate.mock.calls[0][0];
    expect(rec.currency).toBe("NIM");
    expect(rec.reward_lunas).toBe(500_000);
    expect(rec.target).toBe(1);
    expect(rec.sponsor_kind).toBe("community");
    expect(rec.kind).toBe("first-in-neighbourhood");
    expect(rec.contributing_contributor_ids).toEqual([]);
    expect(rec.expires_at).toBeNull();
    expect(rec.funding_tx_hash).toBeNull();
    expect(rec.client_intent_id).toBeNull();
  });
});

describe("measurementGatewayHandler bounty-update action", () => {
  const H = "x-lattency-server-key" as const;
  const call = (
    body: Record<string, unknown>,
    client: ReturnType<typeof makeClient>["client"] = makeClient().client,
  ) =>
    measurementGatewayHandler(
      req({ action: "bounty-update", ...body }, { [H]: SECRET }),
      SECRET,
      () => client,
    );

  it("persists the claim-path patch and returns ok", async () => {
    const { client, bountyGet, bountyUpdate } = makeClient();
    const res = await call(
      {
        bounty_id: "b-1",
        patch: {
          status: "paid",
          claimed_by_address: "NQ07 ABC123",
          tx_hash: "0xdef",
        },
      },
      client,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(bountyGet).toHaveBeenCalledWith("b-1");
    expect(bountyUpdate).toHaveBeenCalledWith("b-1", {
      status: "paid",
      claimed_by_address: "NQ07 ABC123",
      tx_hash: "0xdef",
    });
  });

  it("rejects write-once funding and backend-owned fields", async () => {
    const { client, bountyUpdate } = makeClient();
    for (const patch of [
      { funding_tx_hash: "0xabc" },
      { funding_status: "verified" },
      { client_intent_id: "ci-1" },
      // progress/dedupe are update-bounty-progress's surface, not the
      // claim path's — a reset to 0 would un-fill a claimed bounty.
      { progress: 0 },
      { contributing_contributor_ids: [] },
      // Anything else is an unknown key.
      { id: "injected" },
      { active: false },
      { reward: 999 },
    ]) {
      const res = await call({ bounty_id: "b-1", patch }, client);
      expect(res.status, JSON.stringify(patch)).toBe(400);
    }
    expect(bountyUpdate).not.toHaveBeenCalled();
  });

  it("400s on a malformed bounty_id, patch, or status value", async () => {
    const { client, bountyUpdate } = makeClient();
    for (const body of [
      { patch: { status: "paid" } },
      { bounty_id: "" },
      { bounty_id: "b-1" },
      { bounty_id: "b-1", patch: null },
      { bounty_id: "b-1", patch: [] },
      { bounty_id: "b-1", patch: {} },
      { bounty_id: "b-1", patch: { status: "claimed" } },
      { bounty_id: "b-1", patch: { status: 42 } },
      { bounty_id: "b-1", patch: { claimed_by_address: 42 } },
      { bounty_id: "b-1", patch: { tx_hash: "x".repeat(300) } },
    ]) {
      const res = await call(body, client);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(bountyUpdate).not.toHaveBeenCalled();
  });

  it("404s on an unknown bounty — null get and thrown 404 alike", async () => {
    const missing = await call(
      { bounty_id: "nope", patch: { status: "paid" } },
      makeClient({ bounty: null }).client,
    );
    expect(missing.status).toBe(404);

    const err404 = Object.assign(new Error("not found"), { status: 404 });
    const thrown = await call(
      { bounty_id: "nope", patch: { status: "paid" } },
      makeClient({ bountyGetErr: err404 }).client,
    );
    expect(thrown.status).toBe(404);
  });
});

describe("publicCafe", () => {
  it("strips non-public fields", () => {
    const out = publicCafe({ id: "1", name: "C", created_by_ip_hash: "s", referred_by: "r", extra: 1 });
    expect(out).toEqual({ id: "1", name: "C" });
  });
});
