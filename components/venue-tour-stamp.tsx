"use client";

// "3D tour available" stamp for the café detail surfaces. Additive by
// design — it renders nothing unless NEXT_PUBLIC_VENUE_CAPTURE_ENABLED=1
// AND the venue has a published scan. The viewer embed itself is a later
// phase; for now the stamp links out to the published splat asset.

import { useEffect, useState } from "react";
import type { PublicVenueScan } from "@/lib/venue-scan-types";

const CAPTURE_UI_ENABLED = process.env.NEXT_PUBLIC_VENUE_CAPTURE_ENABLED === "1";

export function VenueTourStamp({ venueId }: { venueId: string }) {
  const [scan, setScan] = useState<PublicVenueScan | null>(null);

  useEffect(() => {
    if (!CAPTURE_UI_ENABLED || !venueId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/venue-scans?venue_id=${encodeURIComponent(venueId)}`,
        );
        if (!cancelled && res.ok) {
          const { scans } = (await res.json()) as { scans: PublicVenueScan[] };
          setScan(scans.find((s) => s.status === "published") ?? null);
        }
      } catch {
        /* the stamp is additive — a failed fetch stays invisible */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  if (!CAPTURE_UI_ENABLED || !scan) return null;

  return (
    <div className="mt-3 border border-ink/40 bg-cream-edge/60 px-4 py-2.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="bg-ink text-cream font-display font-black text-sm w-7 h-9 flex items-center justify-center shrink-0">
          3D
        </span>
        <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-ink">
          3D tour available
        </p>
      </div>
      {scan.splatUrl && (
        <a
          href={scan.splatUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-soft hover:text-ink transition-colors whitespace-nowrap"
        >
          Open tour <span aria-hidden>↗</span>
        </a>
      )}
    </div>
  );
}
