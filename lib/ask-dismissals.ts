// Ask-card dismissal persistence — localStorage with a 7-day decay.
// "Dismissals decay; nothing is permanently hidden except completed asks"
// (docs/adaptive-ux-principles.md). Keys follow the `lattency:` convention
// used by the trail and check-in stores. All storage access is guarded so
// the module stays importable from server components and node tests.

import type { VenueNeed } from "./venue-needs";

const KEY_PREFIX = "lattency:ask-dismissed:";

export const ASK_DISMISSAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function askDismissalKey(cafeId: string, need: VenueNeed): string {
  return `${KEY_PREFIX}${cafeId}:${need}`;
}

/** Pure TTL check — a dismissal holds while it sits inside the 7-day
 *  window, then the ask resurfaces. Future timestamps don't count. */
export function dismissalActive(dismissedAt: number, now: number): boolean {
  const age = now - dismissedAt;
  return age >= 0 && age < ASK_DISMISSAL_TTL_MS;
}

function storageGet(key: string): string | null {
  try {
    return typeof localStorage === "undefined"
      ? null
      : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {
    /* non-fatal — the ask just resurfaces next visit */
  }
}

export function readDismissedAt(cafeId: string, need: VenueNeed): number | null {
  const raw = storageGet(askDismissalKey(cafeId, need));
  if (!raw) return null;
  const ts = Number(raw);
  return Number.isFinite(ts) ? ts : null;
}

export function isAskDismissed(
  cafeId: string,
  need: VenueNeed,
  now: number = Date.now(),
): boolean {
  const ts = readDismissedAt(cafeId, need);
  return ts !== null && dismissalActive(ts, now);
}

export function dismissAsk(
  cafeId: string,
  need: VenueNeed,
  now: number = Date.now(),
): void {
  storageSet(askDismissalKey(cafeId, need), String(now));
}
