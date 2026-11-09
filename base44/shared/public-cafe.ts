const PUBLIC_CAFE_KEYS = [
  "id",
  "name",
  "neighbourhood",
  "latitude",
  "longitude",
  "vibe",
  "venue_type",
  "city",
  "price_tier",
  "milk_options",
  "power_outlets",
  "seating",
  "noise_level",
  "table_space",
  "wifi_network",
  "photo_url",
  "ai_summary",
] as const;

export function publicCafe<T extends object>(cafe: T) {
  const row = cafe as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of PUBLIC_CAFE_KEYS) {
    if (key in row) out[key] = row[key];
  }
  return out;
}

const CAFE_WRITE_KEYS = [
  "name",
  "neighbourhood",
  "latitude",
  "longitude",
  "vibe",
  "venue_type",
  "city",
  "price_tier",
  "milk_options",
  "power_outlets",
  "seating",
  "noise_level",
  "table_space",
  "wifi_network",
  "photo_url",
  "created_by_ip_hash",
  "created_by_user_id",
  "referred_by",
] as const;

export function cafeRecord(cafe: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const key of CAFE_WRITE_KEYS) {
    out[key] = cafe[key] ?? null;
  }
  return out;
}
