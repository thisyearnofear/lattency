import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  __resetLocalCommunitiesForTests,
  __resetLocalEventsForTests,
  approveLocalCommunity,
  approveLocalEvent,
  filterApprovedCommunities,
  filterApprovedEvents,
  getCommunities,
  getEvents,
  getPendingCommunities,
  getPendingEvents,
  submitCommunity,
  submitEvent,
  validateCommunityInput,
  validateEventInput,
  MOCK_COMMUNITIES,
  MOCK_EVENTS,
  type Community,
  type CommunityEvent,
} from "@/lib/events";

const NOW = Date.parse("2026-10-22T12:00:00Z");

function ev(overrides: Partial<CommunityEvent>): CommunityEvent {
  return {
    id: "e",
    title: "Event",
    startsAt: "2026-10-25T18:00:00Z",
    venueId: "ldn-1",
    communityName: null,
    city: "london",
    link: null,
    approved: true,
    ...overrides,
  };
}

describe("filterApprovedEvents", () => {
  it("drops unapproved events", () => {
    const out = filterApprovedEvents(
      [ev({ id: "a" }), ev({ id: "b", approved: false })],
      { now: NOW },
    );
    expect(out.map((e) => e.id)).toEqual(["a"]);
  });

  it("scopes to a city", () => {
    const out = filterApprovedEvents(
      [ev({ id: "a", city: "london" }), ev({ id: "b", city: "nairobi" })],
      { city: "nairobi", now: NOW },
    );
    expect(out.map((e) => e.id)).toEqual(["b"]);
  });

  it("drops events that have already started", () => {
    const out = filterApprovedEvents(
      [ev({ id: "past", startsAt: "2026-10-01T18:00:00Z" }), ev({ id: "next" })],
      { now: NOW },
    );
    expect(out.map((e) => e.id)).toEqual(["next"]);
  });

  it("sorts soonest first", () => {
    const out = filterApprovedEvents(
      [
        ev({ id: "late", startsAt: "2026-11-01T18:00:00Z" }),
        ev({ id: "soon", startsAt: "2026-10-24T18:00:00Z" }),
      ],
      { now: NOW },
    );
    expect(out.map((e) => e.id)).toEqual(["soon", "late"]);
  });
});

describe("filterApprovedCommunities", () => {
  it("drops unapproved communities and scopes to a city", () => {
    const base: Community = {
      id: "c",
      name: "C",
      focus: null,
      lead: null,
      city: "london",
      websiteUrl: null,
      lumaUrl: null,
      approved: true,
    };
    const out = filterApprovedCommunities(
      [
        base,
        { ...base, id: "u", approved: false },
        { ...base, id: "n", city: "nairobi" },
      ],
      { city: "london" },
    );
    expect(out.map((c) => c.id)).toEqual(["c"]);
  });
});

describe("getCommunities (mock mode)", () => {
  it("returns only approved mock communities", async () => {
    const out = await getCommunities();
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((c) => c.approved)).toBe(true);
    expect(MOCK_COMMUNITIES.some((c) => !c.approved)).toBe(true);
  });
});

describe("getEvents (mock mode)", () => {
  it("returns only approved, upcoming mock events", async () => {
    const out = await getEvents();
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((e) => e.approved)).toBe(true);
    expect(out.some((e) => e.id === "evt-3")).toBe(false);
    expect(MOCK_EVENTS.some((e) => !e.approved)).toBe(true);
  });
});

