// Venue metadata vocabulary — the fixed menu contributors pick from.
// Shared between the Next.js app (lib/cafe-metadata.ts re-exports the
// constants) and the Deno measurement-gateway (venue-fact/venue-photo
// actions), so both ends of a micro-contribution validate against the
// same vocabulary. Keep it small and fixed: contributors pick from a
// menu; they don't free-type.

export const VENUE_TYPES = [
  "cafe",
  "coworking",
  "hotel-lobby",
  "library",
  "hybrid",
] as const;

export const MILK_OPTIONS = ["dairy", "oat", "soy", "almond"] as const;
export const PRICE_TIERS = ["budget", "mid", "premium"] as const;
export const SEATING_TYPES = ["bar", "tables", "lounge", "mixed"] as const;
export const NOISE_LEVELS = ["quiet", "moderate", "loud"] as const;
export const TABLE_SPACES = ["small", "standard", "large"] as const;

// The Cafe entity fields a single-fact micro-contribution may write.
// Anything outside this list is rejected before a Cafe.update happens —
// the gateway is the only write path through closed RLS, so this
// allowlist IS the write surface.
export const VENUE_FACT_FIELDS = [
  "power_outlets",
  "seating",
  "noise_level",
  "table_space",
  "wifi_network",
  "price_tier",
  "milk_options",
  "venue_type",
] as const;

export type VenueFactField = (typeof VENUE_FACT_FIELDS)[number];

export function isVenueFactField(field: unknown): field is VenueFactField {
  return (
    typeof field === "string" &&
    (VENUE_FACT_FIELDS as readonly string[]).includes(field)
  );
}

export type VenueFactResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

function enumFact(
  vocab: readonly string[],
  label: string,
  value: unknown,
): VenueFactResult {
  if (typeof value !== "string" || !vocab.includes(value)) {
    return { ok: false, error: `${label} must be one of: ${vocab.join(", ")}` };
  }
  return { ok: true, value };
}

/**
 * Validate a single fact value against the vocabulary for its field.
 * Returns the normalized value to write. For `milk_options` the value is
 * one or more valid options and the result is a deduped string[] — the
 * caller merges it into the café's existing array.
 */
export function venueFactValue(
  field: VenueFactField,
  value: unknown,
): VenueFactResult {
  switch (field) {
    case "power_outlets":
      if (typeof value !== "boolean") {
        return { ok: false, error: "power_outlets must be true or false" };
      }
      return { ok: true, value };
    case "seating":
      return enumFact(SEATING_TYPES, "seating", value);
    case "noise_level":
      return enumFact(NOISE_LEVELS, "noise_level", value);
    case "table_space":
      return enumFact(TABLE_SPACES, "table_space", value);
    case "price_tier":
      return enumFact(PRICE_TIERS, "price_tier", value);
    case "venue_type":
      return enumFact(VENUE_TYPES, "venue_type", value);
    case "wifi_network": {
      if (typeof value !== "string") {
        return { ok: false, error: "wifi_network must be a string" };
      }
      const clean = value.trim();
      if (!clean || clean.length > 64) {
        return {
          ok: false,
          error: "wifi_network must be 1–64 characters",
        };
      }
      return { ok: true, value: clean };
    }
    case "milk_options": {
      const raw = Array.isArray(value) ? value : [value];
      if (
        raw.length === 0 ||
        raw.length > MILK_OPTIONS.length ||
        raw.some(
          (v) =>
            typeof v !== "string" ||
            !(MILK_OPTIONS as readonly string[]).includes(v),
        )
      ) {
        return {
          ok: false,
          error: `milk_options must be one of: ${MILK_OPTIONS.join(", ")}`,
        };
      }
      return { ok: true, value: [...new Set(raw as string[])] };
    }
  }
}

// A ~700KB image is ~950K chars of base64; cap the data-url envelope just
// above that so a larger payload is rejected before it reaches storage.
export const VENUE_PHOTO_MAX_CHARS = 1_000_000;
const VENUE_PHOTO_PREFIX = /^data:image\/(jpe?g|png);base64,/i;

/** Validate a venue photo payload — JPEG/PNG data URL under the size cap. */
export function venuePhotoError(photo: unknown): string | null {
  if (typeof photo !== "string" || photo.length === 0) {
    return "photo required";
  }
  if (!VENUE_PHOTO_PREFIX.test(photo)) {
    return "photo must be a JPEG or PNG data URL (data:image/...;base64,)";
  }
  if (photo.length > VENUE_PHOTO_MAX_CHARS) {
    return "photo too large (max ~700KB)";
  }
  return null;
}
