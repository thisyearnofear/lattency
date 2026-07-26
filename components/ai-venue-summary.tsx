"use client";

// "The Oracle's Take" — an editorial pull-quote summarising a venue, drawn
// from its verified speed data by Base44's built-in InvokeLLM integration
// (via the generate-venue-summary function). It loads automatically when a
// venue opens, is cached on the venue, and reads like a line of copy from
// the concierge rather than an AI feature. No sparkle, no "Generate" chrome.

import { useCallback, useEffect, useState } from "react";
import { base44Configured, getBase44 } from "@/lib/base44";

function unwrap(res: unknown): string {
  const r = res as { data?: { summary?: string }; summary?: string } | null;
  return r?.data?.summary ?? r?.summary ?? "";
}

type State = "loading" | "ready" | "error";

export function AiVenueSummary({
  cafeId,
  measurementCount,
}: {
  cafeId: string;
  measurementCount: number;
}) {
  const [summary, setSummary] = useState<string | null>(null);
  const [state, setState] = useState<State>("loading");

  const reask = useCallback(async () => {
    setState("loading");
    try {
      const res = await getBase44().functions.invoke("generate-venue-summary", {
        cafe_id: cafeId,
        regenerate: true,
      });
      const text = unwrap(res);
      setSummary(text);
      setState(text ? "ready" : "error");
    } catch {
      setState("error");
    }
  }, [cafeId]);

  // Auto-load once when the venue opens (cached, so near-instant). Mirrors
  // the café-detail hydrate pattern: fetch inside an async IIFE, only touch
  // state after the await resolves.
  useEffect(() => {
    if (!base44Configured) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await getBase44().functions.invoke("generate-venue-summary", {
          cafe_id: cafeId,
          regenerate: false,
        });
        const text = unwrap(res);
        if (!cancelled) {
          setSummary(text);
          setState(text ? "ready" : "error");
        }
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cafeId]);

  if (!base44Configured) return null;

  return (
    <div className="relative mt-4 border border-ink/15 bg-cream-edge/40 pl-4 pr-3 py-3">
      <span className="absolute bottom-0 left-0 top-0 w-[3px] bg-express" aria-hidden />

      <div className="flex items-center justify-between gap-2">
        <p className="stamp text-ink-faint">
          The oracle&rsquo;s take
          <span className="text-ink-faint/60"> · from verified data</span>
        </p>
        {state === "ready" && (
          <button
            type="button"
            onClick={() => void reask()}
            className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint transition-colors hover:text-ink"
            aria-label="Ask the oracle again"
          >
            re-ask
          </button>
        )}
      </div>

      {state === "loading" && (
        <p className="mt-2 font-serif italic leading-snug text-ink-faint text-[15px]">
          Reading the network
          <span className="think-dot ml-1 not-italic align-middle">■</span>
          <span className="think-dot not-italic align-middle">■</span>
          <span className="think-dot not-italic align-middle">■</span>
        </p>
      )}

      {state === "ready" && summary && (
        <p className="msg-in mt-2 font-serif italic leading-snug text-ink text-[16px]">
          &ldquo;{summary}&rdquo;
        </p>
      )}

      {state === "error" && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
          The oracle is quiet right now ·{" "}
          <button
            type="button"
            onClick={() => void reask()}
            className="underline underline-offset-2 transition-colors hover:text-ink"
          >
            try again
          </button>
        </p>
      )}

      {state === "ready" && measurementCount > 0 && (
        <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
          drawn from {measurementCount} verified reading{measurementCount === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}
