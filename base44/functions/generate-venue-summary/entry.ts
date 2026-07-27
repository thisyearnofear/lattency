import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

// Generate a one-line editorial summary ("vibe") for a café from its
// objective metadata + verified speed stats. Uses Base44's built-in
// InvokeLLM integration — no API key management, the backend proxies it.
//
// Input: { cafe_id }
// Output: { summary: string }

interface B44Cafe {
  id: string;
  name: string;
  neighbourhood?: string | null;
  city?: string | null;
  vibe?: string | null;
  venue_type?: string | null;
  price_tier?: string | null;
  milk_options?: string[] | null;
  power_outlets?: boolean | null;
  seating?: string | null;
  noise_level?: string | null;
  table_space?: string | null;
  ai_summary?: string | null;
}

interface Stats {
  medianDownMbps: number;
  measurementCount: number;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { cafe_id, regenerate } = (await req.json()) as {
      cafe_id?: string;
      regenerate?: boolean;
    };
    if (!cafe_id) {
      return Response.json({ error: "cafe_id required" }, { status: 400 });
    }

    const cafe = (await base44.asServiceRole.entities.Cafe.get(cafe_id)) as B44Cafe;
    if (!cafe) {
      return Response.json({ error: "cafe not found" }, { status: 404 });
    }

    // Serve the cached summary unless a fresh one is explicitly requested.
    if (cafe.ai_summary && !regenerate) {
      return Response.json({ summary: cafe.ai_summary, cached: true });
    }

    // Pull stats for context.
    const statsRes = await base44.asServiceRole.functions.invoke("get-cafe-stats", {
      cafe_id,
    });
    const stats = (statsRes?.data?.stats ?? statsRes?.stats ?? null) as Stats | null;

    const facts = [
      `Name: ${cafe.name}`,
      cafe.neighbourhood ? `Area: ${cafe.neighbourhood}, ${cafe.city ?? "nairobi"}` : "",
      cafe.venue_type ? `Type: ${cafe.venue_type}` : "",
      stats ? `Median download: ${stats.medianDownMbps} Mbps (${stats.measurementCount} verified tests)` : "",
      cafe.price_tier ? `Price: ${cafe.price_tier}` : "",
      cafe.seating ? `Seating: ${cafe.seating}` : "",
      cafe.noise_level ? `Noise: ${cafe.noise_level}` : "",
      cafe.power_outlets !== null && cafe.power_outlets !== undefined
        ? `Power outlets: ${cafe.power_outlets ? "yes" : "no"}`
        : "",
      cafe.milk_options?.length ? `Milk: ${cafe.milk_options.join(", ")}` : "",
      cafe.table_space ? `Table space: ${cafe.table_space}` : "",
    ].filter(Boolean).join(". ");

    const summary = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are a concise copywriter for a remote-work café map. Given these verified facts about a workspace, write a single punchy sentence (max 18 words) describing who it's best for. No marketing fluff, no emojis, no quotes around the sentence.\n\nFacts: ${facts}`,
      model: "gemini_3_flash",
    });

    const text = typeof summary === "string" ? summary.trim() : "";
    if (text) {
      // Cache on the entity so the pull-quote is instant on later visits.
      await base44.asServiceRole.entities.Cafe.update(cafe_id, {
        ai_summary: text,
      });
    }

    return Response.json({ summary: text, cached: false });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
});
