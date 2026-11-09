"use client";

// If the visitor is far from every curated board, nudge them to open
// their own city instead of staring at London empty-handed.
//
// Geolocation policy: the browser prompt fires ONLY from an explicit tap on
// "Is there a board near me?" — never on mount. Previously a useEffect
// requested the position on first paint, so a permission prompt popped
// before the user had touched anything. The idle state now shows a quiet
// button; the near/far verdict renders only after the user asks for it.

import { useState } from "react";
import Link from "next/link";
import { cityPath } from "@/lib/cities";
import { shouldRequestGeolocation } from "@/lib/geo";
import { nearbyBoardHint, type NearbyBoardHint } from "@/lib/nearby-board";

type LocateStatus = "idle" | "pending" | "error";

export function NearYouCityNudge({ currentCity }: { currentCity: string }) {
  const [hint, setHint] = useState<NearbyBoardHint>(null);
  const [status, setStatus] = useState<LocateStatus>("idle");
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem("lattency:near-nudge-dismissed") === "1";
    } catch {
      return false;
    }
  });

  // Called only from click handlers — see shouldRequestGeolocation.
  function locate() {
    if (!shouldRequestGeolocation("user-gesture")) return;
    if (typeof window === "undefined" || !navigator.geolocation) {
      setStatus("error");
      return;
    }
    setStatus("pending");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setHint(
          nearbyBoardHint(
            pos.coords.latitude,
            pos.coords.longitude,
            currentCity,
          ),
        );
        setStatus("idle");
      },
      () => setStatus("error"),
      { enableHighAccuracy: false, maximumAge: 600_000, timeout: 8_000 },
    );
  }

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem("lattency:near-nudge-dismissed", "1");
    } catch {
      /* ignore */
    }
  }

  if (dismissed) return null;

  if (hint?.kind === "near") {
    return (
      <div className="mt-3 border border-ink/25 bg-cream px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <p className="font-serif italic text-sm text-ink-soft">
          Looks like you&rsquo;re near{" "}
          <span className="text-ink not-italic font-display font-black uppercase tracking-tight">
            {hint.cityName}
          </span>{" "}
          ({Math.round(hint.km)} km).
        </p>
        <div className="flex items-center gap-2">
          <Link
            href={cityPath(hint.cityId)}
            className="font-mono text-[10px] tracking-[0.2em] uppercase text-express hover:text-ink"
          >
            Switch →
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-faint hover:text-ink"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  if (hint?.kind === "far") {
    return (
      <div className="mt-3 border border-dashed border-ink/40 bg-cream-edge/50 px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="stamp">Not in a live city?</p>
            <p className="font-serif italic text-sm text-ink-soft mt-1">
              You&rsquo;re outside London, Nairobi, and SF. Open your own board —
              the first reading draws the line.
            </p>
            <Link
              href="#open-city"
              className="inline-block font-mono text-[10px] tracking-[0.2em] uppercase text-express hover:text-ink mt-2"
            >
              Map my city →
            </Link>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-faint hover:text-ink shrink-0"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  // No fix yet — the quiet opt-in. The location prompt fires only when this
  // button is tapped; a failure shows an inline error with a retry, never a
  // dead end.
  return (
    <div className="mt-3 border border-dashed border-ink/30 bg-cream px-3 py-2.5">
      {status === "error" ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-soft">
            Could not get location.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={locate}
              className="font-mono text-[10px] tracking-[0.2em] uppercase text-express hover:text-ink"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-faint hover:text-ink"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={locate}
          disabled={status === "pending"}
          aria-label="Find the live board nearest to you"
          className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-soft hover:text-ink disabled:opacity-60 transition-colors"
        >
          {status === "pending"
            ? "Locating…"
            : "◎ Is there a board near me?"}
        </button>
      )}
    </div>
  );
}
