"use client";

// One ask card per venue surface — the shipped tranche of the adaptive ask
// layer (docs/adaptive-ux-principles.md). The chrome never moves; the card
// asks for the next most-scarce un-answered need, rendered as
// `{time cost} · {the gap} · {the payoff}`. Dismissal decays after 7 days
// (lib/ask-dismissals.ts); completed asks simply stop being needs.

import { useEffect, useState } from "react";
import type { CafeStation } from "@/lib/types";
import { nextAsk, VENUE_NEED_ORDER, type VenueNeed } from "@/lib/venue-needs";
import { dismissAsk, isAskDismissed } from "@/lib/ask-dismissals";
import { venueCaptureUiCityAllowed } from "@/lib/venue-capture-policy";
import type { PublicVenueScan } from "@/lib/venue-scan-types";
import { slugify } from "@/lib/slug";
import { useMatchMedia } from "@/hooks/use-match-media";
import { VTLink } from "./vt-link";
import { VenueFactSheet } from "./venue-fact-sheet";
import { VenuePhotoSheet } from "./venue-photo-sheet";

const CAPTURE_UI_ENABLED = process.env.NEXT_PUBLIC_VENUE_CAPTURE_ENABLED === "1";

const CTA_LABEL: Record<VenueNeed, string> = {
  photo: "Add a photo",
  freshness: "Log a fresh reading",
  upload: "Run a reading",
  facts: "Add a detail",
  scan: "Start a capture run",
};

