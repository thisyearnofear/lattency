import type { RedisLikeClient } from "@/lib/bounty-state-kv";
import { EXTEND_SCRIPT, RELEASE_SCRIPT } from "@/lib/bounty-state-kv";

export class MockRedisClient implements RedisLikeClient {
  private store = new Map<string, string>();
  private sets = new Map<string, Set<string>>();

  async set(
    key: string,
    value: string,
    opts?: { nx?: boolean; ex?: number },
  ): Promise<string | null> {
    if (opts?.nx && this.store.has(key)) return null;
    this.store.set(key, value);
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      const wasInStore = this.store.delete(key);
      const wasInSet = this.sets.delete(key);
      if (wasInStore || wasInSet) deleted++;
    }
    return deleted;
  }

  async eval<TResult>(
    script: string,
    keys: string[],
    args: (string | number)[],
  ): Promise<TResult> {
    const key = keys[0];
    const stored = this.store.get(key);
    const token = String(args[0]);
    if (stored !== token) return 0 as unknown as TResult;

    if (script === EXTEND_SCRIPT) {
      return 1 as unknown as TResult;
    }
    if (script === RELEASE_SCRIPT) {
      this.store.delete(key);
      return 1 as unknown as TResult;
    }
    throw new Error("Unknown Lua script in mock eval");
  }

  async sadd(key: string, value: string): Promise<number> {
    let set = this.sets.get(key);
    if (!set) {
      set = new Set();
      this.sets.set(key, set);
    }
    if (set.has(value)) return 0;
    set.add(value);
    return 1;
  }

  async smembers(key: string): Promise<string[]> {
    return Array.from(this.sets.get(key) ?? []);
  }

  // Only trailing-wildcard patterns are needed for resetForTests.
  async keys(pattern: string): Promise<string[]> {
    const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : pattern;
    return Array.from(this.store.keys()).filter((k) => k.startsWith(prefix));
  }

  getStore(): Map<string, string> {
    return this.store;
  }

  getSets(): Map<string, Set<string>> {
    return this.sets;
  }
}
