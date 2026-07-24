import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

interface Cafe {
  _id: string;
  name: string;
  latitude: number;
  longitude: number;
  city?: string;
}

interface NearRequest {
  lat: number;
  lng: number;
  radiusM: number;
  city?: string;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const { lat, lng, radiusM, city } = (await req.json()) as NearRequest;
  const R = 6_371_000;

  function haversine(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  const allCafes = (await base44.entities.Cafe.list(
    "-created_date",
    5000,
    0,
  )) as Cafe[];
  const filtered = allCafes
    .filter((c) => !city || c.city === city)
    .map((c) => ({
      ...c,
      distance: haversine(lat, lng, c.latitude, c.longitude),
    }))
    .filter((c) => c.distance <= radiusM)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 50);

  return Response.json({ cafes: filtered });
});
