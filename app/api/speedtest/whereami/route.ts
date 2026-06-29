import { NextRequest } from "next/server";

// GET /api/speedtest/whereami
//
// Returns the Vercel edge region serving this request, so the UI can
// display "Measured against: [region]" for transparency. The speed test
// (lib/speedtest.ts) already captures the x-vercel-id header from its
// own requests; this endpoint is for displaying the info independently
// of running a test (e.g. on the café page before the user clicks "Run").
//
// The x-vercel-id header format is "<region>::<deployment-hash>", e.g.
// "iad1::abc123". We split on "::" and return the region part.

export async function GET(req: NextRequest): Promise<Response> {
  const vercelId = req.headers.get("x-vercel-id");
  const region = vercelId ? vercelId.split("::")[0] : null;

  return Response.json({
    edge: region,
    vercelId: vercelId ?? null,
  });
}
