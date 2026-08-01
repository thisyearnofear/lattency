import { NextRequest } from "next/server";
import { getNotifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";

// GET /api/notifications?city=london&names=Ozone%20Coffee,About%20Thyme
// Computes the contributor's open loops: stale stations they touched (by name,
// from their local trail), bounties expiring within 3 days, and claimable
// bounties. Polled by the TopNav inbox — no email/push infra required.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const city = url.searchParams.get("city") ?? undefined;
  const namesParam = url.searchParams.get("names");
  const touchedNames = namesParam
    ? namesParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const notifications = await getNotifications({ city, touchedNames });
  return Response.json({ notifications });
}
