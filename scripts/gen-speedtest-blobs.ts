// Generates the static download blob used by the in-browser speed test
// (lib/speedtest.ts). The blob is a 10 MB file of random bytes served from
// Vercel's edge CDN via /speedtest/download.bin.
//
// Idempotent: skips generation if the file already exists at the expected
// size. Chained into `dev` and `build` in package.json so the blob is
// always present in both environments without bloating the git repo.
//
// Why random bytes (not zeros)? Some CDN and compression layers detect
// all-zero payloads and apply transport compression, corrupting the
// throughput measurement. Random bytes are incompressible.

import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const BLOB_DIR = resolve(process.cwd(), "public", "speedtest");
const BLOB_PATH = resolve(BLOB_DIR, "download.bin");
const BLOB_SIZE = 10 * 1024 * 1024; // 10 MB

function main(): void {
  if (
    existsSync(BLOB_PATH) &&
    statSync(BLOB_PATH).size === BLOB_SIZE
  ) {
    // Already present — nothing to do.
    return;
  }

  mkdirSync(BLOB_DIR, { recursive: true });
  writeFileSync(BLOB_PATH, randomBytes(BLOB_SIZE));
  console.log(`[speedtest] generated ${BLOB_PATH} (${BLOB_SIZE / 1024 / 1024} MB)`);
}

main();
