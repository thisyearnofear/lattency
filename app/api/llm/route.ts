import { NextRequest } from "next/server";
import { getCafes } from "@/lib/cafes";
import { VENUE_TYPE_LABELS } from "@/lib/cafe-metadata";
import { DEFAULT_CITY_ID, cityDisplayName } from "@/lib/cities";
import {
  CONFIDENCE_NOTE,
  sampleConfidence,
  videoCallReadiness,
  type StationMetrics,
} from "@/lib/capability";

// GET /api/llm?city=london
// Returns a dense, LLM-friendly plain-text summary of verified workspace
// data for a city. Intended for AI agents that need ground-truth workspace
// quality data without the UI chrome. City defaults to the curated default.
//
// Companion surface: GET /api/network returns the same dataset as structured
// JSON (or NDJSON) across every city. Keep the two consistent — a narrative
// surface that overstates a tier while the structured one qualifies it is
// worse than having only one.
//
// Rounding: speeds are rounded here specifically. This output is read by a
// language model, and a raw float such as 62.41300000000001 reads as false
// precision about a measurement that has none.

/** Round to one decimal, dropping a trailing .0. */
function n(value: number): number {
  return Math.round(value * 10) / 10;
}

function metricsOf(cafe: Awaited<ReturnType<typeof getCafes>>[number]): StationMetrics {
  return {
    downMbps: cafe.medianDownMbps,
    upMbps: cafe.medianUpMbps,
    latencyMs: cafe.medianLatencyMs,
    lossPct: cafe.medianLossPct,
    samples: cafe.measurementCount,
  };
}
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const city = (url.searchParams.get("city") ?? DEFAULT_CITY_ID).toLowerCase();
  const cityName = cityDisplayName(city);

  let cafes: Awaited<ReturnType<typeof getCafes>>;
  try {
    cafes = await getCafes({ city });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(`Lattency workspace data temporarily unavailable.\nError: ${message}\n`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const lines: string[] = [
    `Lattency — ${cityName} workspace ground truth`,
    `Generated: ${new Date().toISOString()}`,
    `Venues: ${cafes.length}`,
    "",
    "Each venue includes verified wifi speed + stability, objective workspace",
    "metadata, and a tier (Express >=50 Mbps, Local 10-49 Mbps, Suspended <10 Mbps).",
    "",
    "IMPORTANT: the tier is derived from DOWNLOAD SPEED ALONE. A venue can be",
    "Express on download and still be unable to hold a video call, because",
    "upload is the usual constraint. Where that happens the venue carries a",
    "'Call quality limited by' line — read it before recommending a venue for",
    "calls. 'Confidence' grades how many readings back the numbers: a venue at",
    "'single reading' is provisional, not ground truth.",
    "",
    "Structured JSON across all cities: /api/network",
    "",
  ];

  for (const cafe of cafes) {
    const m = cafe.metadata;
    const tier = cafe.tier;
    const venueType = cafe.venueType
      ? (VENUE_TYPE_LABELS[cafe.venueType] ?? cafe.venueType)
      : "Café";

    lines.push(`## ${cafe.name}`);
    lines.push(`Type: ${venueType}`);
    lines.push(`Neighbourhood: ${cafe.neighbourhood}`);
    lines.push(`Coordinates: ${cafe.lat.toFixed(5)}, ${cafe.lng.toFixed(5)}`);
    lines.push(`Tier: ${tier.toUpperCase()}`);
    lines.push(`Speed: ${n(cafe.medianDownMbps)} down / ${n(cafe.medianUpMbps)} up Mbps, ${Math.round(cafe.medianLatencyMs)}ms latency`);
    if (cafe.medianJitterMs > 0 || cafe.medianLossPct > 0) {
      lines.push(`Stability: ${n(cafe.medianJitterMs)}ms jitter, ${n(cafe.medianLossPct)}% loss`);
    }
    lines.push(`Measurements: ${cafe.measurementCount}`);

    // The correction that keeps this surface from overstating the tier.
    const metrics = metricsOf(cafe);
    const call = videoCallReadiness(metrics);
    lines.push(
      `Confidence: ${sampleConfidence(cafe.measurementCount)} (${CONFIDENCE_NOTE[sampleConfidence(cafe.measurementCount)]})`,
    );
    lines.push(
      `Video calls: ${call.verdict}${call.bottleneck ? ` — Call quality limited by ${call.bottleneck}` : ""}`,
    );

    if (m) {
      if (m.priceTier) lines.push(`Price: ${m.priceTier}`);
      if (m.powerOutlets !== undefined) {
        lines.push(`Power: ${m.powerOutlets ? "Yes" : "No"}`);
      }
      if (m.seating) lines.push(`Seating: ${m.seating}`);
      if (m.noiseLevel) lines.push(`Noise: ${m.noiseLevel}`);
      if (m.tableSpace) lines.push(`Table space: ${m.tableSpace}`);
      if (m.milkOptions?.length) lines.push(`Milk options: ${m.milkOptions.join(", ")}`);
      if (m.wifiNetwork) lines.push(`WiFi network: ${m.wifiNetwork}`);
    }

    if (cafe.vibe) lines.push(`Vibe: ${cafe.vibe}`);
    if (cafe.vibeTags?.length) lines.push(`Tags: ${cafe.vibeTags.join(", ")}`);

    lines.push("");
  }

  lines.push("---");
  lines.push("Data is crowdsourced and verified by in-browser speed tests.");
  lines.push(
    "Caveats: speeds are medians of browser-based tests, not line-rate measurements;",
  );
  lines.push(
    "workspace metadata (power, noise, seating) is contributed by a visitor and is",
  );
  lines.push("subjective in a way the speed readings are not.");
  lines.push("Contribute: https://lattency.vercel.app/?contribute=1");
  lines.push("Nimiq Mini App: earn NIM for verified workspace readings.");

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    },
  });
}