export function VenueAskCard({ cafe }: { cafe: CafeStation }) {
  // null = not yet read. Dismissals live in localStorage, so we load them
  // post-mount — the server-rendered tree and the first client paint both
  // render nothing, and the card fades in only if an ask survives.
  const [dismissed, setDismissed] = useState<Set<VenueNeed> | null>(null);
  // Scan state comes from the venue-scans endpoint, not the station. We
  // only fetch it when "scan" is the ask that surfaced — cheap check, and
  // never claiming a gap we haven't confirmed. Keyed by venue id so the
  // drawer reusing this component across stations can't carry the answer
  // from one venue to the next.
  const [scan, setScan] = useState<{
    venueId: string;
    state: "none" | "published" | "error";
  } | null>(null);
  const scanState = scan?.venueId === cafe.id ? scan.state : null;
  const hasPublishedScan = scanState === "published";
  const reducedMotion = useMatchMedia("(prefers-reduced-motion: reduce)");
  // Which micro-contribution sheet is open, if any. Kept local to the card
  // so every surface that mounts an ask card gets rungs 2–3 for free.
  const [sheet, setSheet] = useState<"facts" | "photo" | null>(null);

  useEffect(() => {
    const d = new Set<VenueNeed>();
    for (const n of VENUE_NEED_ORDER) {
      if (isAskDismissed(cafe.id, n)) d.add(n);
    }
    // Deferred so the SSR tree and first client paint stay identical —
    // the card only ever appears, never gets torn out on hydration.
    const t = setTimeout(() => setDismissed(d), 0);
    return () => clearTimeout(t);
  }, [cafe.id]);

  const next =
    dismissed === null ? null : nextAsk(cafe, dismissed, hasPublishedScan);
  const captureAllowed =
    CAPTURE_UI_ENABLED && venueCaptureUiCityAllowed(cafe.city);

  useEffect(() => {
    if (next?.need !== "scan" || !captureAllowed || scanState !== null) return;
    let cancelled = false;
    const venueId = cafe.id;
    void (async () => {
      try {
        const res = await fetch(
          `/api/venue-scans?venue_id=${encodeURIComponent(venueId)}`,
        );
        if (res.ok) {
          const { scans } = (await res.json()) as { scans: PublicVenueScan[] };
          if (!cancelled) {
            setScan({
              venueId,
              state: scans.some((s) => s.status === "published")
                ? "published"
                : "none",
            });
          }
        } else if (!cancelled) {
          setScan({ venueId, state: "error" });
        }
      } catch {
        if (!cancelled) setScan({ venueId, state: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [next?.need, captureAllowed, scanState, cafe.id]);

  if (!next) return null;
  // The scan ask only renders where the capture pilot runs AND once we've
  // confirmed there is genuinely no published scan — a pending or failed
  // check keeps the card quiet rather than claiming a gap we can't verify.
  if (next.need === "scan" && (!captureAllowed || scanState !== "none")) {
    return null;
  }

  const { need, ask } = next;

  function onDismiss() {
    dismissAsk(cafe.id, need);
    setDismissed((prev) => new Set(prev).add(need));
  }

  // Rung routing: facts and photos are standalone micro-contributions
  // with their own sheets (one tap / one shot, no full form). Freshness
  // and upload still land on the existing contribution affordance — the
  // drawer's Contribute tab when one is mounted, else the café page's
  // #contribute section. Scan keeps its dedicated capture route.
  function onCta() {
    if (need === "facts") {
      setSheet("facts");
      return;
    }
    if (need === "photo") {
      setSheet("photo");
      return;
    }
    openContribute();
  }

  // A landed micro-contribution settles the need locally — the card moves
  // straight to the next ask rather than re-asking for what's been given.
  function markAnswered(n: VenueNeed) {
    setDismissed((prev) => new Set(prev ?? []).add(n));
  }

  function openContribute() {
    const behavior: ScrollBehavior = reducedMotion ? "auto" : "smooth";
    const tab = document.getElementById("drawer-tab-contribute");
    if (tab) {
      tab.click();
      document
        .getElementById("drawer-panel-contribute")
        ?.scrollIntoView({ behavior, block: "start" });
      return;
    }
    document
      .getElementById("contribute")
      ?.scrollIntoView({ behavior, block: "start" });
  }

  return (
    <div className="mt-3 border border-ink/60 bg-cream-edge/60 px-4 py-3 shadow-[3px_4px_0_0_var(--color-ink)]">
      <div className="flex items-baseline justify-between gap-3">
        <p className="stamp">Needs · this station</p>
        <div className="flex items-center gap-2.5">
          <span className="bg-ink text-cream font-mono text-[10px] tracking-[0.18em] uppercase px-1.5 py-0.5">
            {ask.timeCost}
          </span>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={`Dismiss “${ask.label}” ask`}
            className="font-mono text-[11px] leading-none text-ink-faint hover:text-ink transition-colors"
          >
            ✕
          </button>
        </div>
      </div>
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink mt-2">
        {ask.label}
      </p>
      <p className="font-serif italic text-ink-soft text-[13px] leading-snug mt-0.5">
        {ask.gap} · {ask.payoff}
      </p>
      {need === "scan" ? (
        <VTLink
          href={`/capture/${slugify(cafe.name)}`}
          className="mt-3 inline-flex items-center gap-1.5 bg-ink text-cream font-mono text-[10px] tracking-[0.22em] uppercase px-4 py-2 hover:bg-ink/90 transition-colors"
        >
          <span aria-hidden>◈</span> {CTA_LABEL[need]}
        </VTLink>
      ) : (
        <button
          type="button"
          onClick={onCta}
          className="pressable mt-3 bg-ink text-cream font-mono text-[10px] tracking-[0.22em] uppercase px-4 py-2 hover:bg-ink/90 transition-colors"
        >
          {CTA_LABEL[need]}
        </button>
      )}
      <VenueFactSheet
        cafe={cafe}
        open={sheet === "facts"}
        onClose={() => setSheet(null)}
        onLanded={() => markAnswered("facts")}
      />
      <VenuePhotoSheet
        cafe={cafe}
        open={sheet === "photo"}
        onClose={() => setSheet(null)}
        onLanded={() => markAnswered("photo")}
      />
    </div>
  );
}
