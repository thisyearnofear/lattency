"use client";

// The 3D-tour status stamp for the café detail surfaces. Additive by
// design — it renders nothing unless NEXT_PUBLIC_VENUE_CAPTURE_ENABLED=1
// AND the venue has a publicly-visible scan. Capture run v2 makes the
// pipeline transparent: the stamp reports truthful states ("SCAN
// PROCESSING", "PREVIEW READY", "3D TOUR") rather than hiding until a
// splat exists. The splat link itself only ever appears once published —
// the gateway won't project splat_url before that anyway.

import { useEffect, useState } from "react";
import {
  VENUE_SCAN_PUBLIC_STATUSES,
  type PublicVenueScan,
  type VenueScanStatus,
} from "@/lib/venue-scan-types";

const CAPTURE_UI_ENABLED = process.env.NEXT_PUBLIC_VENUE_CAPTURE_ENABLED === "1";

// More-advanced pipeline states outrank earlier ones for the stamp — a
// venue with a published scan and an in-flight rescan shows the tour.
const STATUS_RANK: Partial<Record<VenueScanStatus, number>> = {
  captured: 1,
  processing: 2,
  preview: 3,
  refining: 4,
  published: 5,
};

function statusLabel(status: VenueScanStatus): string {
  switch (status) {
    case "published":
      return "3D tour available";
    case "preview":
    case "refining":
      return "Preview ready";
    default:
      return "Scan processing";
  }
}

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
          const visible = scans.filter((s) =>
            VENUE_SCAN_PUBLIC_STATUSES.includes(s.status),
          );
          visible.sort(
            (a, b) => (STATUS_RANK[b.status] ?? 0) - (STATUS_RANK[a.status] ?? 0),
          );
          setScan(visible[0] ?? null);
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

  const published = scan.status === "published";

  return (
    <div className="mt-3 border border-ink/40 bg-cream-edge/60 px-4 py-2.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="bg-ink text-cream font-display font-black text-sm w-7 h-9 flex items-center justify-center shrink-0">
          3D
        </span>
        <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-ink">
          {statusLabel(scan.status)}
        </p>
        {scan.qualityScore !== null && (
          <span className="border border-ink/40 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.18em] uppercase text-ink-soft">
            Q{Math.round(scan.qualityScore)}
          </span>
        )}
      </div>
      {published && scan.splatUrl && (
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
