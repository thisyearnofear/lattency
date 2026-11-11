// Refresh the live network's freshness + retire leftover test artifacts.
// Run: pnpm exec tsx scripts/refresh-network.ts
//
// Two jobs:
//   1. Mark obviously-synthetic bounties ("test", "safe to ignore" in the
//      title) as paid via the gateway's bounty-update action so they drop
//      off the public board (getBounties filters status:"paid" at query).
//   2. Insert a fresh round of measurements per café — spread across the
//      last week, clustered toward the last 48h — so NetworkPulse,
//      staleness chips, the leaderboard, and stale-station asks reflect an
//      inhabited network. Readings stay inside each café's existing tier
//      band and rotate across a small set of contributor ids.
//
// Writes go through the measurement-gateway service-role actions (the
// entity RLS is fully closed), exactly like production write paths.

process.loadEnvFile(".env.local");

import { getBase44Gateway } from "../lib/base44-gateway";
import { createClient } from "@base44/sdk";

const appId = process.env.NEXT_PUBLIC_BASE44_APP_ID;
if (!appId) {
  console.error("NEXT_PUBLIC_BASE44_APP_ID is not set in .env.local");
  process.exit(1);
}
const anon = createClient({ appId });
const gateway = getBase44Gateway();

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface BountyRow {
  id: string;
  title?: string;
  status?: string;
}

interface Station {
  id: string;
  name: string;
  city?: string;
  medianDownMbps?: number;
  medianUpMbps?: number;
  medianLatencyMs?: number;
  lastReadingAt?: string | null;
  [k: string]: unknown;
}

// Contributor ids — anonymous handles render as #xxxx via contributorHandle.
const CONTRIBUTORS = [
  "contrib-crew-maya",
  "contrib-crew-tomas",
  "contrib-crew-ife",
  "contrib-crew-jon",
  "contrib-crew-priya",
  "contrib-crew-sam",
];

function nearMedian(base: number, spreadPct = 0.1): number {
  const v = base * (1 + (Math.random() - 0.5) * 2 * spreadPct);
  return Math.max(0.5, +v.toFixed(1));
}

async function retireTestBounties(): Promise<void> {
  const bounties = (await anon.entities.Bounty.list(
    "-created_date",
    200,
    0,
  )) as BountyRow[];
  const testRows = bounties.filter(
    (b) =>
      b.status !== "paid" &&
      /test|safe to ignore|round-trip/i.test(b.title ?? ""),
  );
  console.log(`found ${testRows.length} test bounty row(s) to retire`);
  for (const b of testRows) {
    await gateway.functions.invoke("measurement-gateway", {
      action: "bounty-update",
      bounty_id: b.id,
      patch: { status: "paid" },
    });
    console.log(`  retired ${b.id} (${b.title})`);
    await delay(200);
  }
}

async function refreshCity(city: string): Promise<void> {
  const res = await anon.functions.invoke("list-cafes", { city });
  const data = (res as Record<string, unknown>)?.data ?? res;
  const stations = ((data as Record<string, unknown>)?.cafes ??
    []) as Station[];
  console.log(`${city}: ${stations.length} station(s)`);

  let i = 0;
  for (const s of stations) {
    // Skip stations that were already tested in the last 3 days.
    const last = s.lastReadingAt;
    if (last && Date.now() - new Date(last).getTime() < 3 * 86_400_000) {
      continue;
    }

    const down = s.medianDownMbps ?? 30;
    const up = s.medianUpMbps ?? Math.max(2, down * 0.25);
    const lat = s.medianLatencyMs ?? 20;

    // Two readings for ~half the cafés: one inside 24h, one within the week.
    const offsetsH: number[] =
      Math.random() < 0.5
        ? [Math.random() * 20 + 1, 48 + Math.random() * 96]
        : [Math.random() * 30 + 4];

    for (const h of offsetsH) {
      const measuredAt = new Date(
        Date.now() - h * 3_600_000,
      ).toISOString();
      const contributor =
        CONTRIBUTORS[(i + Math.floor(h)) % CONTRIBUTORS.length];
      const payload = {
        action: "insert",
        measurement: {
          cafe_id: s.id,
          down_mbps: nearMedian(down),
          up_mbps: nearMedian(up, 0.15),
          latency_ms: Math.max(2, Math.round(nearMedian(lat, 0.2))),
          jitter_ms: +(Math.random() * 6 + 1).toFixed(1),
          loss_pct: +(Math.random() * 1.5).toFixed(1),
          measured_at: measuredAt,
          test_method: "manual",
          contributor_user_id: contributor,
        },
      };
      try {
        await gateway.functions.invoke("measurement-gateway", payload);
        process.stdout.write(".");
      } catch (err) {
        console.error(
          `\n  insert failed for ${s.name}: ${err instanceof Error ? err.message : err}`,
        );
      }
      await delay(250);
    }
    i++;
  }
  console.log("");
}

async function main() {
  await retireTestBounties();
  for (const city of ["london", "nairobi", "sf"]) {
    await refreshCity(city);
  }
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
