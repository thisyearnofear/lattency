"use client";

// NotificationInbox — the re-engagement surface. Polls /api/notifications for
// the contributor's open loops (stale stations from their own trail, bounties
// expiring soon, claimable bounties) and surfaces them as a bell with a
// count + dropdown. This is the "pull back tomorrow" trigger that turns
// staleness decay and bounty expiry into an actual reason to return.
//
// No email/push infra: it's a lightweight in-app inbox. When there's nothing
// actionable the bell is quiet (no dot), so it never becomes noise.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { AppNotification } from "@/lib/notifications";

const STORAGE_KEY = "lattency:trail:v1";

function readTrailNames(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const trail = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<
      string,
      Array<{ name: string }>
    >;
    const names: string[] = [];
    for (const list of Object.values(trail)) {
      for (const s of list) names.push(s.name);
    }
    return names;
  } catch {
    return [];
  }
}

const KIND_GLYPH: Record<AppNotification["kind"], string> = {
  "bounty-claimable": "$",
  "bounty-expiring": "◷",
  "stale-station": "▽",
};
const KIND_COLOUR: Record<AppNotification["kind"], string> = {
  "bounty-claimable": "var(--color-express)",
  "bounty-expiring": "var(--color-local)",
  "stale-station": "var(--color-suspended)",
};

export function NotificationInbox({ city }: { city: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const names = readTrailNames();
      const params = new URLSearchParams();
      if (city) params.set("city", city);
      if (names.length > 0) params.set("names", names.join(","));
      try {
        const res = await fetch(`/api/notifications?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { notifications: AppNotification[] };
        if (!cancelled) setItems(data.notifications ?? []);
      } catch {
        // Quiet failure — the inbox just stays empty.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    void poll();
    const interval = setInterval(() => void poll(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [city]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const count = items.length;
  // Until we've loaded at least once, render nothing — avoids a flash of an
  // empty bell that then pops a count in.
  if (!loaded) return null;

  return (
    <div ref={wrapRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={count > 0 ? `${count} notifications` : "Notifications"}
        aria-expanded={open}
        className="relative text-ink-soft hover:text-ink transition-colors leading-none px-1"
      >
        <span aria-hidden className="text-[13px]">✉</span>
        {count > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-0.5 grid place-items-center bg-express text-cream font-mono text-[8px] leading-none">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[300px] max-w-[86vw] bg-cream border border-ink shadow-[4px_5px_0_0_var(--color-ink)] z-50">
          <div className="px-3.5 py-2.5 border-b border-ink/15">
            <p className="stamp">On your line</p>
          </div>

          {count === 0 ? (
            <p className="px-3.5 py-5 font-serif italic text-ink-faint text-sm">
              All quiet. Your stations are fresh and no bounties are closing.
            </p>
          ) : (
            <ul className="max-h-[340px] overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className="flex gap-3 px-3.5 py-3 border-b border-ink/10 last:border-b-0 hover:bg-cream-edge/50 transition-colors"
                  >
                    <span
                      aria-hidden
                      className="shrink-0 w-6 h-6 grid place-items-center text-cream font-display font-black text-xs mt-0.5"
                      style={{ background: KIND_COLOUR[n.kind] }}
                    >
                      {KIND_GLYPH[n.kind]}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-display font-black uppercase text-ink text-[15px] leading-tight">
                        {n.title}
                      </span>
                      <span className="block font-serif italic text-ink-soft text-[13px] leading-snug mt-0.5">
                        {n.body}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
