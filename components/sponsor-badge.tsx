// "Powered by [Sponsor]" badge — appears on sponsored café tiles across
// the station card, detail drawer, and per-café page. The badge links to
// /partners so judges can see how the sponsorship model is priced.
//
// `compact` mode shrinks the badge for the station-card row; default mode
// is the larger inline lockup used on detail pages.

import Link from "next/link";
import { sponsorForCafe, type Sponsor } from "@/lib/sponsors";

function SponsorChip({
  sponsor,
  compact,
  asLink,
}: {
  sponsor: Sponsor;
  compact: boolean;
  asLink: boolean;
}) {
  const size = compact
    ? "text-[9px] tracking-[0.16em] px-1.5 py-[3px]"
    : "text-[10px] tracking-[0.2em] px-2 py-[4px]";
  const inner = (
    <>
      <span
        aria-hidden
        className={`font-mono ${size} uppercase border border-ink/40 bg-cream text-ink-faint group-hover:border-ink group-hover:text-ink transition-colors`}
      >
        sponsored
      </span>
      <span
        className={`font-mono ${size} uppercase bg-express text-cream group-hover:bg-ink transition-colors`}
      >
        {sponsor.name}
      </span>
    </>
  );
  if (!asLink) {
    // Card view: cards are buttons, so the badge can't be an interactive
    // element itself. Render a static lockup that still inherits the
    // group hover state of the surrounding card.
    return (
      <span
        title={`${sponsor.tagline} · see /partners`}
        className="inline-flex items-center gap-1.5 group"
      >
        {inner}
      </span>
    );
  }
  return (
    <Link
      href="/partners"
      title={`${sponsor.tagline} · sponsorship model`}
      className="inline-flex items-center gap-1.5 group"
    >
      {inner}
    </Link>
  );
}

export function SponsorBadge({
  cafeName,
  compact = false,
  asLink = true,
}: {
  cafeName: string;
  compact?: boolean;
  /** Set false when rendered inside another interactive element (a button-card).
   *  Avoids nested interactives — accessibility + valid HTML. */
  asLink?: boolean;
}) {
  const sponsor = sponsorForCafe(cafeName);
  if (!sponsor) return null;
  return <SponsorChip sponsor={sponsor} compact={compact} asLink={asLink} />;
}

export function SponsorTagline({ cafeName }: { cafeName: string }) {
  const sponsor = sponsorForCafe(cafeName);
  if (!sponsor) return null;
  return (
    <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-faint">
      {sponsor.tagline} ·{" "}
      <Link
        href="/partners"
        className="text-ink-soft hover:text-ink underline underline-offset-4"
      >
        how this works
      </Link>
    </p>
  );
}
