import { NextRequest } from "next/server";
import { getLeaderboard } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";

// GET /api/leaderboard?city=london&me=contrib-...
// Returns the per-city contributor ranking plus the requesting contributor's
// own standing (when `me` is provided), so /me can show "you're #12 in London".
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const city = url.searchParams.get("city");
  const me = url.searchParams.get("me") ?? undefined;

  if (!city) {
    return Response.json({ error: "city required" }, { status: 400 });
  }

  const { entries, me: meEntry } = await getLeaderboard(city, me);
  return Response.json({ city, entries, me: meEntry });
}
