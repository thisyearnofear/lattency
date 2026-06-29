// Sponsored café tiles — a concrete preview of the ISP-sponsorship model
// described on /partners. Keyed by café name so the lookup works against
// both Aurora-backed rows and the mock fallback without touching the
// schema. A production version would back this with a `sponsorships`
// table joined on cafe_id.
//
// Today: one curated sponsor per market, chosen to be plausible for the
// hackathon demo. Tomorrow: pricing tiers + neighbourhood targeting.

export interface Sponsor {
  /** Display name on the badge. */
  name: string;
  /** One-line value prop, used in the card subtitle. */
  tagline: string;
  /** Sponsor type — feeds /partners pitch language and badge colour. */
  kind: "isp" | "café" | "community";
}

const SPONSORS_BY_CAFE: Record<string, Sponsor> = {
  // Nairobi · the speed-dealer story practically writes itself
  "Connect Coffee Roasters": {
    name: "Safaricom Fibre",
    tagline: "Powered by 1 Gbps home fibre",
    kind: "isp",
  },
  // San Francisco · same pattern, different ISP
  "Mazarine Coffee": {
    name: "Sonic.net",
    tagline: "Powered by 10 Gbps symmetric fibre",
    kind: "isp",
  },
};

export function sponsorForCafe(name: string): Sponsor | null {
  return SPONSORS_BY_CAFE[name] ?? null;
}
