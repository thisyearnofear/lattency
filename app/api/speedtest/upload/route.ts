import { NextRequest } from "next/server";

// POST /api/speedtest/upload
//
// The speed test's upload phase (lib/speedtest.ts) POSTs 1 MB payloads here
// sequentially. The handler consumes the body so Vercel receives it fully,
// then discards it — no storage, no side effects. The client measures the
// wall-clock time from request start to response to compute upload Mbps.
//
// force-dynamic so the route always runs as a function (never statically
// cached) — each POST must actually hit the serverless runtime.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  // Drain the body so the full upload is received before we respond.
  await req.blob();
  return new Response(null, { status: 200 });
}
