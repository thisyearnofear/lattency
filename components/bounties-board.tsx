// Coffee Bounties — the buymeacoffee-style mechanic for crowdsourcing
// café data. Sponsors pre-fund a small bounty against a specific target;
// contributors run the speed test, the readings are verified by others,
// the bounty pays out.
//
// This component is the demo-stage visualization: real data lives in
// lib/bounties.ts, the "Fund a bounty" action is preview-only. Real
// implementation would back this with a `bounties` table and a Stripe or
// M-Pesa hold/release flow.

import { getBounties, sponsorBadgeStyle, bountyKindLabel, type Bounty } from "@/lib/bounties";

function CoffeeRow({ amount }: { amount: number }) {
  const cups = Math.max(1, Math.ceil(amount / 5));
  const capped = Math.min(cups, 5);
  return (
    <span aria-label={`${cups} coffee${cups > 1 ? "s" : ""}`} className="inline-flex items-center gap-[2px]">
      {Array.from({ length: capped }).map((_, i) => (
        <span key={i} aria-hidden className="text-[14px] leading-none">
          ☕
        </span>
      ))}
      {cups > capped && (
        <span aria-hidden className="font-mono text-[10px] tracking-[0.14em] text-ink-soft ml-1">
          ×{cups}
        </span>
      )}
    </span>
  );
}

function BountyCard({ bounty }: { bounty: Bounty }) {
  const sponsor = sponsorBadgeStyle(bounty.sponsorKind);
  const pct = Math.round((bounty.progress / bounty.target) * 100);
  const filled = bounty.progress >= bounty.target;

  return (
    <li className="group bg-cream border border-ink/15 hover:border-ink/60 hover:-translate-y-0.5 hover:shadow-[4px_6px_0_0_var(--color-ink)] transition-[transform,border-color,box-shadow] duration-200">
      <div className="p-5 flex flex-col gap-4 h-full">
        {/* Sponsor strip */}
        <div className="flex items-center justify-between gap-3">
          <span
            className={`${sponsor.bg} ${sponsor.ink} font-mono text-[9px] tracking-[0.22em] uppercase px-2 py-1`}
          >
            {sponsor.label}
          </span>
          <span className="font-mono text-[9px] tracking-[0.16em] uppercase text-ink-faint">
            {bountyKindLabel(bounty.kind)}
          </span>
        </div>

        {/* Goal */}
        <p className="font-display font-black uppercase text-ink text-xl leading-tight tracking-[-0.01em]">
          {bounty.goal}
        </p>

        {/* Area + sponsor name */}
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-serif italic text-ink-faint text-sm">{bounty.area}</p>
          <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-soft text-right">
            by {bounty.sponsor}
          </p>
        </div>

        {/* Bounty + progress */}
        <div className="mt-auto pt-3 border-t border-cream-deep flex items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-ink-faint">
              Bounty
            </p>
            <div className="flex items-center gap-2 mt-1">
              <CoffeeRow amount={bounty.amountUsd} />
              <span className="font-mono text-[12px] tabular-nums text-ink">
                ${bounty.amountUsd}
              </span>
            </div>
          </div>
          <div className="text-right">
            <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-ink-faint">
              Progress
            </p>
            <p className="font-mono text-[12px] tabular-nums text-ink mt-1">
              {bounty.progress}/{bounty.target}
              <span className={`ml-1.5 text-[9px] tracking-[0.16em] uppercase ${filled ? "text-express" : "text-ink-faint"}`}>
                {filled ? "ready" : `${pct}%`}
              </span>
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-[3px] bg-cream-deep w-full relative -mt-1">
          <div
            className="absolute inset-y-0 left-0 bg-ink"
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </div>
    </li>
  );
}

export async function BountiesBoard({ limit }: { limit?: number }) {
  const all = await getBounties();
  const items = limit ? all.slice(0, limit) : all;
  return (
    <section
      aria-label="Open coffee bounties"
      className="mt-24 pt-10 border-t border-ink/80"
    >
      <div className="flex flex-wrap items-end justify-between gap-4 mb-3">
        <div>
          <p className="stamp">Section III · monetization preview</p>
          <h2 className="font-display font-black uppercase text-5xl md:text-6xl tracking-[-0.02em] text-ink mt-1">
            Coffee bounties
          </h2>
          {/* One-liner that explains the mechanic before the cards do. */}
          <p className="font-mono text-[11px] md:text-[12px] tracking-[0.22em] uppercase text-ink-soft mt-3">
            Sponsors pre-pay a coffee.
            <span className="text-ink-faint mx-1.5">·</span>
            Contributors run a speed test.
            <span className="text-ink-faint mx-1.5">·</span>
            The map fills in.
          </p>
          <p className="font-serif italic text-ink-soft text-lg md:text-xl mt-3 max-w-2xl">
            ISPs target their service areas; café owners reward their regulars;
            community members backfill gaps in the map. Six representative
            bounties below — same mechanics that already gate contribution
            integrity will gate the payouts.
          </p>
        </div>
        <a
          href="/partners"
          className="font-mono text-[11px] tracking-[0.22em] uppercase text-ink-soft hover:text-ink transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          Fund a bounty <span aria-hidden>→</span>
        </a>
      </div>

      {/* Three-step mini-explainer reinforcing the one-liner above. */}
      <ol className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        {[
          { n: "01", verb: "Stake", body: "An ISP, café owner, or community member pre-pays a small bounty for a specific target — first café in Lavington, 3 oat-milk spots in Kilimani, 10th verified test at Savanna." },
          { n: "02", verb: "Run", body: "A contributor walks into a café, runs a real in-browser speed test, fills in the coffee metadata, snaps a photo. The reading lands in Aurora the moment it commits." },
          { n: "03", verb: "Verify + pay", body: "Outlier-flagged or solo readings wait for a second corroborating test. Once verified, the bounty pays out — today a coffee on the house, soon a balance via M-Pesa or Stripe." },
        ].map((step) => (
          <li
            key={step.n}
            className="border border-ink/15 bg-cream-edge/40 p-4"
          >
            <div className="flex items-baseline gap-3">
              <span className="font-display font-black text-3xl text-express leading-none">
                {step.n}
              </span>
              <span className="font-mono text-[11px] tracking-[0.22em] uppercase text-ink">
                {step.verb}
              </span>
            </div>
            <p className="font-serif text-ink-soft text-sm mt-2 leading-snug">
              {step.body}
            </p>
          </li>
        ))}
      </ol>

      {items.length === 0 ? (
        <div className="border border-dashed border-ink/30 bg-cream-edge/40 p-10 text-center">
          <p className="font-display font-black uppercase text-3xl tracking-[-0.01em] text-ink">
            No open bounties yet.
          </p>
          <p className="font-serif italic text-ink-soft text-lg mt-3 max-w-xl mx-auto">
            Be the first to back the map. Stake a coffee for the next
            verified café in a neighbourhood you care about, or sponsor a
            tier-target across your service area.
          </p>
          <a
            href="/partners"
            className="bg-ink text-cream font-mono text-[11px] tracking-[0.22em] uppercase px-4 py-2.5 inline-flex items-center gap-1.5 hover:bg-ink/90 transition-colors mt-6"
          >
            Fund the first bounty <span aria-hidden>→</span>
          </a>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((b) => (
            <BountyCard key={b.id} bounty={b} />
          ))}
        </ul>
      )}

      <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-faint mt-5">
        Preview · payment + verification flow ships next · see{" "}
        <a href="/partners" className="text-ink underline underline-offset-4 hover:text-express">
          /partners
        </a>{" "}
        for the model
      </p>
    </section>
  );
}
