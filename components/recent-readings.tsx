"use client";

import { useSyncExternalStore } from "react";
import type { CafeDetail } from "@/lib/types";

// Formats the gap between `from` (a measurement timestamp) and `now` as a
// short human label. Tuned to read like a transit board: "now" / "4m" /
// "27m" / "3h" / "19h" / "2d". We never go finer than minutes — the
// underlying timestamps are minute-precision on the demo path.
function formatAgo(fromIso: string, now: number): string {
  const then = new Date(fromIso).getTime();
  const deltaSec = Math.max(0, Math.round((now - then) / 1000));
  if (deltaSec < 45) return "just now";
  const min = Math.round(deltaSec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

// Stable HH:MM rendering used during SSR so React doesn't see a different
// string on hydration. The instant the client mounts, we swap to relative
// labels and start a 30-second tick.
function formatClock(fromIso: string): string {
  const d = new Date(fromIso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// External store: a single global ticker that emits "now" each time it
// changes (second-resolution snapshot, refreshed every 30s). Subscribing
// through `useSyncExternalStore` gives us:
//   - a `null` server snapshot → SSR renders absolute HH:MM
//   - a numeric client snapshot → after hydration we switch to relative "ago"
// without the cascading-render warning that synchronous setState in
// useEffect would trigger.
const tickSubscribers = new Set<() => void>();
let tickInterval: ReturnType<typeof setInterval> | null = null;

function subscribeToNow(notify: () => void): () => void {
  tickSubscribers.add(notify);
  if (tickInterval === null) {
    tickInterval = setInterval(() => {
      tickSubscribers.forEach((fn) => fn());
    }, 30_000);
  }
  return () => {
    tickSubscribers.delete(notify);
    if (tickSubscribers.size === 0 && tickInterval !== null) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
  };
}

function getNowClient(): number {
  // Round to seconds so identical concurrent subscribers get the same
  // snapshot value and React skips unnecessary re-renders.
  return Math.floor(Date.now() / 1000);
}

function getNowServer(): null {
  return null;
}

export function RecentReadings({
  readings,
}: {
  readings: CafeDetail["recent"];
}) {
  const nowSec = useSyncExternalStore(subscribeToNow, getNowClient, getNowServer);
  const now = nowSec === null ? null : nowSec * 1000;

  if (!readings || readings.length === 0) return null;

  return (
    <div>
      <p className="stamp">Last brewed here</p>
      <ol className="mt-3 space-y-1.5">
        {readings.map((r, i) => {
          const label =
            now === null ? formatClock(r.measuredAt) : formatAgo(r.measuredAt, now);
          const isLatest = i === 0;
          return (
            <li
              key={`${r.measuredAt}-${i}`}
              className={`flex items-baseline justify-between gap-3 font-mono text-[11px] ${
                isLatest ? "text-ink" : "text-ink-soft"
              }`}
            >
              <span className="flex items-baseline gap-2">
                <span
                  aria-hidden
                  className={isLatest ? "text-express" : "text-ink-faint"}
                >
                  ☕
                </span>
                <span className="tabular-nums">
                  {Math.round(r.downMbps)}{" "}
                  <span className="text-[9px] tracking-[0.18em] uppercase text-ink-faint">
                    Mbps
                  </span>
                </span>
              </span>
              <span
                className={`tracking-[0.14em] uppercase text-[10px] tabular-nums ${
                  isLatest ? "text-ink" : "text-ink-faint"
                }`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
