// "Sponsored by [Sponsor]" badge for sponsored café tiles. Receives the
// sponsor as a prop (resolved server-side via the cafe_speed_stats join in
// lib/cafes.ts) so client components don't need to do their own lookup.
//
// `compact` shrinks the chip for use on station cards.
// `asLink={false}` switches to a non-interactive span — required when the
// badge sits inside another interactive element (a button-style card).

import Link from "next/link";
import type { Sponsor } from "@/lib/types";

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
  // Ink-on-cream with a leading `$` glyph: keeps the badge unmistakably a
  // "sponsorship" signal without borrowing the express-tier green that
  // already runs the tier badge on the same card.
  const inner = (
    <>
      <span
        aria-hidden
        className={`font-mono ${size} uppercase border border-ink/40 bg-cream text-ink-faint group-hover:border-ink group-hover:text-ink transition-colors`}
      >
        $ sponsored
      </span>
      <span
        className={`font-mono ${size} uppercase bg-ink text-cream group-hover:bg-ink/80 transition-colors`}
      >
        {sponsor.name}
      </span>
    </>
  );
  if (!asLink) {
    return (
      <span
        title={`${sponsor.tagline ?? sponsor.name} · see /partners`}
        className="inline-flex items-center gap-1.5 group"
      >
        {inner}
      </span>
    );
  }
  return (
    <Link
      href="/partners"
      title={`${sponsor.tagline ?? sponsor.name} · sponsorship model`}
      className="inline-flex items-center gap-1.5 group"
    >
      {inner}
    </Link>
  );
}

export function SponsorBadge({
  sponsor,
  compact = false,
  asLink = true,
}: {
  sponsor: Sponsor | null | undefined;
  compact?: boolean;
  /** Set false when rendered inside another interactive element (a
   *  button-card). Avoids nested interactives — a11y + valid HTML. */
  asLink?: boolean;
}) {
  if (!sponsor) return null;
  return <SponsorChip sponsor={sponsor} compact={compact} asLink={asLink} />;
}

export function SponsorTagline({ sponsor }: { sponsor: Sponsor | null | undefined }) {
  if (!sponsor || !sponsor.tagline) return null;
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
