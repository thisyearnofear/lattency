// Bounty progress — extracted from base44/functions/update-bounty-progress
// so the criteria logic is unit-testable from Vitest (same pattern as
// list-cafes-handler.ts). The entry file stays a thin Deno.serve wrapper.
//
// Called by the Next.js API after every measurement insert. Finds open,
// funded, unexpired bounties whose area matches the café and advances them —
// but only when the bounty KIND says this reading counts:
//
//   - nth-contributor ("be the 10th reported test") counts DISTINCT
//     contributors. The same identity re-running a speed test cannot fill a
//     bounty it already advanced. Contributor ids are stored on the bounty in
//     `contributing_contributor_ids` so dedupe survives retries; a reading
//     with no contributor identity cannot be deduped and is not counted.
//   - first-in-neighbourhood / attribute-match count distinct VENUES — the
//     same café can't satisfy "3 cafés in Hoxton" three times. The same
//     `contributing_contributor_ids` field stores café ids for these kinds;
//     the set is per-bounty so semantics can't collide across kinds.
//   - tier-target additionally requires the café's current median (the same
//     outlier-aware median list-cafes computes) to satisfy the target tier.
//     The tier is read from `criteria` ("tier-target:express"); the default
//     is "express", the only tier the seeded goals name.
//
// Invariants: never count an unfunded row (funding_status "unverified"), an
// expired bounty, or past the target. Progress hitting target flips status
// to "claiming" in the same write.
//
// Returns the matched bounty ids so the caller can record contributor
// attribution (in durable BountyState) for each one it advanced. Attribution
// deliberately does NOT live here: this function runs under the service role
// and the Bounty entity stores progress + dedupe sets, not claim identity.

type Tier = "express" | "local" | "suspended";

const TIER_RANK: Record<Tier, number> = { express: 2, local: 1, suspended: 0 };

interface Input {
  cafe_id?: string;
  down_mbps?: number;
  contributor_id?: string | null;
  record?: {
    cafe_id?: string;
    down_mbps?: number;
    contributor_user_id?: string | null;
    contributor_id?: string | null;
  };
}

interface B44Bounty {
  id: string;
  target?: number;
  progress?: number;
  status?: string;
  target_city?: string | null;
  target_neighbourhood?: string | null;
  kind?: string;
  criteria?: string | null;
  expires_at?: string | null;
  funding_status?: string | null;
  contributing_contributor_ids?: string[] | null;
}

interface B44Cafe {
  id: string;
  city?: string | null;
  neighbourhood?: string | null;
}

interface B44Measurement {
  down_mbps?: number;
  is_outlier?: boolean | null;
}

export interface BountyProgressClient {
  asServiceRole: {
    entities: {
      Cafe: {
        get: (id: string) => Promise<Record<string, unknown> | null>;
      };
      Bounty: {
        filter: (
          query: Record<string, unknown>,
          sort?: string,
          limit?: number,
          offset?: number,
        ) => Promise<Record<string, unknown>[]>;
        update: (id: string, patch: Record<string, unknown>) => Promise<unknown>;
      };
      Measurement: {
        filter: (
          query: Record<string, unknown>,
          sort?: string,
          limit?: number,
          offset?: number,
        ) => Promise<Record<string, unknown>[]>;
      };
    };
  };
}

