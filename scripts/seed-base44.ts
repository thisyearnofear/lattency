// Seed Base44 with venue + measurement data from the bundled mock snapshot.
// Run: NEXT_PUBLIC_BASE44_APP_ID=<id> pnpm exec tsx scripts/seed-base44.ts
//
// Creates a Cafe entity + N synthetic measurements for each MOCK_CAFES entry.
// Idempotent: skips cafés whose name already exists in the app.
// Rate-limit aware: 150ms delay between requests + exponential backoff on 429.

import base44 from "../lib/base44";
import { MOCK_CAFES } from "../lib/mock-cafes";

interface B44Cafe {
  id: string;
  name: string;
}

const now = new Date();

/** Throttle between requests to avoid Base44's 429 rate limit. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry wrapper with exponential backoff for 429 rate-limit responses. */
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 3,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const is429 = msg.includes("429") || msg.includes("Rate limit");
      if (is429 && attempt < maxRetries) {
        const wait = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s
        console.log(`  ⏳ ${label}: rate limited, retrying in ${wait / 1000}s (attempt ${attempt + 1}/${maxRetries})`);
        await delay(wait);
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}

function randomOffsetMs(maxMinutes: number): number {
  return Math.floor(Math.random() * maxMinutes * 60 * 1000);
}

function randomMbps(base: number, variance: number): number {
  return Math.max(1, +(base + (Math.random() - 0.5) * variance).toFixed(1));
}

function deriveTimeBucket(d: Date): string {
  const hour = d.getUTCHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

const THROTTLE_MS = 150; // Base delay between requests

async function seed() {
  if (!process.env.NEXT_PUBLIC_BASE44_APP_ID) {
    console.error(
      "NEXT_PUBLIC_BASE44_APP_ID is not set. Provide it to seed Base44.\n" +
        "Example: NEXT_PUBLIC_BASE44_APP_ID=abc123 pnpm exec tsx scripts/seed-base44.ts",
    );
    process.exit(1);
  }

  // Fetch existing cafes once for O(1) duplicate checks.
  const existing = (await base44.entities.Cafe.list(
    "-created_date",
    5000,
    0,
  )) as B44Cafe[];
  const existingNames = new Set(existing.map((c) => c.name));
  console.log(`Found ${existing.length} existing cafés in Base44.`);

  let created = 0;
  const toCreate = MOCK_CAFES.filter((c) => !existingNames.has(c.name));
  const skipped = existingNames.size;
  console.log(`Creating ${toCreate.length} cafés (${skipped} already exist)...`);

  for (const cafe of toCreate) {
    await delay(THROTTLE_MS);

    const b44Cafe = await withRetry(
      () =>
        base44.entities.Cafe.create({
          name: cafe.name,
          neighbourhood: cafe.neighbourhood,
          latitude: cafe.lat,
          longitude: cafe.lng,
          vibe: cafe.vibe,
          venue_type: cafe.venueType ?? "cafe",
          city: cafe.city ?? "nairobi",
          price_tier: cafe.metadata?.priceTier ?? null,
          milk_options: cafe.metadata?.milkOptions ?? [],
          power_outlets: cafe.metadata?.powerOutlets ?? false,
          seating: cafe.metadata?.seating ?? null,
          noise_level: cafe.metadata?.noiseLevel ?? null,
          table_space: cafe.metadata?.tableSpace ?? null,
          wifi_network: cafe.metadata?.wifiNetwork ?? null,
          photo_url: cafe.photoUrl ?? cafe.latestPhotoUrl ?? null,
        }) as Promise<B44Cafe>,
      `cafe "${cafe.name}"`,
    );

    const cafeId = b44Cafe.id;
    const count = Math.max(cafe.measurementCount, 3);

    for (let i = 0; i < count; i++) {
      await delay(THROTTLE_MS);
      const measuredAt = new Date(now.getTime() - randomOffsetMs(72 * 60));
      await withRetry(
        () =>
          base44.entities.Measurement.create({
            cafe_id: cafeId,
            down_mbps: randomMbps(cafe.medianDownMbps, cafe.medianDownMbps * 0.4),
            up_mbps: randomMbps(cafe.medianUpMbps, cafe.medianUpMbps * 0.4),
            latency_ms: randomMbps(cafe.medianLatencyMs, cafe.medianLatencyMs * 0.3),
            jitter_ms: Math.max(0, +(Math.random() * 8).toFixed(1)),
            loss_pct: Math.random() > 0.7 ? +(Math.random() * 3).toFixed(1) : 0,
            measured_at: measuredAt.toISOString(),
            time_bucket: deriveTimeBucket(measuredAt),
            test_method: "browser-auto",
            device_type: "mobile",
          }),
        `measurement ${i + 1}/${count} for "${cafe.name}"`,
      );
    }

    console.log(`  + "${cafe.name}" (id=${cafeId}) + ${count} measurements`);
    created++;
  }

  console.log(`\nDone. Created ${created} cafés, skipped ${skipped}.`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
