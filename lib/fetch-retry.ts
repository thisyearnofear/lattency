// Tiny single-retry wrapper around fetch for write endpoints. Used by
// the contribution form + the measurement form so a transient network
// hiccup doesn't blow away 30 seconds of user effort. Only retries on
// network errors (no Response received) and 502/503/504 — never on
// 4xx, which mean the server intentionally rejected the request.
//
// Retries once, after a 2 second backoff with ±20% jitter. The total
// added latency at worst is ~2.4 seconds, which is acceptable for the
// write path; for read paths use vanilla fetch with SWR/RSC caching.

export async function postWithRetry(
  url: string,
  init: RequestInit & { method?: "POST" | "PUT" | "PATCH" },
): Promise<Response> {
  // Force a method if the caller forgot.
  const opts: RequestInit = { ...init, method: init.method ?? "POST" };

  try {
    const response = await fetch(url, opts);
    if (!isTransientFailure(response.status)) return response;
    await wait(backoffMs());
    return await fetch(url, opts);
  } catch (err) {
    // Network-level error (offline, DNS, connection refused, abort).
    if (init.signal?.aborted) throw err;
    await wait(backoffMs());
    return await fetch(url, opts);
  }
}

function isTransientFailure(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

function backoffMs(): number {
  const base = 2000;
  const jitter = (Math.random() - 0.5) * 0.4 * base;
  return Math.max(500, Math.round(base + jitter));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
