import type { Metadata } from "next";
import Link from "next/link";
import { TopNav } from "@/components/top-nav";
import { BountiesBoard } from "@/components/bounties-board";
import { SponsorDashboard } from "@/components/sponsor-dashboard";
import { TIER_COLOUR, TIER_PATH, TIER_USE } from "@/lib/map-data";
import type { Tier } from "@/lib/types";

export const metadata: Metadata = {
  title: "Partners · Lattency",
  description:
    "Sponsor verified wifi badges, claim your café, or earn coffee by running speed tests.",
};

function PitchBlock({
  number,
  audience,
  headline,
  body,
  cta,
  accent,
}: {
  number: string;
  audience: string;
  headline: string;
  body: React.ReactNode;
  cta: { label: string; href: string };
  accent: "express" | "local" | "suspended";
}) {
  const accentBg =
    accent === "express"
      ? "bg-express"
      : accent === "local"
        ? "bg-local"
        : "bg-suspended";
  return (
    <article className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6 lg:gap-10 py-10 border-t border-ink/15 first:border-t-0">
      <div className="flex lg:flex-col items-baseline lg:items-start gap-4">
        <span
          className={`${accentBg} text-cream font-display font-black text-5xl leading-none w-16 h-20 flex items-center justify-center shrink-0`}
        >
          {number}
        </span>
        <p className="font-mono text-[11px] tracking-[0.22em] uppercase text-ink-soft mt-1">
          {audience}
        </p>
      </div>
      <div>
        <h2 className="font-display font-black uppercase text-ink leading-[0.95] tracking-[-0.01em] text-3xl md:text-4xl">
          {headline}
        </h2>
        <div className="font-serif text-ink-soft text-lg leading-relaxed mt-4 space-y-3 max-w-[58ch]">
          {body}
        </div>
        <Link
          href={cta.href}
          className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.22em] uppercase text-ink hover:text-express transition-colors mt-5"
        >
          {cta.label} <span aria-hidden>→</span>
        </Link>
      </div>
    </article>
  );
}

