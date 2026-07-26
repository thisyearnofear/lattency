import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

// Scheduled housekeeping: deactivates open bounties whose expires_at has
// passed. Keeps the bounty board honest without anyone touching it.
// Runs under service role (scheduled automations have no user context).

interface B44Bounty {
  id: string;
  status: string;
  expires_at: string | null;
  active: boolean;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Read args for observability; the cron fires daily regardless.
    const body = await req.json().catch(() => ({}));
    void body;

    const now = Date.now();
    const bounties = (await base44.asServiceRole.entities.Bounty.filter(
      { active: true, status: "open" },
      "-created_date",
      500,
      0,
    )) as B44Bounty[];

    let expired = 0;
    for (const bounty of bounties) {
      if (!bounty.expires_at) continue;
      const exp = new Date(bounty.expires_at).getTime();
      if (Number.isFinite(exp) && exp < now) {
        await base44.asServiceRole.entities.Bounty.update(bounty.id, {
          active: false,
        });
        expired++;
      }
    }

    return Response.json({ expired, scanned: bounties.length, at: new Date().toISOString() });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
});
