import { NextRequest } from "next/server";
import { getCafes } from "@/lib/cafes";
import { base44Configured } from "@/lib/base44";
import { DEFAULT_CITY_ID, getLiveCities } from "@/lib/cities";
import { TIER_USE, tierForDown } from "@/lib/map-data";
import {
  CALL_REQUIREMENTS,
  capabilities,
  sampleConfidence,
  videoCallReadiness,
} from "@/lib/capability";
import { daysSince, stalenessLevel } from "@/lib/staleness";
import type { CafeStation } from "@/lib/types";

// GET /api/network — the machine-readable network snapshot.
//
// The README positions Lattency as a ground-truth layer that agents consume,
// but until now the only surface was HTML. An agent can't parse the metro map.
// This endpoint is the contract: stable field names, explicit units, an honest
// confidence signal per station, and a machine-readable caveat list.
//
// Read-only and side-effect free. It never writes, never pays out, and needs
// no identity.
//
// Query params:
//   city   — a city id (e.g. "london"). Omit for every city.
//   tier   — express | local | suspended. Filters stations.
//   minSamples — integer; only stations with at least this many readings.
//   format — "json" (default) or "ndjson" for streaming one station per line.

export const dynamic = "force-dynamic";

/** Thresholds as data, so a consumer never has to hardcode our arithmetic. */
const TIER_THRESHOLDS = {
  express: { minDownMbps: 50, use: TIER_USE.express },
  local: { minDownMbps: 10, maxDownMbps: 49.99, use: TIER_USE.local },
  suspended: { maxDownMbps: 9.99, use: TIER_USE.suspended },
} as const;

function serializeStation(cafe: CafeStation) {
  // Shared with /api/llm so both surfaces grade evidence identically.
  const confidenceLevel = sampleConfidence(cafe.measurementCount);
  const ageDays = daysSince(cafe.lastReadingAt) ?? null;
  // Capability is derived from upload as well as download. `tier` is
  // download-only, so the two can legitimately disagree — check
  // `capabilities.videoCalls.verdict` before telling a user a station is
  // call-ready.
  const metrics = {
    downMbps: cafe.medianDownMbps,
    upMbps: cafe.medianUpMbps,
    latencyMs: cafe.medianLatencyMs,
    lossPct: cafe.medianLossPct,
    samples: cafe.measurementCount,
  };
  const call = videoCallReadiness(metrics);
  return {
    id: cafe.id,
    name: cafe.name,
    city: cafe.city,
    neighbourhood: cafe.neighbourhood,
    location: { latitude: cafe.lat, longitude: cafe.lng },
    venueType: cafe.venueType ?? "cafe",
    tier: cafe.tier,
    tierMeaning: TIER_USE[cafe.tier],
    /** Derive the tier from `speeds.downMbps` yourself if you prefer; this is
     *  the same threshold the map uses, echoed here for convenience. */
    tierForDownMbps: tierForDown(cafe.medianDownMbps),
    speeds: {
      downMbps: cafe.medianDownMbps,
      upMbps: cafe.medianUpMbps,
      latencyMs: cafe.medianLatencyMs,
      jitterMs: cafe.medianJitterMs,
      lossPct: cafe.medianLossPct,
    },
    /** Medians, not means — see the caveats array. */
    aggregation: "median",
    /** What the connection can actually do. `videoCalls.bottleneck` names the
     *  single measurement holding call quality back, or null when nothing is. */
    capabilities: {
      videoCalls: call,
      all: capabilities(metrics),
    },
    confidence: confidenceLevel,
    samples: cafe.measurementCount,
    lastReadingAt: cafe.lastReadingAt ?? null,
    /** Days since the last reading; null when the timestamp is unknown. */
    ageDays,
    freshness: stalenessLevel(cafe.lastReadingAt),
    workspace: {
      priceTier: cafe.metadata?.priceTier ?? null,
      milkOptions: cafe.metadata?.milkOptions ?? null,
      powerOutlets: cafe.metadata?.powerOutlets ?? null,
      seating: cafe.metadata?.seating ?? null,
      noiseLevel: cafe.metadata?.noiseLevel ?? null,
      tableSpace: cafe.metadata?.tableSpace ?? null,
      wifiNetwork: cafe.metadata?.wifiNetwork ?? null,
    },
  };
}

