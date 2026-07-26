import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

// Triggered automatically whenever a Measurement is created. Finds open
// bounties whose area/criteria match the new reading and bumps progress.
// When progress >= target, the bounty status flips to "open" (claimable).
//
// Runs under service role (entity-event automations have no user context).

interface B44Measurement {
  cafe_id: string;
  down_mbps: number;
}

interface B44Bounty {
  id: string;
  target: number;
  progress: number;
  status: string;
  target_city: string | null;
  target_neighbourhood: string | null;
  kind: string;
}

interface B44Cafe {
  id: string;
  city: string | null;
  neighbourhood: string | null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = (await req.json()) as { record?: B44Measurement };
    const measurement = body.record;
    if (!measurement?.cafe_id) {
      return Response.json({ skipped: true, reason: "no measurement record" });
    }

    // Look up the café the measurement belongs to for area matching.
    let cafe: B44Cafe | null = null;
    try {
      cafe = (await base44.asServiceRole.entities.Cafe.get(
        measurement.cafe_id,
      )) as B44Cafe;
    } catch {
      return Response.json({ skipped: true, reason: "cafe not found" });
    }

    // Find open bounties.
    const bounties = (await base44.asServiceRole.entities.Bounty.filter(
      { status: "open" },
      "-created_date",
      100,
      0,
    )) as B44Bounty[];

    let updated = 0;
    for (const bounty of bounties) {
      // Area match: if the bounty targets a city/neighbourhood, the café
      // must be in it. Bounties with no area target count globally.
      const cityMatch =
        !bounty.target_city ||
        (cafe.city ?? "nairobi") === bounty.target_city;
      const hoodMatch =
        !bounty.target_neighbourhood ||
        (cafe.neighbourhood ?? "") === bounty.target_neighbourhood;
      if (!cityMatch || !hoodMatch) continue;

      const newProgress = (bounty.progress ?? 0) + 1;
      await base44.asServiceRole.entities.Bounty.update(bounty.id, {
        progress: newProgress,
      });
      updated++;

      // If this reading completes the bounty, it's now claimable.
      if (newProgress >= (bounty.target ?? 1)) {
        await base44.asServiceRole.entities.Bounty.update(bounty.id, {
          status: "claiming",
        });
      }
    }

    return Response.json({ updated, measurement_cafe: measurement.cafe_id });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
});
