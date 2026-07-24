// Single source of truth for workspace metadata — the details that turn
// Lattency from a speed-test tool into a workspace finder.
//
// Vocabulary is deliberately small and fixed so chips stay legible and the
// UI doesn't become a form. Contributors pick from a menu; they don't
// free-type.
//
// We keep this objective and verifiable. No subjective coffee-quality
// ratings. If it can't be observed or measured, it doesn't belong here.

import type { CafeMetadata, CafeStation, VenueType } from "./types";

export const VENUE_TYPES = [
  "cafe",
  "coworking",
  "hotel-lobby",
  "library",
  "hybrid",
] as const;

export const VENUE_TYPE_LABELS: Record<VenueType, string> = {
  cafe: "Café",
  coworking: "Coworking",
  "hotel-lobby": "Hotel lobby",
  library: "Library",
  hybrid: "Hybrid",
};

export const MILK_OPTIONS = ["dairy", "oat", "soy", "almond"] as const;
export const PRICE_TIERS = ["budget", "mid", "premium"] as const;
export const SEATING_TYPES = ["bar", "tables", "lounge", "mixed"] as const;
export const NOISE_LEVELS = ["quiet", "moderate", "loud"] as const;
export const TABLE_SPACES = ["small", "standard", "large"] as const;

export const PRICE_TIER_LABELS: Record<string, string> = {
  budget: "$",
  mid: "$$",
  premium: "$$$",
};

export const SEATING_LABELS: Record<string, string> = {
  bar: "Bar stools",
  tables: "Tables",
  lounge: "Lounge",
  mixed: "Mixed seating",
};

export const MILK_LABELS: Record<string, string> = {
  dairy: "Dairy",
  oat: "Oat milk",
  soy: "Soy milk",
  almond: "Almond milk",
};

export const NOISE_LEVEL_LABELS: Record<string, string> = {
  quiet: "Quiet",
  moderate: "Moderate",
  loud: "Loud",
};

export const TABLE_SPACE_LABELS: Record<string, string> = {
  small: "Small tables",
  standard: "Standard tables",
  large: "Large tables",
};

/**
 * Validate and clean metadata input from a contributor. Returns a safe
 * partial object — only fields that pass validation are included.
 */
export function validateCafeMetadata(input: Partial<CafeMetadata>): CafeMetadata {
  const clean: CafeMetadata = {};

  if (input.priceTier && (PRICE_TIERS as readonly string[]).includes(input.priceTier)) {
    clean.priceTier = input.priceTier;
  }

  if (Array.isArray(input.milkOptions)) {
    clean.milkOptions = input.milkOptions.filter((m) =>
      (MILK_OPTIONS as readonly string[]).includes(m),
    );
  }

  if (typeof input.powerOutlets === "boolean") {
    clean.powerOutlets = input.powerOutlets;
  }

  if (input.seating && (SEATING_TYPES as readonly string[]).includes(input.seating)) {
    clean.seating = input.seating;
  }

  if (typeof input.wifiNetwork === "string" && input.wifiNetwork.trim()) {
    clean.wifiNetwork = input.wifiNetwork.trim().slice(0, 64);
  }

  if (input.noiseLevel && (NOISE_LEVELS as readonly string[]).includes(input.noiseLevel)) {
    clean.noiseLevel = input.noiseLevel;
  }

  if (input.tableSpace && (TABLE_SPACES as readonly string[]).includes(input.tableSpace)) {
    clean.tableSpace = input.tableSpace;
  }

  return clean;
}

/**
 * Format metadata into display rows for the detail page / venue page.
 * Returns only fields that are present — the UI renders what it gets.
 */
export function formatMetadata(
  cafe: Pick<CafeStation, "metadata">,
): Array<{ label: string; value: string }> {
  const m = cafe.metadata;
  if (!m) return [];

  const rows: Array<{ label: string; value: string }> = [];

  if (m.priceTier) {
    rows.push({ label: "Price", value: PRICE_TIER_LABELS[m.priceTier] ?? m.priceTier });
  }

  if (m.milkOptions && m.milkOptions.length > 0) {
    rows.push({
      label: "Milk",
      value: m.milkOptions.map((milk) => MILK_LABELS[milk] ?? milk).join(", "),
    });
  }

  if (typeof m.powerOutlets === "boolean") {
    rows.push({ label: "Power", value: m.powerOutlets ? "Outlets available" : "No outlets" });
  }

  if (m.seating) {
    rows.push({ label: "Seating", value: SEATING_LABELS[m.seating] ?? m.seating });
  }

  if (m.noiseLevel) {
    rows.push({ label: "Noise", value: NOISE_LEVEL_LABELS[m.noiseLevel] ?? m.noiseLevel });
  }

  if (m.tableSpace) {
    rows.push({ label: "Table space", value: TABLE_SPACE_LABELS[m.tableSpace] ?? m.tableSpace });
  }

  if (m.wifiNetwork) {
    rows.push({ label: "WiFi", value: m.wifiNetwork });
  }

  return rows;
}

/**
 * Compact chip strings for station cards — short enough to sit alongside
 * the existing vibe chips. Returns 0-3 chips.
 */
export function metadataChips(cafe: Pick<CafeStation, "metadata">): string[] {
  const m = cafe.metadata;
  if (!m) return [];

  const chips: string[] = [];

  if (m.priceTier) {
    chips.push(PRICE_TIER_LABELS[m.priceTier] ?? m.priceTier);
  }

  if (m.powerOutlets) {
    chips.push("outlets");
  }

  if (m.milkOptions?.includes("oat")) {
    chips.push("oat-milk");
  }

  if (m.noiseLevel) {
    chips.push(m.noiseLevel);
  }

  if (m.seating) {
    chips.push(m.seating);
  }

  return chips.slice(0, 3);
}
