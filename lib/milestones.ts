// Milestone titles — the transit-themed ranks that turn "I mapped 4 cafés"
// into "I'm a Line Builder". Single source of truth shared by the
// contribution celebration (immediate payoff) and the /me profile page
// (durable status), so a rank means the same thing everywhere.
//
// The ladder used to top out at 10 stations, which meant a contributor who
// mapped four cafés in a weekend hit the ceiling almost immediately and had
// nothing left to climb. The spacing below is deliberately uneven: tight at
// the start so the first session produces two or three promotions, then
// broadening so the later ranks stay meaningful.

export interface Milestone {
  /** Minimum stations mapped to earn this rank. */
  at: number;
  title: string;
  sub: string;
}

/** Ascending — later entries require more stations. */
export const MILESTONES: Milestone[] = [
  { at: 0, title: "Newcomer", sub: "ready to map" },
  { at: 1, title: "Pioneer", sub: "first station on the network" },
  { at: 3, title: "Signal Surveyor", sub: "3 stations mapped" },
  { at: 5, title: "Line Builder", sub: "5 stations mapped" },
  { at: 10, title: "Network Architect", sub: "10+ stations on the map" },
  { at: 20, title: "Junction Engineer", sub: "20 stations on the map" },
  { at: 35, title: "Interchange Designer", sub: "35 stations on the map" },
  { at: 50, title: "Depot Director", sub: "50 stations on the map" },
  { at: 75, title: "Metropolitan Planner", sub: "75 stations on the map" },
  { at: 100, title: "Line Commissioner", sub: "100+ stations on the map" },
];

/** Resolve the rank for a given station count. */
export function milestoneFor(cafesMapped: number): Milestone {
  let current = MILESTONES[0];
  for (const m of MILESTONES) {
    if (cafesMapped >= m.at) current = m;
  }
  return current;
}

/** The next rank up, or null when already at the top. */
export function nextMilestone(cafesMapped: number): { milestone: Milestone; remaining: number } | null {
  for (const m of MILESTONES) {
    if (cafesMapped < m.at) return { milestone: m, remaining: m.at - cafesMapped };
  }
  return null;
}

/**
 * Progress from the previous rank to the next, as a 0–100 percentage.
 *
 * Measured *within the current rung* rather than from zero: on a ladder whose
 * last rungs are 25 stations apart, a from-zero bar sits at 96% and then
 * appears not to move for hours, which reads as broken. Returns 100 when the
 * contributor is at the top rank.
 */
export function rankProgressPct(cafesMapped: number): number {
  const current = milestoneFor(cafesMapped);
  const next = nextMilestone(cafesMapped);
  if (!next) return 100;
  const span = next.milestone.at - current.at;
  if (span <= 0) return 100;
  const done = cafesMapped - current.at;
  return Math.min(100, Math.max(0, Math.round((done / span) * 100)));
}
