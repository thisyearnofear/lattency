// Milestone titles — the transit-themed ranks that turn "I mapped 4 cafés"
// into "I'm a Line Builder". Single source of truth shared by the
// contribution celebration (immediate payoff) and the /me profile page
// (durable status), so a rank means the same thing everywhere.

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
