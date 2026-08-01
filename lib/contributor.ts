// Contributor identity — the durable-ish handle that ties a browser's
// contributions, referrals, and status together.
//
// There is no account system by design: a contributor id is minted locally on
// first contribution and rides along on every measurement/café write as
// `contributor_user_id`. When the user later connects a Nimiq address (in the
// Nimiq Pay mini-app), the id is *promoted* to that address so the identity
// survives a device/browser change — the same trick web3 apps use to bind an
// anonymous session to a wallet.
//
// This module is intentionally NOT marked "use client": the pure validators
// are imported by server API routes, while all localStorage access is guarded
// behind `typeof window` checks. The React wrapper lives in
// hooks/use-contributor.ts.

const ID_KEY = "lattency:contributor-id";
const NAME_KEY = "lattency:contributor-name";
const REFERRED_BY_KEY = "lattency:referred-by";
const REFERRALS_KEY = "lattency:referrals";

/** An anonymous contributor id, e.g. `contrib-m2f8a1k-x9ab2c`. */
const ANON_ID_RE = /^contrib-[a-z0-9]{4,14}-[a-z0-9]{4,10}$/;

/** Generate a fresh anonymous contributor id. */
export function generateContributorId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `contrib-${Date.now().toString(36)}-${rand}`;
}

/** True for either an anonymous id or a Nimiq address (NQ-prefixed). */
export function isValidContributorId(id: string): boolean {
  if (!id || typeof id !== "string") return false;
  if (ANON_ID_RE.test(id)) return true;
  // Nimiq addresses: NQ + 38 alphanumerics (grouped, but we store ungrouped).
  return /^NQ[0-9A-Z]{38}$/.test(id.replace(/\s/g, ""));
}

/** True when the id is a promoted Nimiq address (identity is portable). */
export function isBoundContributorId(id: string): boolean {
  return /^NQ[0-9A-Z]{38}$/.test((id ?? "").replace(/\s/g, ""));
}

function read(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage full/blocked — the in-memory session still works.
  }
}

/** Read the persisted contributor id, minting one on first use. */
export function readContributorId(): string {
  const existing = read(ID_KEY);
  if (existing && isValidContributorId(existing)) return existing;
  const fresh = generateContributorId();
  write(ID_KEY, fresh);
  return fresh;
}

/** Replace the anonymous id with a Nimiq address (identity promotion). */
export function bindContributorToAddress(address: string): string {
  const clean = address.replace(/\s/g, "");
  if (!isBoundContributorId(clean)) return readContributorId();
  write(ID_KEY, clean);
  return clean;
}

/** The contributor's chosen display name, sanitized to <=24 chars. */
export function readContributorName(): string | null {
  return read(NAME_KEY);
}

export function writeContributorName(name: string): void {
  const clean = name.trim().slice(0, 24);
  if (clean) write(NAME_KEY, clean);
}

/**
 * Capture an inbound referral. First attribution wins: if this browser was
 * already referred (or is the referrer itself), we do not overwrite. Returns
 * true when a new attribution was recorded.
 */
export function captureReferral(via: string | null): boolean {
  if (!via || !isValidContributorId(via)) return false;
  if (via === readContributorId()) return false; // can't refer yourself
  if (read(REFERRED_BY_KEY)) return false; // first touch wins
  write(REFERRED_BY_KEY, via);
  // Credit the referrer on *their* device too, so /me can show the tally.
  const referrals = readReferrals();
  if (!referrals.includes(via)) {
    write(REFERRALS_KEY, JSON.stringify([...referrals, via]));
  }
  return true;
}

/** Who referred this browser (the `?via=` that was captured), if anyone. */
export function readReferredBy(): string | null {
  return read(REFERRED_BY_KEY);
}

/** Ids this device has referred out (via shared links). */
export function readReferrals(): string[] {
  const raw = read(REFERRALS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * A short public handle for leaderboards and share cards. Nimiq addresses are
 * abbreviated to first 4 + last 4; anonymous ids collapse to `#xxxx`. This is
 * what the server derives too, so the display is consistent everywhere.
 */
export function contributorHandle(id: string): string {
  if (isBoundContributorId(id)) {
    const clean = id.replace(/\s/g, "");
    return `${clean.slice(0, 4)}…${clean.slice(-4)}`;
  }
  const tail = (id.split("-").pop() ?? id).slice(-4);
  return `#${tail}`;
}
