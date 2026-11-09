import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { venueCaptureEnabled } from "@/lib/venue-capture-policy";
import { getCafeBySlug } from "@/lib/cafes";
import { CITIES, cityDisplayName } from "@/lib/cities";
import { TopNav } from "@/components/top-nav";
import { CaptureConsentForm } from "@/components/capture-consent-form";

export const metadata: Metadata = {
  title: "Capture this venue · Lattency",
};

// The flag is read at request time — never bake the enabled/disabled
// decision into a static render.
export const dynamic = "force-dynamic";

// /capture/[slug] — the consent-first entry point for venue 3D capture.
// A stub by design: it explains the guided walkthrough and collects the
// consent attestations, but the upload itself doesn't exist yet — the
// pipeline (storage → blur verification → gsplat/COLMAP → SPZ) is Phase 1
// infra, and the page says so plainly rather than pretending otherwise.
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
        <p className="stamp mb-3">Venue capture</p>
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

          <div className="border border-ink/15 bg-cream-edge/40 p-5">
            <p className="stamp mb-3">The walkthrough</p>
            <ul className="space-y-2 font-serif text-[14px] leading-snug text-ink">
              <li>· Film a slow, single lap of the space — about 60 seconds.</li>
              <li>· Keep faces out of frame; every scan is blurred before publication regardless.</li>
              <li>· The venue reviews the result and can veto it at any time.</li>
            </ul>
          </div>

          <CaptureConsentForm />

          <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-faint">
            Pipeline status: consent checkpoint live · upload opens once the
            venue has opted in
          </p>
        </div>
      </main>
    </>
  );
}
