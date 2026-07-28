"use client";

// LiveNetworkBadge — a quiet "the network is on" signal. The whole map can
// look like a beautiful static illustration; this one pulsing dot tells a
// reviewer (and a returning user) that real venues are mapped against a live
// backend, not a frozen demo.
//
// It only renders when the Base44 app id is configured AND a live station
// count comes back from the API. If either fails it stays hidden — a dead
// badge would be worse than none. On the very first successful connect in a
// session it pulses once to celebrate the handshake, then settles into a
// soft steady heartbeat.

import { useEffect, useRef, useState } from "react";

function configured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_BASE44_APP_ID);
}

export function LiveNetworkBadge({
  variant = "map",
}: {
  variant?: "map" | "nav";
}) {
  const [count, setCount] = useState<number | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const asked = useRef(false);

  useEffect(() => {
    if (!configured() || asked.current) return;
    asked.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/cafes", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { count?: number; live?: boolean };
        if (
          cancelled ||
          !data.live ||
          typeof data.count !== "number" ||
          data.count === 0
        )
          return;
        setCount(data.count);
        // Celebrate once per session: the first time we confirm a live
        // handshake. sessionStorage keeps it from re-pulsing every nav.
        try {
          if (!sessionStorage.getItem("lattency:live-seen")) {
            sessionStorage.setItem("lattency:live-seen", "1");
            setCelebrate(true);
          }
        } catch {
          setCelebrate(true);
        }
      } catch {
        /* stay hidden on any error */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (count === null) return null;

  const pulseClass = celebrate ? "live-celebrate" : "";

  if (variant === "nav") {
    return (
      <span
        className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.22em] uppercase text-express"
        title={`${count} live stations on the network`}
      >
        <span
          aria-hidden
          className={`live-dot ${pulseClass}`}
        />
        Live
      </span>
    );
  }

  return (
    <div
      className={`live-stamp ${pulseClass}`}
      title={`${count} live stations on the network`}
    >
      <span aria-hidden className="live-dot" />
      <span>Live</span>
      <span className="text-ink-faint">·</span>
      <span className="tabular-nums">{count}</span>
      <span className="text-ink-faint normal-case">stations</span>
    </div>
  );
}
