export type TestMethod = "manual" | "browser-auto";

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const FUTURE_SKEW_MS = 5 * 60_000;
const EXPECTED_DOWNLOAD_BYTES = 10_485_760;

export function validateMeasurement(body: unknown, now = Date.now()): string | null {
  if (body === null || body === undefined || typeof body !== "object" || Array.isArray(body))
    return "body must be an object";
  const b = body as Record<string, unknown>;

  if (!Number.isFinite(b.downMbps) || (b.downMbps as number) < 0 || (b.downMbps as number) > 10_000)
    return "downMbps must be a number between 0 and 10000";
  if (!Number.isFinite(b.upMbps) || (b.upMbps as number) < 0 || (b.upMbps as number) > 10_000)
    return "upMbps must be a number between 0 and 10000";
  if (!Number.isFinite(b.latencyMs) || (b.latencyMs as number) < 0 || (b.latencyMs as number) > 10_000)
    return "latencyMs must be a number between 0 and 10000";
  if (b.jitterMs !== undefined && (!Number.isFinite(b.jitterMs) || (b.jitterMs as number) < 0))
    return "jitterMs must be a non-negative number";
  if (b.lossPct !== undefined && (!Number.isFinite(b.lossPct) || (b.lossPct as number) < 0 || (b.lossPct as number) > 100))
    return "lossPct must be a number between 0 and 100";
  if (b.contributorId !== undefined && typeof b.contributorId !== "string")
    return "contributorId must be a string when provided";
  if (b.referredBy !== undefined && typeof b.referredBy !== "string")
    return "referredBy must be a string when provided";
  if (b.testMethod !== undefined && b.testMethod !== "manual" && b.testMethod !== "browser-auto")
    return "testMethod must be manual or browser-auto";
  if (b.targetServer !== undefined && (typeof b.targetServer !== "string" || b.targetServer.length > 128))
    return "targetServer must be a string of at most 128 characters";
  if (b.photoUrl !== undefined && typeof b.photoUrl !== "string")
    return "photoUrl must be a string when provided";
  if (b.measuredAt !== undefined) {
    if (typeof b.measuredAt !== "string" || !ISO_UTC_RE.test(b.measuredAt))
      return "measuredAt must be a valid UTC ISO timestamp no more than 5 minutes in the future";
    const at = new Date(b.measuredAt).getTime();
    if (!Number.isFinite(at))
      return "measuredAt must be a valid UTC ISO timestamp no more than 5 minutes in the future";
    const canonical = new Date(at).toISOString();
    const expected = b.measuredAt.includes(".") ? b.measuredAt : b.measuredAt.replace("Z", ".000Z");
    if (canonical !== expected)
      return "measuredAt must be a valid UTC ISO timestamp no more than 5 minutes in the future";
    if (at > now + FUTURE_SKEW_MS)
      return "measuredAt must be a valid UTC ISO timestamp no more than 5 minutes in the future";
  }

  const hasBytes = b.downloadBytes !== undefined;
  const hasDuration = b.downloadDurationMs !== undefined;
  if (hasBytes !== hasDuration) return "downloadBytes and downloadDurationMs must be provided together";
  if (hasBytes) {
    if (b.downloadBytes !== EXPECTED_DOWNLOAD_BYTES) return "downloadBytes must match the complete 10 MiB test download";
    if (typeof b.downloadDurationMs !== "number" || !Number.isFinite(b.downloadDurationMs) || (b.downloadDurationMs as number) <= 0)
      return "downloadDurationMs must be a positive finite number";
    const expected = (EXPECTED_DOWNLOAD_BYTES * 8) / ((b.downloadDurationMs as number) * 1000);
    if (!Number.isFinite(expected) || expected <= 0) return "download metadata yields an invalid rate";
    if (Math.abs((b.downMbps as number) - expected) > Math.max(0.2, expected * 0.02))
      return "downMbps does not match the supplied download metadata";
  }
  if (b.testMethod === "browser-auto" && !hasBytes)
    return "browser-auto requires complete download metadata";

  return null;
}

export function resolveTestMethod(body: unknown): TestMethod {
  if (body === null || body === undefined || typeof body !== "object" || Array.isArray(body))
    return "manual";
  if (validateMeasurement(body) !== null) return "manual";
  const b = body as Record<string, unknown>;
  const hasAutoMetadata =
    b.downloadBytes !== undefined && b.downloadDurationMs !== undefined;
  return hasAutoMetadata ? "browser-auto" : "manual";
}

export function measurementInputFromRecord(value: Record<string, unknown>) {
  return {
    downMbps: value.down_mbps,
    upMbps: value.up_mbps,
    latencyMs: value.latency_ms,
    jitterMs: value.jitter_ms ?? undefined,
    lossPct: value.loss_pct ?? undefined,
    measuredAt: value.measured_at ?? undefined,
    photoUrl: value.photo_url ?? undefined,
    testMethod: value.test_method ?? undefined,
    targetServer: value.target_server ?? undefined,
    deviceType: value.device_type ?? undefined,
    downloadBytes: value.download_bytes ?? undefined,
    downloadDurationMs: value.download_duration_ms ?? undefined,
    contributorIpHash: value.contributor_ip_hash ?? undefined,
    contributorId: value.contributor_user_id ?? undefined,
    referredBy: value.referred_by ?? undefined,
  };
}

export function measurementRecord(
  value: Record<string, unknown>,
  cafeId: string,
  now = Date.now(),
) {
  const measuredAt =
    typeof value.measured_at === "string"
      ? value.measured_at
      : new Date(now).toISOString();
  const hour = new Date(measuredAt).getUTCHours();
  return {
    cafe_id: cafeId,
    down_mbps: value.down_mbps,
    up_mbps: value.up_mbps,
    latency_ms: value.latency_ms,
    jitter_ms: value.jitter_ms ?? null,
    loss_pct: value.loss_pct ?? null,
    measured_at: measuredAt,
    time_bucket: hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening",
    photo_url: value.photo_url ?? null,
    test_method: resolveTestMethod(measurementInputFromRecord(value)),
    target_server: value.target_server ?? null,
    device_type: value.device_type ?? null,
    download_bytes: value.download_bytes ?? null,
    download_duration_ms: value.download_duration_ms ?? null,
    contributor_ip_hash: value.contributor_ip_hash ?? null,
    contributor_user_id: value.contributor_user_id ?? null,
    referred_by: value.referred_by ?? null,
  };
}
