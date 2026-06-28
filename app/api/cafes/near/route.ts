import { NextRequest } from "next/server";
import { getCafes } from "@/lib/cafes";

// GET /api/cafes/near?lat=<>&lng=<>&radius=<metres>
// Without lat/lng — returns the whole network (treated as "near everything").
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");
  const radiusParam = searchParams.get("radius");

  // Either all three are present or none.
  const hasAny = latParam || lngParam || radiusParam;
  const hasAll = latParam && lngParam && radiusParam;

  if (hasAny && !hasAll) {
    return Response.json(
      { error: "lat, lng, and radius are required together" },
      { status: 400 },
    );
  }

  if (hasAll) {
    const lat = Number(latParam);
    const lng = Number(lngParam);
    const radius = Number(radiusParam);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radius)) {
      return Response.json(
        { error: "lat, lng, radius must be numbers" },
        { status: 400 },
      );
    }
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return Response.json({ error: "lat/lng out of range" }, { status: 400 });
    }
    if (radius <= 0 || radius > 100_000) {
      return Response.json(
        { error: "radius must be between 1 and 100000 metres" },
        { status: 400 },
      );
    }
    const cafes = await getCafes({ lat, lng, radiusM: radius });
    return Response.json({ cafes });
  }

  const cafes = await getCafes();
  return Response.json({ cafes });
}
