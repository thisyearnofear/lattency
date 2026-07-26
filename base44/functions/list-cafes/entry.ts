import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

interface CafeRow {
  id: string;
  name: string;
  neighbourhood?: string | null;
  latitude: number;
  longitude: number;
  vibe?: string | null;
  venue_type?: string | null;
  city?: string | null;
  price_tier?: string | null;
  milk_options?: string[] | null;
  power_outlets?: boolean | null;
  seating?: string | null;
  noise_level?: string | null;
  table_space?: string | null;
  wifi_network?: string | null;
  photo_url?: string | null;
}

interface MeasurementRow {
  cafe_id: string;
  down_mbps: number;
  up_mbps: number;
  latency_ms: number;
  jitter_ms?: number | null;
  loss_pct?: number | null;
  measured_at: string;
  photo_url?: string | null;
  is_outlier?: boolean | null;
}

interface ListRequest {
  city?: string;
  lat?: number;
  lng?: number;
  radiusM?: number;
}

function numeric(v: unknown): number {
  return typeof v === "number" ? v : Number(v);
}

function median(vals: number[]): number {
  if (vals.length === 0) return 0;
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function tierFrom(medianDown: number): "express" | "local" | "suspended" {
  if (medianDown >= 50) return "express";
  if (medianDown >= 10) return "local";
  return "suspended";
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Returns fully-assembled cafe "stations" with aggregate speed stats + tier,
// computed server-side under service role. One call serves the whole map,
// avoiding N+1 round-trips from the Next.js frontend.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { city, lat, lng, radiusM } = (await req.json()) as ListRequest;

    const cafes = (await base44.asServiceRole.entities.Cafe.list(
      "-created_date",
      5000,
      0,
    )) as CafeRow[];
    const measurements = (await base44.asServiceRole.entities.Measurement.list(
      "-measured_at",
      5000,
      0,
    )) as MeasurementRow[];

    // Group measurements by cafe for O(1) per-cafe aggregation.
    const byCafe = new Map<string, MeasurementRow[]>();
    for (const m of measurements) {
      const list = byCafe.get(m.cafe_id) ?? [];
      list.push(m);
      byCafe.set(m.cafe_id, list);
    }

    const geoFilter =
      Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(radiusM);

    const stations = cafes
      .filter((c) => !city || (c.city ?? "nairobi") === city)
      .map((c) => {
        const ms = byCafe.get(c.id) ?? [];
        // Outlier-aware median: prefer the filtered set when there are ≥3.
        const clean = ms.filter((m) => !m.is_outlier);
        const downSource = clean.length >= 3 ? clean : ms;
        const downs = downSource.map((m) => numeric(m.down_mbps)).filter(Number.isFinite);
        const medianDown = median(downs);

        const withPhoto = ms
          .filter((m) => m.photo_url)
          .sort((a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime());

        return {
          cafe: c,
          distance: geoFilter
            ? haversine(lat as number, lng as number, c.latitude, c.longitude)
            : 0,
          station: {
            id: c.id,
            name: c.name,
            neighbourhood: c.neighbourhood ?? "",
            lat: c.latitude,
            lng: c.longitude,
            tier: tierFrom(medianDown),
            medianDownMbps: medianDown,
            medianUpMbps: median(ms.map((m) => numeric(m.up_mbps)).filter(Number.isFinite)),
            medianLatencyMs: median(ms.map((m) => numeric(m.latency_ms)).filter(Number.isFinite)),
            medianJitterMs: median(ms.map((m) => numeric(m.jitter_ms)).filter(Number.isFinite)),
            medianLossPct: median(ms.map((m) => numeric(m.loss_pct)).filter(Number.isFinite)),
            measurementCount: ms.length,
            latestPhotoUrl: withPhoto[0]?.photo_url ?? c.photo_url ?? null,
            venueType: c.venue_type ?? "cafe",
            vibe: c.vibe ?? "",
            city: c.city ?? "nairobi",
            metadata: {
              priceTier: c.price_tier ?? null,
              milkOptions: c.milk_options ?? null,
              powerOutlets: c.power_outlets ?? null,
              seating: c.seating ?? null,
              wifiNetwork: c.wifi_network ?? null,
              noiseLevel: c.noise_level ?? null,
              tableSpace: c.table_space ?? null,
            },
            photoUrl: c.photo_url ?? null,
            sponsor: null,
          },
        };
      })
      .filter((s) => !geoFilter || s.distance <= (radiusM as number));

    stations.sort((a, b) =>
      geoFilter ? a.distance - b.distance : a.station.name.localeCompare(b.station.name),
    );

    return Response.json({ cafes: stations.slice(0, 200).map((s) => s.station) });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
});
