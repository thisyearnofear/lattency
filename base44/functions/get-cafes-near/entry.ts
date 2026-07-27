import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

interface Cafe {
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

interface NearRequest {
  lat: number;
  lng: number;
  radiusM: number;
  city?: string;
}

function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { lat, lng, radiusM, city } = (await req.json()) as NearRequest;

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      !Number.isFinite(radiusM)
    ) {
      return Response.json(
        { error: "lat, lng, radiusM must be numbers" },
        { status: 400 },
      );
    }

    // Service role bypasses RLS so the public map can read every venue.
    const allCafes = (await base44.asServiceRole.entities.Cafe.list(
      "-created_date",
      5000,
      0,
    )) as Cafe[];

    const filtered = allCafes
      .filter((c) => !city || (c.city ?? "nairobi") === city)
      .map((c) => ({
        ...c,
        distance: haversine(lat, lng, c.latitude, c.longitude),
      }))
      .filter((c) => c.distance <= radiusM)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 50);

    return Response.json({ cafes: filtered });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
});
