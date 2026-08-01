import { NextRequest } from "next/server";
import { getBase44, base44Configured } from "@/lib/base44";

export const dynamic = "force-dynamic";

interface ContributorProfileEntity {
  contributor_id: string;
  display_name?: string | null;
}

// GET /api/profile?ids=contrib-abc,NQ...
// Resolves contributor ids to their chosen display names. Display names are
// optional and stored on a tiny ContributorProfile entity; anonymous
// contributors resolve to null and fall back to a derived handle client-side.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    return Response.json({ profiles: {} });
  }
  if (ids.length > 50) {
    return Response.json({ error: "too many ids (max 50)" }, { status: 400 });
  }

  if (!base44Configured) {
    return Response.json({ profiles: {} });
  }

  try {
    const rows = (await getBase44().entities.ContributorProfile.filter(
      { contributor_id: { $in: ids } },
      "-created_date",
      ids.length,
      0,
    )) as unknown as ContributorProfileEntity[];

    const profiles: Record<string, string | null> = {};
    for (const row of rows) {
      profiles[row.contributor_id] = row.display_name ?? null;
    }
    return Response.json({ profiles });
  } catch {
    return Response.json({ profiles: {} });
  }
}

// PUT /api/profile
// Body: { contributorId, displayName }
// Upserts the contributor's chosen display name (<=24 chars, sanitized).
export async function PUT(req: NextRequest) {
  let body: { contributorId?: string; displayName?: string };
  try {
    body = (await req.json()) as { contributorId?: string; displayName?: string };
  } catch {
    return Response.json({ error: "body must be JSON" }, { status: 400 });
  }

  const id = body.contributorId?.trim();
  const name = body.displayName?.trim().slice(0, 24);
  if (!id) return Response.json({ error: "contributorId required" }, { status: 400 });
  if (!name) return Response.json({ error: "displayName required" }, { status: 400 });

  if (!base44Configured) {
    // Mock mode: acknowledge without persisting (no durable backend).
    return Response.json({ success: true, mock: true });
  }

  try {
    const base44 = getBase44();
    const existing = (await base44.entities.ContributorProfile.filter(
      { contributor_id: id },
      "-created_date",
      1,
      0,
    )) as unknown as Array<{ id: string }>;

    if (existing.length > 0) {
      await base44.entities.ContributorProfile.update(existing[0].id, {
        display_name: name,
      });
    } else {
      await base44.entities.ContributorProfile.create({
        contributor_id: id,
        display_name: name,
      });
    }
    return Response.json({ success: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "save failed" },
      { status: 500 },
    );
  }
}
