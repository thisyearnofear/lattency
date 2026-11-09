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
}> = {}) {
  const create = vi.fn().mockImplementation(() =>
    over.createErr ? Promise.reject(over.createErr) : Promise.resolve({ id: "m-1" }));
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
      },
    },
  };
  return { client, create };
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
});

describe("publicCafe", () => {
  it("strips non-public fields", () => {
    const out = publicCafe({ id: "1", name: "C", created_by_ip_hash: "s", referred_by: "r", extra: 1 });
    expect(out).toEqual({ id: "1", name: "C" });
  });
});
