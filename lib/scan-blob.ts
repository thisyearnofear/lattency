// Vercel Blob storage for venue-scan media (Phase 1 pipeline infra —
// docs/venue-3d-insights.md, docs/venue-3d-ux-research.md §7). Server-only:
// every helper needs BLOB_READ_WRITE_TOKEN, which Vercel auto-provides when
// a Blob store is attached to the project.
//
// Layout (one prefix per scan so a scan's media can be listed, or wiped on
// takedown, as a unit):
//   scans/{scanId}/{seq}.jpg            — capture keyframes (private)
//   scans/{scanId}/artifacts/{name}     — pipeline outputs: preview-splat.spz,
//                                         final-splat.spz, poses, blur report
//
// Everything lands `access: "private"` — frame bytes contain identifiable
// patrons pre-blur, and splats are only publishable after blur_verified.
// Readers (the worker in scripts/process-scan.ts) fetch with the same token
// via `get(pathname, { access: "private" })`.

import "server-only";
import { list, put } from "@vercel/blob";

/** Typed failure for the storage layer. Routes map `code: "not_configured"`
 *  to 503 "storage not configured" without leaking internals; every other
 *  storage failure is also a 503 with a generic message. */
export class ScanStorageError extends Error {
  readonly code: "not_configured" | "invalid_input" | "request_failed";

  constructor(
    code: ScanStorageError["code"],
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ScanStorageError";
    this.code = code;
  }
}

const SCAN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
// Artifact names: preview-splat.spz, final-splat.spz, poses.json, blur-report.json
const ARTIFACT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MAX_SEQ = 4999;

function requireToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new ScanStorageError(
      "not_configured",
      "BLOB_READ_WRITE_TOKEN is not set — attach a Vercel Blob store",
    );
  }
  return token;
}

function requireScanId(scanId: string): string {
  if (typeof scanId !== "string" || !SCAN_ID_RE.test(scanId)) {
    throw new ScanStorageError("invalid_input", "invalid scan id");
  }
  return scanId;
}

async function storeBlob(
  pathname: string,
  body: Buffer,
  contentType: string,
): Promise<{ url: string; pathname: string }> {
  const token = requireToken();
  try {
    const blob = await put(pathname, body, {
      access: "private",
      contentType,
      // Retried chunks / re-run pipeline steps overwrite deterministically —
      // same pathname means same logical object, not a collision.
      allowOverwrite: true,
      token,
    });
    return { url: blob.url, pathname: blob.pathname };
  } catch (err) {
    throw new ScanStorageError("request_failed", "blob store request failed", {
      cause: err,
    });
  }
}

/** Store one capture keyframe at scans/{scanId}/{seq}.jpg (image/jpeg,
 *  private). Returns the blob URL recorded in the scan's frame manifest. */
export async function putScanFrame(
  scanId: string,
  seq: number,
  jpegBuffer: Buffer,
): Promise<{ url: string; pathname: string }> {
  requireScanId(scanId);
  if (!Number.isInteger(seq) || seq < 0 || seq > MAX_SEQ) {
    throw new ScanStorageError("invalid_input", "seq must be an integer 0–4999");
  }
  if (!Buffer.isBuffer(jpegBuffer) || jpegBuffer.length === 0) {
    throw new ScanStorageError("invalid_input", "frame buffer required");
  }
  return storeBlob(`scans/${scanId}/${seq}.jpg`, jpegBuffer, "image/jpeg");
}

/** Ordered frame URLs for a scan — sorted by seq, pagination unrolled.
 *  Only `{seq}.jpg` entries at the scan root count; the artifacts/ prefix
 *  is excluded so pipeline outputs never masquerade as frames. */
export async function listScanFrames(scanId: string): Promise<string[]> {
  requireScanId(scanId);
  const token = requireToken();
  const prefix = `scans/${scanId}/`;
  const frameRe = new RegExp(`^scans/${scanId}/(\\d+)\\.jpg$`);

  const frames: { seq: number; url: string }[] = [];
  let cursor: string | undefined;
  try {
    do {
      const page = await list({
        prefix,
        cursor,
        limit: 1000,
        token,
      });
      for (const blob of page.blobs) {
        const match = frameRe.exec(blob.pathname);
        if (match) frames.push({ seq: Number(match[1]), url: blob.url });
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  } catch (err) {
    throw new ScanStorageError("request_failed", "blob store request failed", {
      cause: err,
    });
  }
  return frames.sort((a, b) => a.seq - b.seq).map((f) => f.url);
}

/** Store a pipeline artifact (preview-splat.spz, poses.json, blur report)
 *  under scans/{scanId}/artifacts/. Content type is inferred from the name
 *  unless overridden — .spz has no registered MIME, so callers should pass
 *  application/octet-stream for binary outputs. */
export async function putScanArtifact(
  scanId: string,
  name: string,
  data: Buffer,
  contentType = "application/octet-stream",
): Promise<{ url: string; pathname: string }> {
  requireScanId(scanId);
  if (typeof name !== "string" || !ARTIFACT_NAME_RE.test(name)) {
    throw new ScanStorageError("invalid_input", "invalid artifact name");
  }
  if (!Buffer.isBuffer(data) || data.length === 0) {
    throw new ScanStorageError("invalid_input", "artifact data required");
  }
  return storeBlob(`scans/${scanId}/artifacts/${name}`, data, contentType);
}
