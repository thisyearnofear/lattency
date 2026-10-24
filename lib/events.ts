// Community events hosted at venues. Only `approved` entries are ever returned
// to the public — the Base44 entity rules enforce this server-side, and
// `filterApprovedEvents` enforces it again on the client-facing path.

import { base44Configured } from "./base44";
import {
  b44InsertCommunity,
  b44InsertEvent,
  b44ListCommunities,
  b44ListEvents,
} from "./base44-data";
import { log } from "./log";

export interface CommunityEvent {
  id: string;
  title: string;
  startsAt: string; // ISO 8601
  venueId: string;
  communityName: string | null;
  city: string;
  link: string | null;
  approved: boolean;
  submittedBy?: string | null;
}

export interface Community {
  id: string;
  name: string;
  focus: string | null;
  lead: string | null;
  city: string;
  websiteUrl: string | null;
  lumaUrl: string | null;
  approved: boolean;
  submittedBy?: string | null;
}

export function filterApprovedEvents(
  events: CommunityEvent[],
  opts: { city?: string; now?: number } = {},
): CommunityEvent[] {
  const now = opts.now ?? Date.now();
  return events
    .filter((e) => e.approved)
    .filter((e) => !opts.city || e.city === opts.city)
    .filter((e) => Date.parse(e.startsAt) >= now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

const DAY = 24 * 60 * 60 * 1000;

function inDays(days: number, hour: number): string {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

// Mock events for mock mode. Dates are relative to now so they stay upcoming.
// The last entry is unapproved on purpose: it must never appear publicly.
export const MOCK_EVENTS: CommunityEvent[] = [
  {
    id: "evt-1",
    title: "Open laptop Thursday",
    startsAt: inDays(3, 18),
    venueId: "ldn-1",
    communityName: "Shoreditch Remote Club",
    city: "london",
    link: null,
    approved: true,
  },
  {
    id: "evt-2",
    title: "Pour-over morning for newcomers",
    startsAt: inDays(6, 9),
    venueId: "ldn-2",
    communityName: null,
    city: "london",
    link: null,
    approved: true,
  },
  {
    id: "evt-3",
    title: "Unreviewed submission",
    startsAt: inDays(4, 12),
    venueId: "ldn-3",
    communityName: null,
    city: "london",
    link: null,
    approved: false,
  },
];

export function filterApprovedCommunities(
  communities: Community[],
  opts: { city?: string } = {},
): Community[] {
  return communities
    .filter((c) => c.approved)
    .filter((c) => !opts.city || c.city === opts.city)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Mock communities. The last entry is unapproved on purpose.
export const MOCK_COMMUNITIES: Community[] = [
  {
    id: "com-1",
    name: "Shoreditch Remote Club",
    focus: "Remote workers and freelancers",
    lead: null,
    city: "london",
    websiteUrl: null,
    lumaUrl: null,
    approved: true,
  },
  {
    id: "com-2",
    name: "Pour-over Mornings",
    focus: "Coffee brewing meetups",
    lead: null,
    city: "london",
    websiteUrl: null,
    lumaUrl: null,
    approved: true,
  },
  {
    id: "com-3",
    name: "Unreviewed group",
    focus: null,
    lead: null,
    city: "london",
    websiteUrl: null,
    lumaUrl: null,
    approved: false,
  },
];

/**
 * Approved communities for a city. Reads Base44 when configured, otherwise the
 * bundled mock list. Falls back to mock data if the Base44 call fails.
 */
export async function getCommunities(opts: { city?: string } = {}): Promise<Community[]> {
  const approvedLocal = localCommunities.filter((c) => c.approved);
  if (base44Configured) {
    try {
      return filterApprovedCommunities(
        [...(await b44ListCommunities(opts)), ...approvedLocal],
        opts,
      );
    } catch {
      // Fall through to the mock snapshot.
    }
  }
  return filterApprovedCommunities([...MOCK_COMMUNITIES, ...approvedLocal], opts);
}

/**
 * Upcoming approved events for a city. Reads Base44 when configured, otherwise
 * the bundled mock list. Falls back to mock data if the Base44 call fails.
 */
export async function getEvents(opts: { city?: string } = {}): Promise<CommunityEvent[]> {
  const approvedLocal = localEvents.filter((e) => e.approved);
  if (base44Configured) {
    try {
      return filterApprovedEvents(
        [...(await b44ListEvents(opts)), ...approvedLocal],
        opts,
      );
    } catch {
      // Fall through to the mock snapshot, matching lib/cafes.ts behaviour.
    }
  }
  return filterApprovedEvents([...MOCK_EVENTS, ...approvedLocal], opts);
}

export interface EventInput {
  title: string;
  startsAt: string;
  venueId: string;
  communityName: string | null;
  city: string;
  link: string | null;
  submittedBy: string | null;
}

/** Server-side validation for a submission. Returns an error string, or null. */
export function validateEventInput(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return "body must be JSON";
  const b = raw as Record<string, unknown>;
  if (typeof b.title !== "string" || b.title.trim().length < 4)
    return "title required (min 4 characters)";
  if (b.title.trim().length > 90) return "title too long (max 90 characters)";
  const startsAt = typeof b.startsAt === "string" ? Date.parse(b.startsAt) : NaN;
  if (!Number.isFinite(startsAt)) return "startsAt must be an ISO date";
  if (startsAt < Date.now() - 60 * 60_000) return "startsAt is in the past";
  if (typeof b.venueId !== "string" || !b.venueId.trim()) return "venueId required";
  if (typeof b.city !== "string" || !b.city.trim()) return "city required";
  if (b.communityName != null && typeof b.communityName !== "string")
    return "communityName must be a string";
  if (typeof b.link === "string" && b.link && !/^https?:\/\//.test(b.link))
    return "link must be an http(s) URL";
  return null;
}

// Mock-mode write overlay for events. Submissions land here as `approved: false`
// so the approval gate is demonstrable offline, the way
// lib/local-contributions.ts does for cafés. Process-local only.
const localEvents: CommunityEvent[] = [];
let localCounter = 0;

/**
 * Record an organiser submission. Always starts unapproved — the submitter is
 * never the approver, which is the trust model of the open DB.
 */
export async function submitEvent(input: EventInput): Promise<CommunityEvent> {
  const clean: CommunityEvent = {
    id: `${input.title.trim().slice(0, 4).toLowerCase()}-${Date.now().toString(36)}-${(localCounter += 1)}`,
    title: input.title.trim(),
    startsAt: new Date(input.startsAt).toISOString(),
    venueId: input.venueId.trim(),
    communityName: input.communityName?.trim() || null,
    city: input.city.trim().toLowerCase(),
    link: input.link?.trim() || null,
    approved: false,
    submittedBy: input.submittedBy,
  };

  if (base44Configured) {
    try {
      return { ...clean, id: await b44InsertEvent(clean) };
    } catch {
      // Fall through to the overlay so a backend hiccup never dead-ends the
      // flow — same degradation contract as the café write path.
    }
  }

  localEvents.push(clean);
  return clean;
}

/**
 * Demo-mode approval: puts a locally submitted event on the public board.
 * Production approvals belong to the Base44 admin, never here — a real
 * moderation surface is the piece an open DB still owes.
 */
export function approveLocalEvent(id: string): boolean {
  const found = localEvents.find((e) => e.id === id);
  if (!found) return false;
  found.approved = true;
  return true;
}

/** The submitter's own pending queue (overlay only — Base44 read rules hide it). */
export function getPendingEvents(submittedBy: string | null): CommunityEvent[] {
  if (!submittedBy) return [];
  return localEvents
    .filter((e) => !e.approved && e.submittedBy === submittedBy)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Reset the event overlay. Exported only for tests. */
export function __resetLocalEventsForTests(): void {
  localEvents.length = 0;
  localCounter = 0;
}

// --- Communities: the groups that keep this board alive. ---------------------

export interface CommunityInput {
  name: string;
  focus: string | null;
  lead: string | null;
  city: string;
  websiteUrl: string | null;
  lumaUrl: string | null;
  submittedBy: string | null;
}

/** Server-side validation for a community submission. */
export function validateCommunityInput(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return "body must be JSON";
  const b = raw as Record<string, unknown>;
  if (typeof b.name !== "string" || b.name.trim().length < 2)
    return "name required (min 2 characters)";
  if (b.name.trim().length > 60) return "name too long (max 60 characters)";
  if (typeof b.city !== "string" || !b.city.trim()) return "city required";
  if (b.city.trim().length > 40) return "city too long (max 40 characters)";
  if (b.focus != null && typeof b.focus !== "string") return "focus must be a string";
  if (typeof b.focus === "string" && b.focus.length > 120)
    return "focus too long (max 120 characters)";
  if (b.lead != null && typeof b.lead !== "string") return "lead must be a string";
  if (typeof b.lead === "string" && b.lead.length > 40)
    return "lead too long (max 40 characters)";
  if (b.websiteUrl != null && typeof b.websiteUrl === "string" && b.websiteUrl) {
    if (b.websiteUrl.length > 500) return "websiteUrl too long (max 500 characters)";
    if (!/^https?:\/\//.test(b.websiteUrl)) return "websiteUrl must be an http(s) URL";
  }
  if (b.lumaUrl != null && typeof b.lumaUrl === "string" && b.lumaUrl) {
    if (b.lumaUrl.length > 500) return "lumaUrl too long (max 500 characters)";
    if (!/^https?:\/\//.test(b.lumaUrl)) return "lumaUrl must be an http(s) URL";
  }
  return null;
}

const localCommunities: Community[] = [];
let localCommunityCounter = 0;

export async function submitCommunity(input: CommunityInput): Promise<Community> {
  const clean: Community = {
    id: `com-${Date.now().toString(36)}-${(localCommunityCounter += 1)}`,
    name: input.name.trim(),
    focus: input.focus?.trim() || null,
    lead: input.lead?.trim() || null,
    city: input.city.trim().toLowerCase(),
    websiteUrl: input.websiteUrl?.trim() || null,
    lumaUrl: input.lumaUrl?.trim() || null,
    approved: false,
    submittedBy: input.submittedBy,
  };

  if (base44Configured) {
    try {
      const id = await b44InsertCommunity(clean);
      return { ...clean, id };
    } catch (err) {
      // Fall through to the overlay — but say so. A registration that only
      // exists in this process can never be approved by a moderator.
      log.warn("community write fell back to local overlay", {
        scope: "contribute.community",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  localCommunities.push(clean);
  return clean;
}

export function approveLocalCommunity(id: string): boolean {
  const found = localCommunities.find((c) => c.id === id);
  if (!found) return false;
  found.approved = true;
  return true;
}

/** The submitter's own pending queue (overlay only — Base44 read rules hide it). */
export function getPendingCommunities(submittedBy: string | null): Community[] {
  if (!submittedBy) return [];
  return localCommunities
    .filter((c) => !c.approved && c.submittedBy === submittedBy)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Reset the community overlay. Exported only for tests. */
export function __resetLocalCommunitiesForTests(): void {
  localCommunities.length = 0;
  localCommunityCounter = 0;
}
