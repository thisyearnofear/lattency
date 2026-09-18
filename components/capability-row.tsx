// CapabilityRow — "can you actually work here?", answered from the numbers.
//
// Deliberately presented as a correction to the line rather than a second
// verdict competing with it. The tier is derived from download alone; a café
// can be genuinely Express and still be unable to hold a call. Showing only
// the tier would mislead, and showing an unexplained contradiction would read
// as a bug, so the callout names the metric that limits the call and says
// plainly that the line is faster than the connection.
//
// Square glyphs and mono labels to match the transit idiom — no icon set.

import {
  callCaveat,
  capabilities,
  tierOverstatesCall,
  type StationMetrics,
  type Verdict,
} from "@/lib/capability";
import type { Tier } from "@/lib/types";

const VERDICT_GLYPH: Record<Verdict, string> = {
  yes: "✓",
  marginal: "~",
  no: "✕",
  unknown: "—",
};

const VERDICT_COLOUR: Record<Verdict, string> = {
  yes: "var(--color-express)",
  marginal: "var(--color-local)",
  no: "var(--color-suspended)",
  unknown: "var(--color-ink-faint)",
};

/** The word is visible next to the glyph — colour alone is not a label. */
const VERDICT_WORD: Record<Verdict, string> = {
  yes: "yes",
  marginal: "marginal",
  no: "no",
  unknown: "unknown",
};

const TIER_LABEL: Record<Tier, string> = {
  express: "Express",
  local: "Local",
  suspended: "Suspended",
};

function VerdictChip({ verdict }: { verdict: Verdict }) {
  return (
    <span
      aria-hidden
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center font-display font-black text-sm text-cream"
      style={{ background: VERDICT_COLOUR[verdict] }}
    >
      {VERDICT_GLYPH[verdict]}
    </span>
  );
}

export function CapabilityRow({
  metrics,
  tier,
}: {
  metrics: StationMetrics;
  /** The station's line. Used only to reconcile the caveat with the badge. */
  tier: Tier;
}) {
  const caps = capabilities(metrics);
  const overstates = tierOverstatesCall(metrics);

  return (
    <div>
      <p className="stamp">Can you work here?</p>

      <ul className="mt-2.5 space-y-2">
        {caps.map((cap) => (
          <li key={cap.id} className="flex items-start gap-2.5">
            <VerdictChip verdict={cap.verdict} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink">
                  {cap.label}
                </span>
                <span
                  className="font-mono text-[10px] uppercase tracking-[0.14em]"
                  style={{ color: VERDICT_COLOUR[cap.verdict] }}
                >
                  {VERDICT_WORD[cap.verdict]}
                </span>
              </span>
              <span className="mt-0.5 block font-serif text-[13px] italic leading-snug text-ink-soft">
                {cap.note}
              </span>
            </span>
          </li>
        ))}
      </ul>

      {/* Reconciles the badge with the verdicts above: "Express" and "calls: no"
          are both true, and the reason is that the line's download is not the
          whole story. Only rendered when they actually disagree, so it never
          becomes boilerplate the eye learns to skip. */}
      {overstates && (
        <p className="mt-3 border border-local/40 bg-local/5 px-3 py-2 font-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] text-ink-soft">
          <span className="text-local" aria-hidden>
            !{" "}
          </span>
          {TIER_LABEL[tier]} line — but the download is faster
          {metrics.upMbps > 0 ? ` than the upload (${Math.round(metrics.upMbps * 10) / 10} Mbps up)` : ""}.
          Treat calls as unreliable.
        </p>
      )}
    </div>
  );
}

/**
 * Compact variant for directory cards: one line naming whatever limits a call,
 * so the reader learns it before clicking. Renders only when there's something
 * to say — see callCaveat for why the trigger is not simply "tier is wrong".
 */
export function CapabilityCaveat({ metrics }: { metrics: StationMetrics }) {
  const bottleneck = callCaveat(metrics);
  if (!bottleneck) return null;

  return (
    <p className="inline-flex items-center gap-1.5 border border-local/40 bg-local/5 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
      <span className="text-local" aria-hidden>
        !
      </span>
      Calls limited by {bottleneck}
    </p>
  );
}
