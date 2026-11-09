import { describe, it, expect } from "vitest";
import type { CafeStation } from "@/lib/types";
import {
  venueNeeds,
  askFor,
  nextAsk,
  staleDays,
  rankNeedsByProximity,
  VENUE_STALE_AFTER_MS,
  NEARBY_NEED_RADIUS_KM,
  NEARBY_NEED_CAP,
  type VenueNeed,
} from "@/lib/venue-needs";
import {
  askDismissalKey,
  dismissalActive,
  isAskDismissed,
  dismissAsk,
  ASK_DISMISSAL_TTL_MS,
} from "@/lib/ask-dismissals";

const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

/** The "rich" fixture — photo, fresh reading, upload leg, full metadata.
 *  Tests knock fields out to open the need they exercise. */
function station(overrides: Partial<CafeStation> = {}): CafeStation {
  return {
    id: "c-1",
    name: "About Thyme",
    neighbourhood: "Hoxton",
    lat: 51.53,
    lng: -0.08,
    tier: "express",
    medianDownMbps: 120,
    medianUpMbps: 24,
    medianLatencyMs: 9,
    medianJitterMs: 2,
    medianLossPct: 0,
    measurementCount: 12,
    latestPhotoUrl: "data:image/jpeg;base64,abc",
    vibe: "quiet hum",
    city: "london",
    lastReadingAt: new Date(NOW - 2 * DAY).toISOString(),
    metadata: {
      priceTier: "mid",
      powerOutlets: true,
      seating: "tables",
      noiseLevel: "quiet",
    },
    ...overrides,
  };
}

describe("venueNeeds", () => {
  it("orders needs by scarcity weight: photo → freshness → upload → facts → scan", () => {
    const sparse = station({
      latestPhotoUrl: null,
      photoUrl: null,
      lastReadingAt: new Date(NOW - 30 * DAY).toISOString(),
      medianUpMbps: 0,
      metadata: { priceTier: "mid" },
    });
    expect(venueNeeds(sparse, NOW, false)).toEqual([
      "photo",
      "freshness",
      "upload",
      "facts",
      "scan",
    ]);
  });

  it("asks for photo first when a station has no photo", () => {
    const faceless = station({ latestPhotoUrl: null, photoUrl: null });
    expect(venueNeeds(faceless, NOW, true)[0]).toBe("photo");
  });

  it("treats either photoUrl or latestPhotoUrl as a photo", () => {
    expect(
      venueNeeds(
        station({ latestPhotoUrl: null, photoUrl: "data:image/jpeg;base64,x" }),
        NOW,
        true,
      ),
    ).not.toContain("photo");
  });

  it("an empty station asks for photo, freshness, and facts — not upload", () => {
    const empty = station({
      latestPhotoUrl: null,
      photoUrl: null,
      lastReadingAt: undefined,
      measurementCount: 0,
      medianDownMbps: 0,
      medianUpMbps: 0,
      metadata: undefined,
    });
    // No readings means no upload gap — the first reading covers both legs.
    expect(venueNeeds(empty, NOW, false)).toEqual([
      "photo",
      "freshness",
      "facts",
      "scan",
    ]);
  });

  it("a fresh rich station with a published scan reports no needs", () => {
    expect(venueNeeds(station(), NOW, true)).toEqual([]);
  });

  it("a fresh rich station without a published scan lists only scan", () => {
    expect(venueNeeds(station(), NOW, false)).toEqual(["scan"]);
  });

  it("reports scan as a need when scan state is unchecked (hasScan undefined)", () => {
    expect(venueNeeds(station(), NOW)).toEqual(["scan"]);
  });

  it("a reading exactly 14 days old is not stale", () => {
    const s = station({
      lastReadingAt: new Date(NOW - VENUE_STALE_AFTER_MS).toISOString(),
    });
    expect(venueNeeds(s, NOW, true)).not.toContain("freshness");
  });

  it("a reading older than 14 days is stale", () => {
    const s = station({
      lastReadingAt: new Date(NOW - VENUE_STALE_AFTER_MS - 1).toISOString(),
    });
    expect(venueNeeds(s, NOW, true)).toContain("freshness");
  });

  it("a missing lastReadingAt counts as a freshness gap", () => {
    const s = station({ lastReadingAt: undefined });
    expect(venueNeeds(s, NOW, true)).toContain("freshness");
  });

  it("upload need fires when readings exist but the upload leg is missing", () => {
    expect(
      venueNeeds(station({ medianUpMbps: 0 }), NOW, true),
    ).toContain("upload");
  });

  it("upload need clears when a real upload median exists", () => {
    expect(venueNeeds(station(), NOW, true)).not.toContain("upload");
  });

  it("upload need does not fire on a station with zero readings", () => {
    const s = station({ measurementCount: 0, medianUpMbps: 0 });
    expect(venueNeeds(s, NOW, true)).not.toContain("upload");
  });

  it("facts need clears once two metadata fields are set — and powerOutlets:false counts as an answer", () => {
    expect(
      venueNeeds(
        station({ metadata: { priceTier: "mid", powerOutlets: false } }),
        NOW,
        true,
      ),
    ).not.toContain("facts");
  });

  it("facts need fires when fewer than two metadata fields are set", () => {
    const s = station({ metadata: { wifiNetwork: "cafe-guest" } });
    expect(venueNeeds(s, NOW, true)).toContain("facts");
  });
});

