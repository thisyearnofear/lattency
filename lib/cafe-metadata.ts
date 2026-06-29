// Single source of truth for café metadata — the coffee-lover details that
// transform lattency from a speed-test tool into a workspace finder.
//
// Vocabulary is deliberately small and fixed so chips stay legible and the
// UI doesn't become a form. Contributors pick from a menu; they don't
// free-type.

import type { CafeMetadata, CafeStation } from "./types";

export const MILK_OPTIONS = ["dairy", "oat", "soy", "almond"] as const;
export const PRICE_TIERS = ["budget", "mid", "premium"] as const;
export const SEATING_TYPES = ["bar", "tables", "lounge", "mixed"] as const;

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

  return clean;
}

/**
 * Format metadata into display rows for the detail page / café page.
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

  if (m.seating) {
    chips.push(m.seating);
  }

  return chips.slice(0, 3);
}
