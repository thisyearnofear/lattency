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
});

function makeClient(over: Partial<{
  rows: Record<string, unknown>[];
  cafe: Record<string, unknown> | null;
  createErr: Error;
  scanRows: Record<string, unknown>[];
  scan: Record<string, unknown> | null;
  scanGetErr: Error;
}> = {}) {
  const create = vi.fn().mockImplementation(() =>
    over.createErr ? Promise.reject(over.createErr) : Promise.resolve({ id: "m-1" }));
  const scanCreate = vi.fn().mockResolvedValue({ id: "vs-1" });
  const scanUpdate = vi.fn().mockResolvedValue({});
  const client = {
    asServiceRole: {
      entities: {
        Measurement: {
          filter: vi.fn().mockResolvedValue(over.rows ?? []),
          create,
        },
        Cafe: {
          get: vi.fn().mockResolvedValue(over.cafe !== undefined ? over.cafe : { id: "c1", name: "C" }),
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
      },
    },
  };
  return { client, create, scanCreate, scanUpdate };
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

describe("publicCafe", () => {
  it("strips non-public fields", () => {
    const out = publicCafe({ id: "1", name: "C", created_by_ip_hash: "s", referred_by: "r", extra: 1 });
    expect(out).toEqual({ id: "1", name: "C" });
  });
});