describe("nextAsk", () => {
  it("returns the highest-scarcity un-answered need first", () => {
    const faceless = station({ latestPhotoUrl: null, photoUrl: null });
    expect(nextAsk(faceless, undefined, true, NOW)?.need).toBe("photo");
  });

  it("skips needs the ask layer already considers answered", () => {
    const facelessAndStale = station({
      latestPhotoUrl: null,
      photoUrl: null,
      lastReadingAt: new Date(NOW - 30 * DAY).toISOString(),
    });
    const answered = new Set<VenueNeed>(["photo"]);
    expect(nextAsk(facelessAndStale, answered, true, NOW)?.need).toBe(
      "freshness",
    );
  });

  it("returns null when every need is answered or satisfied", () => {
    expect(nextAsk(station(), undefined, true, NOW)).toBeNull();
    const sparse = station({ latestPhotoUrl: null });
    const all = new Set<VenueNeed>(["photo", "freshness", "upload", "facts", "scan"]);
    expect(nextAsk(sparse, all, false, NOW)).toBeNull();
  });

  it("freshness ask names the stale-day count in its gap line", () => {
    const s = station({
      lastReadingAt: new Date(NOW - 21 * DAY).toISOString(),
    });
    const next = nextAsk(s, new Set<VenueNeed>(["photo"]), true, NOW);
    expect(next?.need).toBe("freshness");
    expect(next?.ask.gap).toContain("21");
  });
});

describe("askFor", () => {
  it("maps each need to its contribution-ladder rung", () => {
    expect(askFor("facts").rung).toBe(2);
    expect(askFor("photo").rung).toBe(3);
    expect(askFor("freshness").rung).toBe(5);
    expect(askFor("upload").rung).toBe(5);
    expect(askFor("scan").rung).toBe(7);
  });

  it("every ask carries a time cost, a gap, and a payoff — and never says 'verified'", () => {
    for (const need of ["photo", "freshness", "upload", "facts", "scan"] as const) {
      const ask = askFor(need, { staleDays: 10 });
      expect(ask.timeCost).toBeTruthy();
      expect(ask.gap).toBeTruthy();
      expect(ask.payoff).toBeTruthy();
      expect(`${ask.label} ${ask.gap} ${ask.payoff}`).not.toMatch(/verified/i);
    }
  });

  it("staleDays sharpens the freshness gap", () => {
    expect(askFor("freshness", { staleDays: 30 }).gap).toContain("30");
    expect(askFor("freshness").gap).not.toMatch(/\d+ days/);
  });
});

