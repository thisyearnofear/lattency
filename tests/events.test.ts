import { describe, expect, it, beforeEach } from "vitest";
import {
  __resetLocalEventsForTests,
  approveLocalEvent,
  filterApprovedCommunities,
  filterApprovedEvents,
  getCommunities,
  getEvents,
  getPendingEvents,
  submitEvent,
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
    __resetLocalEventsForTests();
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
