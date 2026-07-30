// Redis-backed BountyState implementation using Upstash Redis.
// Designed for Vercel/Upstash Redis (the successor to Vercel KV). Falls back
// to the in-memory implementation when no Redis URL is configured.

import type { BountyState, ClaimLockOptions } from "./bounty-state";
import { Redis } from "@upstash/redis";
import { generateLeaseToken } from "./bounty-token";

/** Default lock lease duration if the caller does not specify one. */
const DEFAULT_LOCK_TTL_MS = 60_000;

/** Minimal subset of the Upstash/Redis client interface we need. This keeps
 *  tests and alternative clients easy to inject. */
export interface RedisLikeClient {
  set(
    key: string,
    value: string,
    opts?: { nx?: boolean; ex?: number },
  ): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  eval<TResult>(
    script: string,
    keys: string[],
    args: (string | number)[],
  ): Promise<TResult>;
  sadd(key: string, value: string): Promise<number>;
  smembers(key: string): Promise<string[]>;
  keys(pattern: string): Promise<string[]>;
}

export class RedisBountyState implements BountyState {
  private readonly keyPrefix: string;
  private readonly paidKey: string;

  constructor(
    private readonly redis: RedisLikeClient,
    keyPrefix?: string,
  ) {
    this.keyPrefix =
      keyPrefix ??
      ((typeof process !== "undefined"
        ? process.env.UPSTASH_REDIS_KEY_PREFIX
        : undefined) ?? "");
    this.paidKey = this.prefixedKey("bounty:paid");
  }

  private prefixedKey(key: string): string {
    return this.keyPrefix ? `${this.keyPrefix}:${key}` : key;
  }

  private lockKey(bountyId: string): string {
    return this.prefixedKey(`bounty:lock:${bountyId}`);
  }

  async markPaid(bountyId: string): Promise<void> {
    await this.redis.sadd(this.paidKey, bountyId);
  }

  async getPaidBounties(): Promise<string[]> {
    return this.redis.smembers(this.paidKey);
  }

  async tryAcquireClaimLock(
    bountyId: string,
    options?: ClaimLockOptions,
  ): Promise<string | null> {
    const ttlMs = options?.ttlMs ?? DEFAULT_LOCK_TTL_MS;
    const token = generateLeaseToken();
    // SET NX EX: set only if the key does not exist, with an expiration.
    const result = await this.redis.set(this.lockKey(bountyId), token, {
      nx: true,
      ex: Math.ceil(ttlMs / 1000),
    });
    if (result !== "OK") {
      return null;
    }
    return token;
  }

  async releaseClaimLock(bountyId: string, token: string): Promise<boolean> {
    const deleted = await this.redis.eval<number>(
      RELEASE_SCRIPT,
      [this.lockKey(bountyId)],
      [token],
    );
    return deleted === 1;
  }

  async extendClaimLock(
    bountyId: string,
    token: string,
    options?: ClaimLockOptions,
  ): Promise<boolean> {
    const ttlMs = options?.ttlMs ?? DEFAULT_LOCK_TTL_MS;
    const extended = await this.redis.eval<number>(
      EXTEND_SCRIPT,
      [this.lockKey(bountyId)],
      [token, Math.ceil(ttlMs / 1000)],
    );
    return extended === 1;
  }

  async resetForTests(): Promise<void> {
    // Clean up any locks and the paid set under this key prefix. This is
    // intended for tests that run with UPSTASH_REDIS_REST_FORCE=1 against a
    // dedicated test database or prefix.
    const lockPattern = this.lockKey("*");
    const lockKeys = await this.redis.keys(lockPattern);
    if (lockKeys.length > 0) {
      await this.redis.del(...lockKeys);
    }
    await this.redis.del(this.paidKey);
  }
}

/** Redis Lua scripts. They execute atomically on the server, which gives us
 *  compare-and-swap semantics for release and extension. */
export const RELEASE_SCRIPT = `
  local key = KEYS[1]
  local token = ARGV[1]
  if redis.call("GET", key) == token then
    return redis.call("DEL", key)
  end
  return 0
`;

export const EXTEND_SCRIPT = `
  local key = KEYS[1]
  local token = ARGV[1]
  local ttlSeconds = tonumber(ARGV[2])
  if redis.call("GET", key) == token then
    return redis.call("EXPIRE", key, ttlSeconds)
  end
  return 0
`;

/** Thin adapter that exposes only the Redis operations BountyState needs.
 *  Wrapping the Upstash client gives compile-time safety and keeps the
 *  domain interface decoupled from the third-party library's API. */
export class UpstashRedisAdapter implements RedisLikeClient {
  constructor(private readonly client: Redis) {}

  async set(
    key: string,
    value: string,
    opts?: { nx?: boolean; ex?: number },
  ): Promise<string | null> {
    // The Upstash typed client does not expose NX in set options. Use a Lua
    // script so SET NX EX stays atomic, matching the MockRedisClient
    // behaviour and keeping claim locks safe from partial writes.
    if (opts?.nx) {
      const result = await this.client.eval(
        `return redis.call("SET", KEYS[1], ARGV[1], "NX", "EX", ARGV[2])`,
        [key],
        [value, opts.ex ?? 60],
      );
      return result === null ? null : "OK";
    }

    if (opts?.ex) {
      return this.client.set(key, value, { ex: opts.ex });
    }
    return this.client.set(key, value);
  }

  del(...keys: string[]): Promise<number> {
    return this.client.del(...keys);
  }

  eval<TResult>(script: string, keys: string[], args: (string | number)[]): Promise<TResult> {
    return this.client.eval(script, keys, args) as Promise<TResult>;
  }

  sadd(key: string, value: string): Promise<number> {
    return this.client.sadd(key, value);
  }

  smembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }

  keys(pattern: string): Promise<string[]> {
    return this.client.keys(pattern);
  }
}

/** Create an Upstash Redis-backed BountyState from environment variables.
 *  Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN. */
export function createUpstashBountyState(): BountyState {
  const redis = Redis.fromEnv();
  return new RedisBountyState(new UpstashRedisAdapter(redis));
}
