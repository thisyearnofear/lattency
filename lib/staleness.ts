// Staleness utility — derives a visual freshness state from the last reading
// timestamp. Stations fade after 14 days and go "stale" after 30, creating
// organic urgency for contributors to re-test and keeping the map honest.

export type StalenessLevel = "fresh" | "aging" | "stale" | "unknown";

const FRESH_DAYS = 7;
const AGING_DAYS = 14;

export function daysSince(iso: string | undefined): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

export function stalenessLevel(lastReadingAt?: string): StalenessLevel {
  const days = daysSince(lastReadingAt);
  if (days === null) return "unknown";
  if (days <= FRESH_DAYS) return "fresh";
  if (days <= AGING_DAYS) return "aging";
  return "stale";
}

export function stalenessOpacity(lastReadingAt?: string): number {
  const level = stalenessLevel(lastReadingAt);
  switch (level) {
    case "fresh": return 1;
    case "aging": return 0.65;
    case "stale": return 0.4;
    case "unknown": return 1;
  }
}

export function stalenessLabel(lastReadingAt?: string): string | null {
  const days = daysSince(lastReadingAt);
  if (days === null) return null;
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export function needsFreshTest(lastReadingAt?: string): boolean {
  const days = daysSince(lastReadingAt);
  if (days === null) return false;
  return days > AGING_DAYS;
}
