import { getCafeById } from "@/lib/cafes";

// GET /api/cafes/:id — café detail with per–time-bucket distribution.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Loose validation; if it's not a UUID the query returns no rows anyway.
  if (!id || id.length < 8) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  const cafe = await getCafeById(id);
  if (!cafe) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ cafe });
}