function median(vals: number[]): number {
  if (vals.length === 0) return 0;
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Same thresholds as list-cafes-handler.ts tierFrom — the two must agree or
// a bounty would count cafés the map doesn't display as qualifying.
function tierFrom(medianDown: number): Tier {
  if (medianDown >= 50) return "express";
  if (medianDown >= 10) return "local";
  return "suspended";
}

/** The tier a tier-target bounty wants — parsed from `criteria`, default express. */
function wantedTier(criteria: string | null | undefined): Tier {
  const m = /tier-target:(express|local|suspended)/.exec(criteria ?? "");
  return (m?.[1] as Tier | undefined) ?? "express";
}

/** Today as YYYY-MM-DD; expires_at may carry a date or a full timestamp. */
function isExpired(expiresAt: string | null | undefined, today: string): boolean {
  return Boolean(expiresAt) && expiresAt!.slice(0, 10) < today;
}

export async function updateBountyProgressHandler(
  req: Request,
  makeClient: () => BountyProgressClient,
): Promise<Response> {
  try {
    const base44 = makeClient();
    const body = (await req.json()) as Input;

    // Accept either direct call ({cafe_id, ...}) or entity-event ({record}).
    const cafeId = body.cafe_id ?? body.record?.cafe_id;
    if (!cafeId) {
      return Response.json({ skipped: true, reason: "no cafe_id" });
    }
    const contributorId =
      body.contributor_id ??
      body.record?.contributor_user_id ??
      body.record?.contributor_id ??
      null;
    const readingMbps = body.down_mbps ?? body.record?.down_mbps;

    // Look up the café the measurement belongs to for area matching.
    let cafe: B44Cafe | null = null;
    try {
      cafe = (await base44.asServiceRole.entities.Cafe.get(cafeId)) as B44Cafe | null;
    } catch {
      return Response.json({ skipped: true, reason: "cafe not found" });
    }
    if (!cafe) {
      return Response.json({ skipped: true, reason: "cafe not found" });
    }

    // Find open bounties.
    const bounties = (await base44.asServiceRole.entities.Bounty.filter(
      { status: "open" },
      "-created_date",
      100,
      0,
    )) as unknown as B44Bounty[];

    const today = new Date().toISOString().slice(0, 10);
    const cafeTierNeedsMedian = () =>
      base44.asServiceRole.entities.Measurement.filter(
        { cafe_id: cafeId },
        "-measured_at",
        500,
        0,
      ) as Promise<Record<string, unknown>[]>;

    // The café's current tier is only needed when a tier-target bounty
    // matches — fetched lazily so non-tier writes pay no extra read.
    let cafeTier: Tier | null = null;
    let cafeTierKnown = false;

    let updated = 0;
    const matched: Array<{ id: string; progress: number; target: number }> = [];
    for (const bounty of bounties) {
      // Unfunded rows never advance — an unverified bounty has no confirmed
      // money behind it.
      if (bounty.funding_status === "unverified") continue;
      // Expired bounties are skipped (read-side expiry hides them anyway,
      // but progress must stop here too so a stale row can't flip to
      // "claiming" after the fact).
      if (isExpired(bounty.expires_at, today)) continue;

      // Area match: if the bounty targets a city/neighbourhood, the café
      // must be in it. Bounties with no area target count globally.
      const cityMatch =
        !bounty.target_city ||
        (cafe.city ?? "nairobi") === bounty.target_city;
      const hoodMatch =
        !bounty.target_neighbourhood ||
        (cafe.neighbourhood ?? "") === bounty.target_neighbourhood;
      if (!cityMatch || !hoodMatch) continue;

      const target = bounty.target ?? 1;
      const progress = bounty.progress ?? 0;
      // A filled bounty can't advance further — belt-and-braces alongside
      // the claiming flip below.
      if (progress >= target) continue;

      const counted = new Set(bounty.contributing_contributor_ids ?? []);
      let dedupeKey: string | null;
      if (bounty.kind === "nth-contributor") {
        // Counts DISTINCT contributors. An unidentified reading can't be
        // deduped, so it can't prove it's "the Nth" — not counted.
        dedupeKey =
          typeof contributorId === "string" && contributorId.trim()
            ? contributorId.trim()
            : null;
      } else {
        // first-in-neighbourhood, attribute-match, tier-target: all count
        // distinct venues — one café can't satisfy a count-of-cafés bounty
        // repeatedly.
        dedupeKey = cafeId;
      }
      if (!dedupeKey || counted.has(dedupeKey)) continue;

      if (bounty.kind === "tier-target") {
        if (!cafeTierKnown) {
          cafeTierKnown = true;
          try {
            const rows = (await cafeTierNeedsMedian()) as unknown as B44Measurement[];
            // Outlier-aware median, mirroring list-cafes: prefer the clean
            // set when there are ≥3 readings, all readings otherwise. A
            // direct call can race its own insert, so fall back to the
            // reading carried on the request when the window is empty.
            const clean = rows.filter((m) => !m.is_outlier);
            const source = clean.length >= 3 ? clean : rows;
            const downs = source
              .map((m) => m.down_mbps)
              .filter((v): v is number => Number.isFinite(v));
            cafeTier = tierFrom(
              downs.length > 0
                ? median(downs)
                : Number.isFinite(readingMbps)
                  ? (readingMbps as number)
                  : 0,
            );
          } catch {
            // Can't establish the tier → treat as not satisfying rather than
            // counting on faith.
            cafeTier = "suspended";
          }
        }
        if (TIER_RANK[cafeTier!] < TIER_RANK[wantedTier(bounty.criteria)]) {
          continue;
        }
      }

      // Count it. newProgress tracks the dedupe set size, but a legacy row
      // created before sets existed keeps its stored progress as the floor.
      counted.add(dedupeKey);
      const newProgress = Math.min(target, Math.max(progress + 1, counted.size));
      const patch: Record<string, unknown> = {
        progress: newProgress,
        contributing_contributor_ids: [...counted],
      };
      // If this reading completes the bounty, it's now claimable.
      if (newProgress >= target) patch.status = "claiming";
      await base44.asServiceRole.entities.Bounty.update(bounty.id, patch);
      updated++;
      matched.push({ id: bounty.id, progress: newProgress, target });
    }

    return Response.json({ updated, cafe_id: cafeId, matched });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
