// Shared access gate for the venue-capture write routes. The same three
// checks guard every mutation path (scan creation, frame chunks, finalize):
// pilot-crew membership, a configured backend, and launch jurisdiction
// resolved from the *venue record* server-side — a client-supplied `city`
// hint may corroborate but never overrides.

import {
  base44Configured,
  b44GetCafeById,
} from "./base44-data";
import {
  venueCaptureAllowedForCity,
  venueCaptureCrewAllowed,
  VENUE_CAPTURE_CREW_DENIED,
  VENUE_CAPTURE_JURISDICTION_DENIED,
} from "./venue-capture-policy";
import { log } from "./log";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export type VenueCaptureAccess =
  | { ok: true; city: string }
  | { ok: false; res: Response };

export async function resolveVenueCaptureAccess(opts: {
  contributorId: string;
  venueId: string;
  /** Optional client hint — validated against the record, never trusted. */
  cityHint?: string | null;
  reqId?: string;
  scope?: string;
}): Promise<VenueCaptureAccess> {
  // Pilot-crew gate — when VENUE_CAPTURE_CREW is set, only listed
  // contributor ids may write. Unset = open while the flag is on.
  if (!venueCaptureCrewAllowed(opts.contributorId)) {
    return {
      ok: false,
      res: Response.json({ error: VENUE_CAPTURE_CREW_DENIED }, { status: 403 }),
    };
  }

  if (!base44Configured) {
    return {
      ok: false,
      res: Response.json(
        { error: "venue capture backend unavailable" },
        { status: 503, headers: NO_STORE },
      ),
    };
  }

  // Launch-jurisdiction gate — the venue's city is resolved from its record.
  let city: string | undefined;
  try {
    const venue = await b44GetCafeById(opts.venueId);
    if (!venue) {
      return {
        ok: false,
        res: Response.json({ error: "venue not found" }, { status: 404 }),
      };
    }
    city = venue.city;
  } catch (err) {
    log.error("venue-scan city lookup failed", {
      reqId: opts.reqId,
      scope: opts.scope ?? "venueScans.jurisdiction",
      reason: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      res: Response.json(
        { error: "couldn't verify the venue — please try again" },
        { status: 503, headers: NO_STORE },
      ),
    };
  }

  const hint = opts.cityHint;
  if (hint && hint.trim().toLowerCase() !== city.trim().toLowerCase()) {
    return {
      ok: false,
      res: Response.json(
        { error: "city hint doesn't match the venue record" },
        { status: 400 },
      ),
    };
  }
  if (!venueCaptureAllowedForCity(city)) {
    return {
      ok: false,
      res: Response.json(
        { error: VENUE_CAPTURE_JURISDICTION_DENIED },
        { status: 403 },
      ),
    };
  }
  return { ok: true, city };
}