export default function PartnersPage() {
  return (
    <>
      <TopNav current="partners" />

      <main className="mx-auto max-w-[1200px] px-6 md:px-12 pt-8 pb-24">
        {/* Breadcrumb */}
        <div className="flex items-center justify-between gap-4 mb-8">
          <Link
            href="/"
            className="font-mono text-[10px] tracking-[0.22em] uppercase text-ink-soft hover:text-ink transition-colors inline-flex items-center gap-1.5"
          >
            <span aria-hidden>←</span> Map
          </Link>
          <p className="stamp">Partners</p>
        </div>

        {/* Hero — a schematic tier-line banner gives the page a visual
            anchor (every other "wow" page has one), not just a headline. */}
        <header className="border-b border-ink/80 pb-10 mb-10">
          <h1
            className="font-display font-black uppercase text-ink leading-[0.9] tracking-[-0.02em]"
            style={{ fontSize: "clamp(44px, 7vw, 96px)" }}
          >
            Where your wifi
            <br />
            meets your customers.
          </h1>
          <p className="font-serif italic text-ink-soft text-lg md:text-xl mt-5 max-w-2xl">
            ISPs sponsor verified speed badges. Cafés earn them. Contributors get paid to run the tests.
          </p>
          {/* The same three lines the live map draws — a quiet promise that
              the network is real, not a mockup. */}
          <div className="mt-8 border border-ink/15 bg-cream-edge/40 overflow-hidden">
            <svg viewBox="0 0 1440 720" className="w-full h-auto block" preserveAspectRatio="xMidYMid slice" aria-hidden>
              {(["express", "local", "suspended"] as Tier[]).map((tier) => (
                <path
                  key={tier}
                  d={TIER_PATH[tier]}
                  fill="none"
                  stroke={TIER_COLOUR[tier]}
                  strokeWidth={tier === "suspended" ? 12 : 14}
                  strokeLinecap={tier === "suspended" ? "butt" : "round"}
                  strokeDasharray={tier === "suspended" ? "14 10" : undefined}
                  opacity={0.85}
                />
              ))}
            </svg>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 px-5 py-3 border-t border-ink/10">
              {(["express", "local", "suspended"] as Tier[]).map((tier) => (
                <span key={tier} className="inline-flex items-center gap-2">
                  <span className="inline-block w-6 h-[5px]" style={{ background: TIER_COLOUR[tier] }} />
                  <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-ink-soft">
                    {tier} · <span className="font-serif italic normal-case tracking-normal text-[11px]">{TIER_USE[tier]}</span>
                  </span>
                </span>
              ))}
            </div>
          </div>
        </header>

        {/* Pitches first — sell the model before asking for the form. */}

        {/* Pitches */}
        <PitchBlock
          number="X"
          audience="For ISPs"
          headline="Show them where you&rsquo;re fast."
          accent="express"
          body={
            <>
              <p>
                Your name rides the speed badge on every café your network reaches. Fund a bounty in a neighbourhood you serve and the map fills in with your proof points.
              </p>
              <p className="font-mono text-[13px] text-ink-faint">
                $250/mo per neighbourhood · $50 per funded bounty.
              </p>
            </>
          }
          cta={{ label: "sales@lattency.app", href: "mailto:sales@lattency.app?subject=Sponsorship%20enquiry" }}
        />

        <PitchBlock
          number="L"
          audience="For café owners"
          headline="Get the verified wifi badge."
          accent="local"
          body={
            <>
              <p>
                Customers already search for a café where they can work. Stake $5 against a verified test — the contributor gets the coffee, you get the visit, your wifi gets the badge.
              </p>
              <p className="font-mono text-[13px] text-ink-faint">
                Free badge on the verified tier · $5 min per staked bounty.
              </p>
            </>
          }
          cta={{ label: "partners@lattency.app", href: "mailto:partners@lattency.app?subject=Café%20partner%20enquiry" }}
        />

        <PitchBlock
          number="S"
          audience="For contributors"
          headline="Map the network. Earn coffee."
          accent="suspended"
          body={
            <>
              <p>
                Run a speed test, snap a photo, fill the metadata. When your reading is verified, the bounty pays out — today as NIM in your Nimiq Pay wallet.
              </p>
              <p className="font-mono text-[13px] text-ink-faint">
                NIM payouts live in preview · M-Pesa / Stripe with the first ISP partner.
              </p>
            </>
          }
          cta={{ label: "See open bounties ↓", href: "#bounties" }}
        />

        {/* Sponsor dashboard — the action, now that the pitches have sold it. */}
        <SponsorDashboard />

        {/* Bounty board, anchored */}
        <div id="bounties" className="scroll-mt-20">
          <BountiesBoard />
        </div>

        {/* Why this works — short credibility section */}
        <section className="mt-24 pt-10 border-t border-ink/80">
          <p className="stamp">The trust layer is already shipped</p>
          <ul className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                label: "Real edge test",
                body: "Every test round-trips through a Vercel edge region the server records. You can&rsquo;t fake the IP or the bytes.",
              },
              {
                label: "Outlier flagging",
                body: "Readings far off a café&rsquo;s median are flagged the moment they land. Payouts gate on a clean flag plus a second reading.",
              },
              {
                label: "Rate-limited",
                body: "One test per IP per café per 10 minutes. IPs are SHA-256 hashed, never stored raw.",
              },
            ].map((c) => (
              <li key={c.label} className="border border-ink/15 bg-cream p-5">
                <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-faint">
                  {c.label}
                </p>
                <p
                  className="font-serif text-ink-soft text-sm leading-relaxed mt-2"
                  dangerouslySetInnerHTML={{ __html: c.body }}
                />
              </li>
            ))}
          </ul>
        </section>

        {/* Footer */}
        <footer className="mt-20 border-t border-ink/40 pt-6 flex flex-wrap items-baseline justify-between gap-4 text-sm">
          <p className="stamp">
            Lattency · {new Date().getFullYear()}
          </p>
          <Link href="/" className="stamp hover:text-ink transition-colors">
            ← Map
          </Link>
        </footer>
      </main>
    </>
  );
}