const CAVEATS = [
  "Speeds are medians of browser-based tests against a Vercel edge, not line-rate measurements. Single-stream HTTP through a shared path understates available bandwidth.",
  "`tier` is derived from download speed alone. A station can be Express on download and still fail a video call on upload — prefer `capabilities.videoCalls.verdict` when the question is whether someone can work there.",
  "A station is excluded from aggregates when flagged as an outlier, but outlier detection only engages once 3+ readings exist.",
  "Stations with confidence 'indicative' rest on a single reading: treat the tier as a hypothesis, not a fact.",
  "Workspace metadata (power outlets, noise, seating) is contributed by the person who visited. It is subjective in a way the speed readings are not.",
  "Staleness is derived from the newest reading; check `freshness` and `ageDays` before relying on a tier.",
] as const;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const city = url.searchParams.get("city") ?? undefined;
  const tier = url.searchParams.get("tier") ?? undefined;
  const minSamplesRaw = url.searchParams.get("minSamples");
  const format = url.searchParams.get("format") ?? "json";

  const minSamples = minSamplesRaw ? Number.parseInt(minSamplesRaw, 10) : 0;
  if (minSamplesRaw && (!Number.isFinite(minSamples) || minSamples < 0)) {
    return Response.json(
      { error: "minSamples must be a non-negative integer" },
      { status: 400 },
    );
  }

  const validTiers = ["express", "local", "suspended"];
  if (tier && !validTiers.includes(tier)) {
    return Response.json(
      { error: `tier must be one of: ${validTiers.join(", ")}` },
      { status: 400 },
    );
  }

  // One read of the whole network, then filter in-process. Cheaper than a
  // second call for the city list, and the dataset is small by design.
  const allCafes = await getCafes({ all: true });
  const cafes = city ? allCafes.filter((c) => c.city === city) : allCafes;

  const filtered = cafes.filter((c) => {
    if (tier && c.tier !== tier) return false;
    if (minSamples > 0 && c.measurementCount < minSamples) return false;
    return true;
  });

  const stations = filtered.map(serializeStation);

  if (format === "ndjson") {
    const lines = stations.map((s) => JSON.stringify(s)).join("\n");
    return new Response(lines ? `${lines}\n` : "", {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  return Response.json(
    {
      /** Version of this response contract. Bump on breaking field changes. */
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      /** Which backend answered — `snapshot` means bundled demo data, not
       *  a live network. Consumers should surface this, not hide it. */
      source: base44Configured ? "base44" : "snapshot",
      live: base44Configured,
      question: "Where can you sit down with a coffee and actually work?",
      units: {
        mbits: "Mbps (megabits per second)",
        latency: "ms (milliseconds)",
        loss: "percent",
        distance: "km",
      },
      tierThresholds: TIER_THRESHOLDS,
      /** Requirements behind capabilities.videoCalls, so a consumer can
       *  re-derive the verdict or reason about a different profile. */
      callRequirements: CALL_REQUIREMENTS,
      counts: {
        stations: stations.length,
        matchingFilters: stations.length,
        beforeFilters: cafes.length,
      },
      /** Cities that actually have at least one mapped station. */
      cities: getLiveCities(allCafes).map((c) => c.id),
      defaultCity: DEFAULT_CITY_ID,
      stations,
      caveats: CAVEATS,
    },
    {
      headers: {
        // Read-only public dataset; cacheable at the edge for a minute.
        "Cache-Control": "public, max-age=60, s-maxage=60",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
