// In-browser speed test for the "Run test" button on the measurement form.
//
// Measures three things against Vercel's edge CDN (the same target for every
// contributor in a given city, so café-to-café comparisons are honest):
//
//   1. Ping / jitter / loss — repeated HEAD requests to the static download
//      blob. RTT is measured per request; jitter is the mean absolute
//      deviation of RTTs; loss is failed/total. HEAD requests don't transfer
//      a body so each sample is pure round-trip.
//
//   2. Download — a single streaming GET of the 10 MB blob. We read the
//      ReadableStream chunk-by-chunk, accumulating bytes against a timer.
//      Streaming keeps the main thread free (each chunk read is async and
//      yields to the event loop) so the UI stays responsive without a Web
//      Worker. The banded tier system (express ≥ 50, local 10–49, suspended
//      < 10) tolerates the ~5 ms scheduling jitter of main-thread timing.
//
//   3. Upload — sequential POSTs of 1 MB payloads to /api/speedtest/upload.
//      The server consumes and discards the body; the client measures total
//      upload time. Multiple small POSTs stay within Vercel's 4.5 MB
//      serverless body limit.
//
// All fetches use cache: 'no-store' so the browser never serves a cached
// response. The CDN edge still caches the static blob — that's the target
// we want to measure (wifi + last-mile + transit to the nearest edge).
//
// Inspired by the techniques in librespeed/speedtest and
// openspeedtest/Speed-Test: XHR/fetch against static payloads, repeated
// small requests for latency, and chunked upload. Reimplemented in
// TypeScript for this codebase rather than vendored.

import type { MeasurementReading } from "./types";

// ─── Configuration ───────────────────────────────────────────────────────

const DOWNLOAD_BLOB = "/speedtest/download.bin";
const UPLOAD_ENDPOINT = "/api/speedtest/upload";

const PING_SAMPLES = 10;
const UPLOAD_ROUNDS = 3;
const UPLOAD_PAYLOAD_BYTES = 1_048_576; // 1 MB per POST — under Vercel's 4.5 MB limit

// ─── Public API ──────────────────────────────────────────────────────────

export type SpeedTestPhase = "ping" | "download" | "upload" | "done";

export interface SpeedTestProgress {
  phase: SpeedTestPhase;
  /** Current download Mbps during the download phase. */
  downMbps?: number;
  /** Finalized ping once the ping phase completes. */
  latencyMs?: number;
  /** Finalized jitter once the ping phase completes. */
  jitterMs?: number;
  /** Finalized loss % once the ping phase completes. */
  lossPct?: number;
  /** Finalized upload Mbps during/after the upload phase. */
  upMbps?: number;
}

export interface SpeedTestResult extends MeasurementReading {
  /** Bytes transferred in the download phase. */
  downloadBytes: number;
  /** Download phase wall-clock duration in ms. */
  downloadDurationMs: number;
  /** Vercel edge region id (from x-vercel-id response header). */
  targetServer: string;
}

export type ProgressCallback = (p: SpeedTestProgress) => void;

/**
 * Run a full speed test (ping → download → upload) and return the result.
 * The callback fires on each phase transition and during download with
 * live Mbps, so the UI can render a gauge.
 */
export async function runSpeedTest(
  onProgress?: ProgressCallback,
): Promise<SpeedTestResult> {
  // Phase 1: ping / jitter / loss.
  const ping = await measurePing(onProgress);

  // Phase 2: download.
  const download = await measureDownload(onProgress);

  // Phase 3: upload.
  const upload = await measureUpload(onProgress);

  onProgress?.({ phase: "done" });

  return {
    downMbps: download.mbps,
    upMbps: upload.mbps,
    latencyMs: ping.latencyMs,
    jitterMs: ping.jitterMs,
    lossPct: ping.lossPct,
    downloadBytes: download.bytes,
    downloadDurationMs: download.durationMs,
    targetServer: ping.targetServer,
  };
}

// ─── Ping / jitter / loss ────────────────────────────────────────────────

interface PingResult {
  latencyMs: number;
  jitterMs: number;
  lossPct: number;
  targetServer: string;
}

async function measurePing(onProgress?: ProgressCallback): Promise<PingResult> {
  const rtts: number[] = [];
  let failures = 0;
  let targetServer = "unknown";

  for (let i = 0; i < PING_SAMPLES; i++) {
    const start = performance.now();
    try {
      const res = await fetch(DOWNLOAD_BLOB, {
        method: "HEAD",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rtt = performance.now() - start;
      rtts.push(rtt);
      // Capture the edge region once — it's the same for every request.
      if (targetServer === "unknown") {
        targetServer = res.headers.get("x-vercel-id") ?? "unknown";
      }
    } catch {
      failures++;
    }
  }

  const latencyMs = rtts.length > 0 ? median(rtts) : 0;
  const jitterMs = rtts.length > 1 ? meanAbsoluteDeviation(rtts) : 0;
  const lossPct = (failures / PING_SAMPLES) * 100;

  onProgress?.({
    phase: "ping",
    latencyMs: round(latencyMs, 1),
    jitterMs: round(jitterMs, 1),
    lossPct: round(lossPct, 1),
  });

  return {
    latencyMs: round(latencyMs, 1),
    jitterMs: round(jitterMs, 1),
    lossPct: round(lossPct, 1),
    targetServer,
  };
}

// ─── Download ────────────────────────────────────────────────────────────

interface DownloadResult {
  mbps: number;
  bytes: number;
  durationMs: number;
}

async function measureDownload(
  onProgress?: ProgressCallback,
): Promise<DownloadResult> {
  const start = performance.now();
  const res = await fetch(DOWNLOAD_BLOB, { cache: "no-store" });
  if (!res.ok || !res.body) {
    throw new Error(`download failed: HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      received += value.byteLength;
      // Live Mbps estimate — useful for the gauge.
      const elapsed = (performance.now() - start) / 1000;
      if (elapsed > 0 && onProgress) {
        onProgress?.({
          phase: "download",
          downMbps: round((received * 8) / elapsed / 1_000_000, 1),
        });
      }
    }
  }

  const durationMs = performance.now() - start;
  const mbps = round((received * 8) / (durationMs / 1000) / 1_000_000, 1);

  return { mbps, bytes: received, durationMs: round(durationMs, 0) };
}

// ─── Upload ──────────────────────────────────────────────────────────────

interface UploadResult {
  mbps: number;
}

async function measureUpload(
  onProgress?: ProgressCallback,
): Promise<UploadResult> {
  // Pre-allocate one 1 MB payload and reuse it across rounds.
  const payload = new Uint8Array(UPLOAD_PAYLOAD_BYTES);

  const start = performance.now();
  for (let i = 0; i < UPLOAD_ROUNDS; i++) {
    await fetch(UPLOAD_ENDPOINT, {
      method: "POST",
      body: payload,
      headers: { "Content-Type": "application/octet-stream" },
      cache: "no-store",
    });
  }
  const durationMs = performance.now() - start;
  const totalBits = UPLOAD_ROUNDS * UPLOAD_PAYLOAD_BYTES * 8;
  const mbps = round(totalBits / (durationMs / 1000) / 1_000_000, 1);

  onProgress?.({ phase: "upload", upMbps: mbps });

  return { mbps };
}

// ─── Stats helpers ───────────────────────────────────────────────────────

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function meanAbsoluteDeviation(values: number[]): number {
  const med = median(values);
  return values.reduce((sum, v) => sum + Math.abs(v - med), 0) / values.length;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
