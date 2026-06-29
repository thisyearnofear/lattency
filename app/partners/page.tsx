import type { Metadata } from "next";
import Link from "next/link";
import { TopNav } from "@/components/top-nav";
import { BountiesBoard } from "@/components/bounties-board";

export const metadata: Metadata = {
  title: "Partners · Lattency",
  description:
    "How Lattency makes money — sponsored speed badges for ISPs, verified wifi badges for café owners, and a coffee bounty board for contributors.",
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
            <span aria-hidden>←</span> All stations
          </Link>
          <p className="stamp">Partners · monetization model</p>
        </div>

        {/* Hero */}
        <header className="border-b border-ink/80 pb-10 mb-10">
          <p className="stamp">Edition 01 · How Lattency makes money</p>
          <h1
            className="font-display font-black uppercase text-ink leading-[0.9] tracking-[-0.02em] mt-3"
            style={{ fontSize: "clamp(48px, 8vw, 112px)" }}
          >
            Where your wifi
            <br />
            meets your customers.
          </h1>
          <p className="font-serif italic text-ink-soft text-xl md:text-2xl mt-5 max-w-3xl">
            A two-sided marketplace on top of a transit map. ISPs sponsor
            verified speed badges in the neighbourhoods they serve. Café
            owners earn the badge by hosting verified speed tests.
            Contributors earn coffee by running them.
          </p>
        </header>

        {/* Pitches */}
        <PitchBlock
          number="X"
          audience="For ISPs · Fibre / mobile / satellite"
          headline="Stop telling people you&rsquo;re fast. Show them where."
          accent="express"
          body={
            <>
              <p>
                Lattency&rsquo;s map already shows real measured speeds at
                real cafés. Sponsor a tile — your name rides the marker
                anywhere your fibre / mobile / satellite footprint touches.
                Every visitor to the city&rsquo;s map sees that your network
                is what makes those cafés express-tier.
              </p>
              <p>
                Fund a coffee bounty in a neighbourhood you serve and you
                turn the contribution flywheel toward your service area —
                more verified cafés, more sponsored tiles, more proof
                points for your sales team.
              </p>
              <p className="font-mono text-[13px] text-ink-faint">
                Pricing: $250/mo per neighbourhood · $50 per funded bounty
                · custom for city-wide sponsorship.
              </p>
            </>
          }
          cta={{ label: "Talk to us — sales@lattency.app", href: "mailto:sales@lattency.app?subject=Sponsorship%20enquiry" }}
        />

        <PitchBlock
          number="L"
          audience="For café owners · independents and chains"
          headline="Get the verified wifi badge."
          accent="local"
          body={
            <>
              <p>
                Customers are already searching for a café where they can
                work. Today they guess. Tomorrow they read the tier
                straight off your tile — and the verified badge on your
                door (and your Google Maps listing, and your bio) tells
                them you&rsquo;ve been measured.
              </p>
              <p>
                Stake $5 against the 10th verified speed test at your café
                — the contributor gets the coffee, you get the visit, your
                wifi gets the proof. Bigger chains can sponsor branded
                bounties across multiple locations.
              </p>
              <p className="font-mono text-[13px] text-ink-faint">
                Pricing: free badge on the verified tier · $5 minimum per
                staked bounty · printed-window-sticker bundle on request.
              </p>
            </>
          }
          cta={{ label: "Claim your café — partners@lattency.app", href: "mailto:partners@lattency.app?subject=Café%20partner%20enquiry" }}
        />

        <PitchBlock
          number="S"
          audience="For contributors · the people running the speed tests"
          headline="Map the network. Earn coffee."
          accent="suspended"
          body={
            <>
              <p>
                Every verified speed test is a small data point that an
                ISP or a café owner is willing to pay for. Run a test, snap
                a photo, fill in the metadata — when your reading is
                verified by the next contributor, the bounty pays out.
                Today as a coffee on the house at the same café. Tomorrow
                as a balance you can withdraw via M-Pesa or Stripe.
              </p>
              <p>
                Want to back-fill the network where there&rsquo;s no
                coverage yet? Stake your own bounty for an area you care
                about — &ldquo;first verified café in Lavington&rdquo; — and
                pay it forward when the next person walks in.
              </p>
              <p className="font-mono text-[13px] text-ink-faint">
                Currently in preview · payout rail (M-Pesa / Stripe) ships
                with the first ISP partner.
              </p>
            </>
          }
          cta={{ label: "See the open bounties ↓", href: "#bounties" }}
        />

        {/* Bounty board, anchored */}
        <div id="bounties" className="scroll-mt-20">
          <BountiesBoard />
        </div>

        {/* Why this works — short architecture/credibility section */}
        <section className="mt-24 pt-10 border-t border-ink/80">
          <p className="stamp">Why this isn&rsquo;t vapourware</p>
          <h2 className="font-display font-black uppercase text-ink leading-[0.95] tracking-[-0.02em] text-3xl md:text-4xl mt-3">
            The trust layer is already shipped.
          </h2>
          <ul className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                label: "Speed test from a real edge",
                body: "Every measurement round-trips through a Vercel edge region the server records and returns. You can&rsquo;t fake the IP, you can&rsquo;t fake the bytes — the test method is derived server-side from the auto-test metadata.",
              },
              {
                label: "Outlier flagging in the materialized view",
                body: "Readings &gt;5× or &lt;0.2× the café&rsquo;s median are flagged in Aurora the moment they land. The first sponsored bounty payout would gate on a clean outlier flag plus a second corroborating reading.",
              },
              {
                label: "Rate-limited contributions",
                body: "One measurement per IP per café per 10 minutes; one new café per IP per hour. SHA-256 hashed IPs, never stored raw. The same rate-limit scope generalizes to bounty payouts.",
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
            Lattency · partners · {new Date().getFullYear()}
          </p>
          <p className="font-serif italic text-ink-faint">
            built on Aurora PostgreSQL · deployed on Vercel
          </p>
          <Link href="/" className="stamp hover:text-ink transition-colors">
            ← Back to the map
          </Link>
        </footer>
      </main>
    </>
  );
}
