// Rate-limiting for write endpoints (measurements, café creation, bounty
// creation). Fixed-window counters keyed by a SHA-256 hash of the client IP.
//
// Backend: Upstash Redis when UPSTASH_REDIS_REST_URL/TOKEN are set (shared
// across serverless instances, survives cold starts); otherwise an
// in-process Map (exact in single-instance dev, best-effort across
// instances). Both paths are fail-open — rate limiting is abuse protection,
// not a correctness boundary, so an infra hiccup must never block a real
// write.
//
// Privacy: we store a SHA-256 hash of the client IP, never the raw IP.
// The hash is one-way and is never returned by any API endpoint. It exists
// solely for the rate-limit comparison.

import { createHash } from "node:crypto";
import { log } from "./log";

/**
 * Hash a client IP address with SHA-256. Returns null if the IP is absent
 * (e.g. a local dev request with no proxy headers) — in that case the
 * rate-limit check is skipped (no IP to track).
 */
export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  const clean = ip.split(",")[0].trim();
  if (!clean) return null;
  return createHash("sha256").update(clean).digest("hex");
}

export type RateLimitScope =
  | { kind: "measurement"; cafeId: string }
  | { kind: "cafe" }
  | { kind: "bounty" };

const LIMITS: Record<RateLimitScope["kind"], { limit: number; windowMs: number }> = {
  // One reading per café per IP per 10 minutes.
  measurement: { limit: 1, windowMs: 10 * 60_000 },
  // One new café per IP per hour.
  cafe: { limit: 1, windowMs: 60 * 60_000 },
  // Sponsor bounties are funded client-side, so this is spam protection
  // for the board, not money protection.
  bounty: { limit: 5, windowMs: 60 * 60_000 },
};

interface RateLimitBackend {
  /** Increment the counter for `key` inside its current window. Returns
   *  the post-increment count. The window anchors at the first hit. */
  increment(key: string, windowMs: number): Promise<number>;
}

class InMemoryRateLimitBackend implements RateLimitBackend {
  private windows = new Map<string, { count: number; expiresAt: number }>();

  async increment(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    const existing = this.windows.get(key);
    if (!existing || existing.expiresAt <= now) {
      this.windows.set(key, { count: 1, expiresAt: now + windowMs });
      return 1;
    }
    existing.count += 1;
    return existing.count;
  }

  clear(): void {
    this.windows.clear();
  }
}

interface RedisEvalClient {
  eval<TResult>(
    script: string,
    keys: string[],
    args: (string | number)[],
  ): Promise<TResult>;
}

class RedisRateLimitBackend implements RateLimitBackend {
  constructor(
    private readonly client: RedisEvalClient,
    private readonly keyPrefix: string,
  ) {}

  async increment(key: string, windowMs: number): Promise<number> {
    // INCR + PEXPIRE on first hit, atomic via Lua so the window can't
    // drift between the two commands.
    return this.client.eval<number>(
      `local c = redis.call("INCR", KEYS[1])
       if c == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[1]) end
       return c`,
      [this.keyPrefix + key],
      [windowMs],
    );
  }
}

async function createBackend(): Promise<RateLimitBackend> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const forceRedis = process.env.UPSTASH_REDIS_REST_FORCE === "1";

  // Never accidentally use Redis in test mode unless explicitly forced.
  if (!forceRedis && process.env.NODE_ENV === "test") {
    return new InMemoryRateLimitBackend();
  }

  if (url && token) {
    try {
      const { Redis } = await import("@upstash/redis");
      const prefix = process.env.UPSTASH_REDIS_KEY_PREFIX;
      return new RedisRateLimitBackend(
        Redis.fromEnv(),
        prefix ? `${prefix}:` : "",
      );
    } catch (err) {
      log.warn("rate-limit: Redis init failed, using in-memory backend", {
        scope: "rateLimit",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return new InMemoryRateLimitBackend();
}

let backendPromise: Promise<RateLimitBackend> | undefined;

function getBackend(): Promise<RateLimitBackend> {
  if (!backendPromise) backendPromise = createBackend();
  return backendPromise;
}

/**
 * Checks whether an action from this IP is allowed under the rate limit.
 * Returns true if allowed, false if rate-limited.
 *
 * When ipHash is null (no IP available), always returns true — we can't
 * rate-limit without an identifier, and blocking would break local dev.
 * Fails open on backend errors for the same reason.
 */
export async function checkRateLimit(
  ipHash: string | null,
  scope: RateLimitScope,
): Promise<boolean> {
  if (!ipHash) return true;

  const { limit, windowMs } = LIMITS[scope.kind];
  const key =
    scope.kind === "measurement"
      ? `rl:m:${scope.cafeId}:${ipHash}`
      : `rl:${scope.kind}:${ipHash}`;

  try {
    const count = await (await getBackend()).increment(key, windowMs);
    return count <= limit;
  } catch (err) {
    log.warn("rate-limit check failed; allowing write", {
      scope: "rateLimit",
      reason: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
}

/** Reset the in-memory backend between tests. Exported only for tests. */
export async function __resetRateLimitForTests(): Promise<void> {
  const backend = await getBackend();
  if (backend instanceof InMemoryRateLimitBackend) backend.clear();
}
