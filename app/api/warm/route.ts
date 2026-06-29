// Aurora warmer — invoked by Vercel cron every 5 minutes during business
// hours. Issues a tiny SELECT against the cafe_speed_stats MV so Aurora
// Serverless v2 stays warm and the next user request doesn't pay the
// 15-30s cold-start tax.
//
// Authenticated via the CRON_SECRET header — Vercel cron requests include
// `Authorization: Bearer <CRON_SECRET>`. If the secret isn't configured,
// the endpoint refuses public traffic (this isn't supposed to be hit by
// browsers).

import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { log, reqIdFrom } from "@/lib/log";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const reqId = reqIdFrom(req);
  const expected = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") ?? "";
  if (expected && authHeader !== `Bearer ${expected}`) {
    log.warn("warmer received unauthorized request", { reqId, scope: "warmer" });
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  try {
    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM cafe_speed_stats`,
    );
    const elapsed = Date.now() - started;
    log.info("warmer poke completed", {
      reqId,
      scope: "warmer",
      elapsedMs: elapsed,
      cafeStatsCount: Number(rows[0]?.count ?? 0),
    });
    return Response.json({
      ok: true,
      cafeStatsCount: Number(rows[0]?.count ?? 0),
      elapsedMs: elapsed,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const elapsed = Date.now() - started;
    log.error("warmer poke failed", { reqId, scope: "warmer", elapsedMs: elapsed, reason });
    return Response.json(
      { ok: false, error: reason, elapsedMs: elapsed },
      { status: 502 },
    );
  }
}
