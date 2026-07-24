import base44 from "../lib/base44";
import { MOCK_CAFES } from "../lib/mock-cafes";

interface Base44Entity {
  _id: string;
  id: string;
  name: string;
}

const now = new Date();

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

async function seed() {
  for (const cafe of MOCK_CAFES) {
    const existing = (await base44.entities.Cafe.list(
      "-created_date",
      100,
      0,
    )) as Base44Entity[];
    const found = existing.find((c) => c.name === cafe.name);
    if (found) {
      console.log(`Cafe "${cafe.name}" already exists (id=${found._id}), skipping`);
      continue;
    }

    const created = (await base44.entities.Cafe.create({
      name: cafe.name,
      neighbourhood: cafe.neighbourhood,
      latitude: cafe.lat,
      longitude: cafe.lng,
      vibe: cafe.vibe,
      city: cafe.city ?? "nairobi",
      price_tier: cafe.metadata?.priceTier ?? null,
      milk_options: cafe.metadata?.milkOptions ?? [],
      power_outlets: cafe.metadata?.powerOutlets ?? false,
      seating: cafe.metadata?.seating ?? null,
      wifi_network: cafe.metadata?.wifiNetwork ?? null,
      photo_url: cafe.photoUrl ?? cafe.latestPhotoUrl ?? null,
    })) as Base44Entity;

    console.log(`Created cafe "${cafe.name}" (id=${created._id})`);

    const cafeId = created._id ?? created.id;
    const count = Math.max(cafe.measurementCount, 3);

    for (let i = 0; i < count; i++) {
      const measuredAt = new Date(now.getTime() - randomOffsetMs(72 * 60));
      const baseDown = cafe.medianDownMbps;
      const baseUp = cafe.medianUpMbps;
      const baseLat = cafe.medianLatencyMs;

      await base44.entities.Measurement.create({
        cafe_id: cafeId,
        down_mbps: randomMbps(baseDown, baseDown * 0.4),
        up_mbps: randomMbps(baseUp, baseUp * 0.4),
        latency_ms: randomMbps(baseLat, baseLat * 0.3),
        jitter_ms: Math.max(0, +(Math.random() * 8).toFixed(1)),
        loss_pct: Math.random() > 0.7 ? +(Math.random() * 3).toFixed(1) : 0,
        measured_at: measuredAt.toISOString(),
        time_bucket: deriveTimeBucket(measuredAt),
        test_method: "browser-auto",
        device_type: "mobile",
      });
    }

    console.log(`  → Created ${count} measurements for "${cafe.name}"`);
  }

  console.log("Seed complete.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