describe("event submission (offline overlay)", () => {
  const input = {
    title: "Community demo night",
    startsAt: "2026-11-02T18:00:00Z",
    venueId: "ldn-1",
    communityName: "The Hack Collective",
    city: "london",
    link: "https://luma.com/demo",
    submittedBy: "contrib-tester",
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    __resetLocalEventsForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lands a submission as pending, never public", async () => {
    const evt = await submitEvent(input);
    expect(evt.approved).toBe(false);
    const board = await getEvents({ city: "london" });
    expect(board.some((e) => e.id === evt.id)).toBe(false);
  });

  it("keeps the submitter's queue private to that submitter", async () => {
    const evt = await submitEvent(input);
    expect(getPendingEvents("contrib-tester").map((e) => e.id)).toContain(evt.id);
    expect(getPendingEvents("contrib-other")).toEqual([]);
    expect(getPendingEvents(null)).toEqual([]);
  });

  it("publishes only after approval", async () => {
    const evt = await submitEvent(input);
    expect(approveLocalEvent(evt.id)).toBe(true);
    const board = await getEvents({ city: "london" });
    expect(board.map((e) => e.id)).toContain(evt.id);
    expect(getPendingEvents("contrib-tester")).toEqual([]);
  });

  it("rejects junk before it reaches the board", () => {
    expect(validateEventInput({ ...input, title: "abc" })).toMatch(/title/);
    expect(validateEventInput({ ...input, startsAt: "2020-01-01T00:00:00Z" })).toMatch(
      /past/,
    );
    expect(validateEventInput({ ...input, venueId: "" })).toMatch(/venueId/);
    expect(validateEventInput({ ...input, link: "javascript:alert(1)" })).toMatch(
      /http/,
    );
    expect(validateEventInput(input)).toBeNull();
  });
});

describe("community registration (offline overlay)", () => {
  const input = {
    name: "Shoreditch Remote Club",
    focus: "Remote workers and freelancers",
    lead: "Oli",
    city: "london",
    websiteUrl: "https://example.com",
    lumaUrl: "https://luma.com/src",
    submittedBy: "contrib-tester",
  };

  beforeEach(() => {
    __resetLocalCommunitiesForTests();
  });

  it("lands a registration as pending, never public", async () => {
    const com = await submitCommunity(input);
    expect(com.approved).toBe(false);
    const board = await getCommunities({ city: "london" });
    expect(board.some((c) => c.id === com.id)).toBe(false);
  });

  it("publishes only after approval", async () => {
    const com = await submitCommunity(input);
    expect(approveLocalCommunity(com.id)).toBe(true);
    const board = await getCommunities({ city: "london" });
    expect(board.map((c) => c.id)).toContain(com.id);
  });

  it("scopes the pending queue to the submitter", async () => {
    const com = await submitCommunity(input);
    expect(getPendingCommunities("contrib-tester").map((c) => c.id)).toContain(com.id);
    expect(getPendingCommunities("contrib-stranger")).toHaveLength(0);
    expect(getPendingCommunities(null)).toHaveLength(0);
  });

  it("rejects junk before it reaches the board", () => {
    expect(validateCommunityInput({ ...input, name: "x" })).toMatch(/name/);
    expect(validateCommunityInput({ ...input, city: "" })).toMatch(/city/);
    expect(validateCommunityInput({ ...input, websiteUrl: "javascript:alert(1)" })).toMatch(
      /websiteUrl/,
    );
    expect(validateCommunityInput(input)).toBeNull();
  });

  it("caps every field so an open board can't store a wall of text", () => {
    expect(validateCommunityInput({ ...input, name: "n".repeat(61) })).toMatch(/name/);
    expect(validateCommunityInput({ ...input, city: "c".repeat(41) })).toMatch(/city/);
    expect(validateCommunityInput({ ...input, focus: "f".repeat(121) })).toMatch(/focus/);
    expect(validateCommunityInput({ ...input, lead: "l".repeat(41) })).toMatch(/lead/);
    expect(
      validateCommunityInput({ ...input, websiteUrl: `https://e.com/${"p".repeat(500)}` }),
    ).toMatch(/websiteUrl/);
    expect(
      validateCommunityInput({ ...input, lumaUrl: `https://lu.ma/${"p".repeat(500)}` }),
    ).toMatch(/lumaUrl/);
  });
});
