import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { venueCaptureEnabled } from "@/lib/venue-capture-policy";
import { getCafeBySlug } from "@/lib/cafes";
import { CITIES, cityDisplayName } from "@/lib/cities";
import { TopNav } from "@/components/top-nav";
import { CaptureRun } from "@/components/capture-consent-form";

export const metadata: Metadata = {
  title: "Capture this venue · Lattency",
};

// The flag is read at request time — never bake the enabled/disabled
// decision into a static render.
export const dynamic = "force-dynamic";

// /capture/[slug] — the consent-first capture run for venue 3D capture.
// BRIEF → ATTEST → RUN → ARMED: the live coach streams JPEG keyframe
// chunks to /api/venue-scans/:id/upload as the contributor films. Frame
// *bytes* aren't persisted yet (no object storage — Phase 1 infra); the
// scan record carries the manifest, quality signals, and consent record
// so the pipeline can pick up real captures the moment storage lands.
export default async function CapturePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!venueCaptureEnabled()) notFound();
  const { slug } = await params;

  let cafe = null;
  try {
    cafe = await getCafeBySlug(slug);
  } catch {
    /* fall through to the slug label — the stub doesn't need live data */
  }

  const venueName = cafe?.name ?? slug.replace(/-/g, " ");
  const venueLine = cafe
    ? [cafe.neighbourhood, CITIES[cafe.city]?.name ?? cityDisplayName(cafe.city)]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <>
      <TopNav
        current="app"
        currentCity={cafe?.city}
        currentCityName={
          cafe ? (CITIES[cafe.city]?.name ?? cityDisplayName(cafe.city)) : undefined
        }
      />
      <main className="mx-auto max-w-[680px] px-6 pt-10 pb-24">
        <p className="stamp mb-3">Capture run · target station</p>
        <h1 className="font-display font-black uppercase leading-[0.92] tracking-[-0.02em] text-4xl md:text-5xl text-ink">
          {venueName}
        </h1>
        {venueLine && (
          <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-ink-soft mt-3">
            {venueLine}
          </p>
        )}

        <div className="mt-8 space-y-5">
          <p className="font-serif italic text-ink-soft text-lg leading-snug">
            A 60-second guided walkthrough, filmed on your phone, becomes a 3D
            tour of this venue — shown alongside the connectivity data that
            already lives here. Consent comes first, always.
          </p>

          <CaptureRun venueName={venueName} venueId={cafe?.id ?? null} />

          <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-faint">
            Pipeline status: live-run coach active · frame bytes land when
            object storage ships
          </p>
        </div>
      </main>
    </>
  );
}
