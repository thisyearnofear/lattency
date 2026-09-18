/**
 * On-brand café photo helpers.
 *
 * Seeded mock venues and empty photo slots use local coffee/workspace
 * illustrations instead of random remote placeholders. Real contributor
 * uploads (data URLs or hosted files) always win.
 */

const VARIANTS = [
  "pour-over",
  "espresso",
  "latte-art",
  "laptop-latte",
  "filter-drip",
  "counter",
  "takeaway",
  "flat-white",
] as const;

export type CafePhotoVariant = (typeof VARIANTS)[number];

/** Stable hash → variant index so the same café always gets the same still. */
function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** Public path for a deterministic coffee still. */
export function cafePhotoUrl(seed: string): string {
  const variant = VARIANTS[hashSeed(seed) % VARIANTS.length];
  return `/cafe-photos/${variant}.svg`;
}

/**
 * Prefer a real upload; rewrite legacy picsum URLs and fill nulls with
 * on-brand coffee art keyed by café id / name.
 */
export function resolveCafePhoto(
  photoUrl: string | null | undefined,
  seed: string,
): string {
  if (
    photoUrl &&
    !photoUrl.includes("picsum.photos") &&
    !photoUrl.includes("fastly.picsum.photos")
  ) {
    return photoUrl;
  }
  return cafePhotoUrl(seed);
}
