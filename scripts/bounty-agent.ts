// Automated Bounty Agent
//
// Scans the venue database for under-mapped or stale workspaces and
// auto-deploys NIM bounties to incentivize fresh verified readings.
//
// In v1 this logs the bounties it would create. In v2 it calls the
// Base44 Bounty entity create endpoint with a sponsor wallet.
//
// Run with: pnpm exec tsx scripts/bounty-agent.ts

import { MOCK_CAFES } from "../lib/mock-cafes";

interface SuggestedBounty {
  title: string;
  description: string;
  rewardNim: number;
  targetCafeId: string;
  reason: "stale" | "no-readings" | "missing-metadata";
}

async function identifyGaps(): Promise<SuggestedBounty[]> {
  // v1 uses the bundled mock snapshot so the script runs without a live DB.
  // In production, swap this for a Base44 query that returns real venues
  // with their latest measurement timestamps.
  const cafes = MOCK_CAFES.filter((c) => c.city === "london");
  const suggestions: SuggestedBounty[] = [];

  for (const cafe of cafes) {
    // Venues with no readings are the highest priority — the map is useless
    // without data.
    if (cafe.measurementCount === 0) {
      suggestions.push({
        title: `Verify ${cafe.name}`,
        description: `First verified speed test at ${cafe.name} (${cafe.neighbourhood}).`,
        rewardNim: 5,
        targetCafeId: cafe.id,
        reason: "no-readings",
      });
      continue;
    }

    // Stale data — older than threshold. In production this would compare
    // the latest measurement date; the mock snapshot has no date so we
    // skip the time check here and rely on measurement count as a proxy.
    if (cafe.measurementCount < 3) {
      suggestions.push({
        title: `Corroborate ${cafe.name}`,
        description: `Second or third verified reading at ${cafe.name} to stabilise its tier.`,
        rewardNim: 2,
        targetCafeId: cafe.id,
        reason: "stale",
      });
    }

    // Missing critical metadata — these venues are harder for users to
    // decide on without a physical visit.
    if (!cafe.metadata?.noiseLevel || !cafe.metadata?.tableSpace) {
      suggestions.push({
        title: `Complete metadata for ${cafe.name}`,
        description: `Visit ${cafe.name} and report noise level + table space + power availability.`,
        rewardNim: 1,
        targetCafeId: cafe.id,
        reason: "missing-metadata",
      });
    }
  }

  return suggestions;
}

async function deployBounties(suggestions: SuggestedBounty[]) {
  for (const bounty of suggestions) {
    // v1: log only. v2: create a Base44 Bounty entity and fund it with NIM.
    console.log(`[BOUNTY] ${bounty.title} — ${bounty.rewardNim} NIM`);
    // await base44.entities.Bounty.create({ ... });
  }
}

async function main() {
  const suggestions = await identifyGaps();

  if (suggestions.length === 0) {
    console.log("No bounty gaps found.");
    return;
  }

  console.log(`Suggesting ${suggestions.length} bounties:`);
  await deployBounties(suggestions);
}

main().catch((err) => {
  console.error("Bounty agent failed:", err);
  process.exit(1);
});
