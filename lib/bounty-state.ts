// Small abstraction over the durable state needed for bounty operations.
// Currently backed by in-memory Sets; later implementations can swap in
// Redis, Vercel KV, Base44 entities, etc. without touching callers.
// The Redis implementation is loaded lazily so the dependency is only
// pulled in when the environment variables are configured.

import { generateLeaseToken } from "./bounty-token";

export interface ClaimLockOptions {
  /** Maximum time the lock may be held before it is automatically
   *  released. Defaults to 60 seconds. */
  ttlMs: number;
}

export interface BountyState {
  /** Record a bounty as paid. */
  markPaid(bountyId: string): Promise<void>;
  /** Return all bounty ids currently marked as paid. */
  getPaidBounties(): Promise<string[]>;

  /** Try to acquire an exclusive claim lock. Returns a lease token when
   *  the lock is acquired, or null if it is already held and its lease
   *  has not yet expired.
   *
   *  Implementations may treat an expired lock as available and allow a
   *  new caller to take it over. Durable backends should implement this
   *  as an atomic compare-and-swap to avoid two callers acquiring the
   *  same lock simultaneously. */
  tryAcquireClaimLock(
    bountyId: string,
    options?: ClaimLockOptions,
  ): Promise<string | null>;
  /** Release an exclusive claim lock. The caller must supply the lease
   *  token returned by {@link tryAcquireClaimLock}. Returns true when the
   *  lock was held by the supplied token and has been released. */
  releaseClaimLock(bountyId: string, token: string): Promise<boolean>;
  /** Extend the lease of an existing claim lock. Returns true when the
   *  lock exists, has not expired, and the supplied lease token is the
   *  current owner; false otherwise.
   *
   *  Durable backends should implement this as an atomic compare-and-swap
   *  so an extension cannot overwrite a lock that has been acquired by
   *  another caller. */
  extendClaimLock(
    bountyId: string,
    token: string,
    options?: ClaimLockOptions,
  ): Promise<boolean>;

  /** Reset in-process state. Intended for tests only. */
  resetForTests(): Promise<void>;
}

/** Default lock lease duration if the caller does not specify one. */
export const DEFAULT_LOCK_TTL_MS = 60_000;

/** TTL used when the claim route acquires a lock. Payouts can take a
 *  while, so this is generous. */
export const CLAIM_LOCK_TTL_MS = 300_000;

export class InMemoryBountyState implements BountyState {
  private paid = new Set<string>();
  private claiming = new Map<string, { expiresAt: number; token: string }>();

  async markPaid(bountyId: string): Promise<void> {
    this.paid.add(bountyId);
  }

  async getPaidBounties(): Promise<string[]> {
    return Array.from(this.paid);
  }

  async tryAcquireClaimLock(
    bountyId: string,
    options?: ClaimLockOptions,
  ): Promise<string | null> {
    const ttlMs = options?.ttlMs ?? DEFAULT_LOCK_TTL_MS;
    const now = Date.now();
    const existing = this.claiming.get(bountyId);
    if (existing && existing.expiresAt > now) {
      return null;
    }
    const token = generateLeaseToken();
    this.claiming.set(bountyId, { expiresAt: now + ttlMs, token });
    return token;
  }

  async releaseClaimLock(bountyId: string, token: string): Promise<boolean> {
    const existing = this.claiming.get(bountyId);
    if (existing && existing.token === token) {
      this.claiming.delete(bountyId);
      return true;
    }
    return false;
  }

  async extendClaimLock(
    bountyId: string,
    token: string,
    options?: ClaimLockOptions,
  ): Promise<boolean> {
    const ttlMs = options?.ttlMs ?? DEFAULT_LOCK_TTL_MS;
    const now = Date.now();
    const existing = this.claiming.get(bountyId);
    if (!existing || existing.expiresAt < now || existing.token !== token) {
      return false;
    }
    this.claiming.set(bountyId, { expiresAt: now + ttlMs, token });
    return true;
  }

  async resetForTests(): Promise<void> {
    this.paid.clear();
    this.claiming.clear();
  }
}

/** Factory for the active state implementation. Defaults to in-memory.
 *  When Upstash Redis environment variables are present, loads the
 *  Redis-backed store dynamically so state survives serverless cold starts
 *  and is shared across instances. */
export async function createBountyState(): Promise<BountyState> {
  try {
    const url = typeof process !== "undefined" ? process.env.UPSTASH_REDIS_REST_URL : undefined;
    const token = typeof process !== "undefined" ? process.env.UPSTASH_REDIS_REST_TOKEN : undefined;
    const forceRedis = typeof process !== "undefined" ? process.env.UPSTASH_REDIS_REST_FORCE === "1" : false;

    // Never accidentally use Redis in test mode unless explicitly forced.
    if (!forceRedis && typeof process !== "undefined" && process.env.NODE_ENV === "test") {
      return new InMemoryBountyState();
    }

    if (url && token) {
      const { createUpstashBountyState } = await import("./bounty-state-kv");
      return createUpstashBountyState();
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn("bounty-state: failed to create Redis-backed state, falling back to in-memory", { reason });
  }
  return new InMemoryBountyState();
}

let activeStatePromise: Promise<BountyState> | undefined;

/** Replace the active state implementation, e.g., with a Redis or Base44
 *  backed store. */
export function setBountyState(state: BountyState): void {
  activeStatePromise = Promise.resolve(state);
}

/** Get the currently active state implementation. Lazily creates the state
 *  on first access so environment detection is deferred until the module is
 *  actually used. */
export function getBountyState(): Promise<BountyState> {
  if (!activeStatePromise) {
    activeStatePromise = createBountyState();
  }
  return activeStatePromise;
}

/** Singleton instance used by callers. Backed by the active implementation,
 *  which can be swapped with {@link setBountyState}. */
export const bountyState: BountyState = {
  markPaid: async (bountyId) => (await getBountyState()).markPaid(bountyId),
  getPaidBounties: async () => (await getBountyState()).getPaidBounties(),
  tryAcquireClaimLock: async (bountyId, options) =>
    (await getBountyState()).tryAcquireClaimLock(bountyId, options),
  releaseClaimLock: async (bountyId, token) =>
    (await getBountyState()).releaseClaimLock(bountyId, token),
  extendClaimLock: async (bountyId, token, options) =>
    (await getBountyState()).extendClaimLock(bountyId, token, options),
  resetForTests: async () => (await getBountyState()).resetForTests(),
};