describe("rankNeedsByProximity", () => {
  // User planted on the fixture's home coordinates (51.53, -0.08).
  const USER = { lat: 51.53, lng: -0.08 };
  // ~0.005° of latitude ≈ 0.6km — well inside the 1.5km reach.
  const NEAR = { lat: 51.535, lng: -0.08 };
  // ~0.03° of latitude ≈ 3.3km — outside it.
  const FAR = { lat: 51.56, lng: -0.08 };

  it("ranks nearer asks first, whatever their scarcity", () => {
    const near = station({
      id: "near",
      ...NEAR,
      // Only a facts gap — low scarcity, but closest.
      metadata: { priceTier: "mid" },
    });
    const far = station({
      id: "far",
      lat: USER.lat,
      lng: USER.lng - 0.018, // ~1.2km west, still inside the radius
      latestPhotoUrl: null,
      photoUrl: null, // photo — high scarcity, but farther
    });
    const rows = rankNeedsByProximity([far, near], USER.lat, USER.lng, NOW);
    expect(rows.map((r) => r.cafe.id)).toEqual(["near", "far"]);
    expect(rows[0].need).toBe("facts");
    expect(rows[1].need).toBe("photo");
    expect(rows[0].distanceKm).toBeLessThan(rows[1].distanceKm);
  });

  it("breaks distance ties toward the scarcer need", () => {
    const faceless = station({
      id: "faceless",
      latestPhotoUrl: null,
      photoUrl: null,
    });
    const detailless = station({
      id: "detailless",
      metadata: { priceTier: "mid" }, // facts only
    });
    const rows = rankNeedsByProximity(
      [detailless, faceless],
      USER.lat,
      USER.lng,
      NOW,
    );
    // Same coordinates → same distance → scarcity decides.
    expect(rows.map((r) => r.cafe.id)).toEqual(["faceless", "detailless"]);
    expect(rows[0].need).toBe("photo");
    expect(rows[1].need).toBe("facts");
  });

  it("drops stations beyond the nearby radius", () => {
    const inside = station({ id: "in", ...NEAR, metadata: { priceTier: "mid" } });
    const outside = station({ id: "out", ...FAR, latestPhotoUrl: null });
    const rows = rankNeedsByProximity(
      [inside, outside],
      USER.lat,
      USER.lng,
      NOW,
    );
    expect(rows.map((r) => r.cafe.id)).toEqual(["in"]);
    expect(
      rows.every((r) => r.distanceKm <= NEARBY_NEED_RADIUS_KM),
    ).toBe(true);
  });

  it("caps the ranking", () => {
    const stations = Array.from({ length: NEARBY_NEED_CAP + 2 }, (_, i) =>
      station({ id: `s-${i}`, metadata: { priceTier: "mid" } }),
    );
    expect(
      rankNeedsByProximity(stations, USER.lat, USER.lng, NOW),
    ).toHaveLength(NEARBY_NEED_CAP);
  });

  it("returns empty for an unusable location — never a prompt", () => {
    const needy = station({ latestPhotoUrl: null, photoUrl: null });
    expect(
      rankNeedsByProximity([needy], Number.NaN, USER.lng, NOW),
    ).toEqual([]);
    expect(rankNeedsByProximity([needy], 95, USER.lng, NOW)).toEqual([]);
    expect(rankNeedsByProximity([needy], USER.lat, 200, NOW)).toEqual([]);
  });

  it("skips needs already settled, falling through to the venue's next gap", () => {
    const staleAndFaceless = station({
      id: "both",
      latestPhotoUrl: null,
      photoUrl: null,
      lastReadingAt: new Date(NOW - 30 * DAY).toISOString(),
    });
    const dismissed = new Map<string, Set<VenueNeed>>([
      ["both", new Set<VenueNeed>(["photo"])],
    ]);
    const rows = rankNeedsByProximity(
      [staleAndFaceless],
      USER.lat,
      USER.lng,
      NOW,
      dismissed,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].need).toBe("freshness");
  });

  it("excludes a venue whose every need is settled", () => {
    const needy = station({ latestPhotoUrl: null, photoUrl: null });
    const dismissed = new Map<string, Set<VenueNeed>>([
      [
        needy.id,
        new Set<VenueNeed>(["photo", "freshness", "upload", "facts", "scan"]),
      ],
    ]);
    expect(
      rankNeedsByProximity([needy], USER.lat, USER.lng, NOW, dismissed),
    ).toEqual([]);
  });

  it("a malformed lastReadingAt still yields a freshness ask nearby", () => {
    const corrupt = station({ lastReadingAt: "not-a-date" });
    const rows = rankNeedsByProximity([corrupt], USER.lat, USER.lng, NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].need).toBe("freshness");
    // Unparseable → no day count to sharpen the gap with.
    expect(rows[0].ask.gap).not.toMatch(/\d+ days/);
  });

  it("a missing lastReadingAt also yields a freshness ask nearby", () => {
    const rows = rankNeedsByProximity(
      [station({ lastReadingAt: undefined })],
      USER.lat,
      USER.lng,
      NOW,
    );
    expect(rows[0]?.need).toBe("freshness");
  });

  it("never surfaces a scan ask — the strip can't confirm scan state", () => {
    // A rich station whose only gap would be the spatial record.
    expect(rankNeedsByProximity([station()], USER.lat, USER.lng, NOW)).toEqual(
      [],
    );
  });
});

describe("staleDays", () => {
  it("returns whole days since the last reading", () => {
    expect(staleDays(new Date(NOW - 21 * DAY).toISOString(), NOW)).toBe(21);
  });

  it("returns null for missing or unparseable timestamps", () => {
    expect(staleDays(undefined, NOW)).toBeNull();
    expect(staleDays("not-a-date", NOW)).toBeNull();
  });
});

describe("ask dismissals", () => {
  it("keys dismissals per (venue, need)", () => {
    expect(askDismissalKey("c-9", "photo")).toBe(
      "lattency:ask-dismissed:c-9:photo",
    );
  });

  it("a dismissal inside the 7-day window stays active", () => {
    expect(dismissalActive(NOW - 6 * DAY, NOW)).toBe(true);
    expect(dismissalActive(NOW, NOW)).toBe(true);
  });

  it("a dismissal expires at the 7-day boundary and resurfaces the ask", () => {
    expect(dismissalActive(NOW - ASK_DISMISSAL_TTL_MS, NOW)).toBe(false);
    expect(dismissalActive(NOW - ASK_DISMISSAL_TTL_MS - 1, NOW)).toBe(false);
  });

  it("future timestamps do not count as dismissals", () => {
    expect(dismissalActive(NOW + DAY, NOW)).toBe(false);
  });

  it("storage helpers no-op cleanly when localStorage is unavailable", () => {
    // Node env has no localStorage — writes are dropped, reads say not dismissed.
    dismissAsk("c-1", "photo", NOW);
    expect(isAskDismissed("c-1", "photo", NOW)).toBe(false);
  });
});
