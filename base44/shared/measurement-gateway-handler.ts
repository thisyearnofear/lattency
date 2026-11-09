import { authorizeGateway } from "./gateway-auth.ts";
import {
  measurementInputFromRecord,
  measurementRecord,
  validateMeasurement,
} from "./measurement-validation.ts";
import { publicCafe } from "./public-cafe.ts";

export interface GatewayClient {
  asServiceRole: {
    entities: {
      Measurement: {
        filter: (
          query: Record<string, unknown>,
          sort?: string,
          limit?: number,
          offset?: number,
        ) => Promise<Record<string, unknown>[]>;
        create: (record: Record<string, unknown>) => Promise<{ id: string }>;
      };
      Cafe: {
        get: (id: string) => Promise<Record<string, unknown> | null>;
      };
    };
  };
}

const NO_STORE = { "Cache-Control": "no-store" } as const;

function err(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: NO_STORE });
}

export async function measurementGatewayHandler(
  req: Request,
  secret: string | undefined,
  makeClient: () => GatewayClient,
): Promise<Response> {
  if (req.method !== "POST") return err(405, "Method not allowed");

  const unauthorized = await authorizeGateway(req, secret);
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err(400, "body must be JSON");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body))
    return err(400, "body must be an object");
  const action = (body as Record<string, unknown>).action;
  if (typeof action !== "string") return err(400, "action required");

  try {
    const base44 = makeClient();

    if (action === "insert") {
      const measurement = (body as Record<string, unknown>).measurement;
      if (measurement === null || typeof measurement !== "object" || Array.isArray(measurement))
        return err(400, "measurement object required");
      const record = measurement as Record<string, unknown>;
      const cafeId = record.cafe_id;
      if (typeof cafeId !== "string" || cafeId.length === 0 || cafeId.length > 128)
        return err(400, "measurement.cafe_id required");

      const validationError = validateMeasurement(measurementInputFromRecord(record));
      if (validationError) return err(400, validationError);

      let cafe: Record<string, unknown> | null;
      try {
        cafe = await base44.asServiceRole.entities.Cafe.get(cafeId);
      } catch (e) {
        const status = (e as { status?: number })?.status;
        if (status === 404) return err(404, "cafe not found");
        throw e;
      }
      if (!cafe) return err(404, "cafe not found");

      const row = await base44.asServiceRole.entities.Measurement.create(
        measurementRecord(record, cafeId),
      );
      return Response.json({ measurementId: row.id }, { status: 201, headers: NO_STORE });
    }

    if (action === "leaderboard") {
      const rows = await base44.asServiceRole.entities.Measurement.filter(
        {},
        "-measured_at",
        500,
        0,
      );
      return Response.json(
        {
          rows: rows.map((r) => ({
            contributor_user_id: r.contributor_user_id,
            cafe_id: r.cafe_id,
            measured_at: r.measured_at,
          })),
        },
        { headers: NO_STORE },
      );
    }

    if (action === "cafe") {
      const cafeId = (body as Record<string, unknown>).cafe_id;
      if (typeof cafeId !== "string" || cafeId.length === 0 || cafeId.length > 128)
        return err(400, "cafe_id required");
      let cafe: Record<string, unknown> | null;
      try {
        cafe = await base44.asServiceRole.entities.Cafe.get(cafeId);
      } catch (e) {
        const status = (e as { status?: number })?.status;
        if (status === 404) return Response.json({ cafe: null }, { headers: NO_STORE });
        throw e;
      }
      return Response.json(
        { cafe: cafe ? publicCafe(cafe) : null },
        { headers: NO_STORE },
      );
    }

    return err(400, "unknown action");
  } catch {
    return err(503, "Contribution gateway unavailable");
  }
}
