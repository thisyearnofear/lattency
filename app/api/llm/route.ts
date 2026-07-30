import { NextRequest } from "next/server";
import { getCafes } from "@/lib/cafes";
import { VENUE_TYPE_LABELS } from "@/lib/cafe-metadata";
import { DEFAULT_CITY_ID, cityDisplayName } from "@/lib/cities";

// GET /api/llm?city=london
// Returns a dense, LLM-friendly plain-text summary of verified workspace
// data for a city. Intended for AI agents that need ground-truth workspace
// quality data without the UI chrome. City defaults to the curated default.
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
    "metadata, and a tier (Express ≥50 Mbps, Local 10-49 Mbps, Suspended <10 Mbps).",
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
    lines.push(
      `Speed: ${cafe.medianDownMbps}↓ / ${cafe.medianUpMbps}↑ Mbps, ${cafe.medianLatencyMs}ms latency`,
    );
    if (cafe.medianJitterMs > 0 || cafe.medianLossPct > 0) {
      lines.push(`Stability: ${cafe.medianJitterMs}ms jitter, ${cafe.medianLossPct}% loss`);
    }
    lines.push(`Measurements: ${cafe.measurementCount}`);

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
  lines.push("Contribute: https://lattency.vercel.app/?contribute=1");
  lines.push("Nimiq Mini App: earn NIM for verified workspace readings.");

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    },
  });
}
