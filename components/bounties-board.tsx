// Coffee Bounties — the buymeacoffee-style mechanic for crowdsourcing
// café data. Sponsors pre-fund a small bounty against a specific target;
// contributors run the speed test, the readings are verified by others,
// the bounty pays out.
//
// This component is the demo-stage visualization: real data lives in
// lib/bounties.ts, the "Fund a bounty" action is preview-only. Real
// implementation would back this with a `bounties` table and a Stripe or
// M-Pesa hold/release flow.

import { BOUNTIES, sponsorBadgeStyle, bountyKindLabel, type Bounty } from "@/lib/bounties";

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

export function BountiesBoard({ limit }: { limit?: number }) {
  const items = limit ? BOUNTIES.slice(0, limit) : BOUNTIES;
  return (
    <section
      aria-label="Open coffee bounties"
      className="mt-24 pt-10 border-t border-ink/80"
    >
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <p className="stamp">Section III · monetization preview</p>
          <h2 className="font-display font-black uppercase text-5xl md:text-6xl tracking-[-0.02em] text-ink mt-1">
            Coffee bounties
          </h2>
          <p className="font-serif italic text-ink-soft text-lg md:text-xl mt-3 max-w-2xl">
            Sponsors pre-fund a coffee for the next verified contribution.
            ISPs target their service areas; café owners reward their regulars;
            community members backfill gaps in the map.
          </p>
        </div>
        <a
          href="/partners"
          className="font-mono text-[11px] tracking-[0.22em] uppercase text-ink-soft hover:text-ink transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          Fund a bounty <span aria-hidden>→</span>
        </a>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map((b) => (
          <BountyCard key={b.id} bounty={b} />
        ))}
      </ul>

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
