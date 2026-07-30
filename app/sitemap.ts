import type { MetadataRoute } from "next";
import { getCafes } from "@/lib/cafes";
import { cityPath, getLiveCities, CITY_ORDER } from "@/lib/cities";
import { slugify } from "@/lib/slug";

// Sitemap — lists every city page and every café page so search engines can
// discover them without crawling. Café slugs are derived from names (see
// lib/slug.ts), so we enumerate from the same data the route uses.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://lattency.vercel.app";
  const now = new Date();

  let cafes: Awaited<ReturnType<typeof getCafes>> = [];
  try {
    cafes = await getCafes({ all: true });
  } catch {
    // If the backend is unreachable, ship the curated cities + static pages alone.
  }

  const liveCities = getLiveCities(cafes);
  const cityPages = liveCities.map((city) => ({
    url: `${base}${cityPath(city.id)}`,
    lastModified: now,
    changeFrequency: "hourly" as const,
    priority: CITY_ORDER.includes(city.id) ? 0.9 : 0.8,
  }));

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${base}/tour`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/partners`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
  ];

  // All café pages — derived from the same fetch above.
  const cafePages = cafes.map((cafe) => ({
    url: `${base}/cafes/${slugify(cafe.name)}`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: 0.7,
  }));

  return [...cityPages, ...staticPages, ...cafePages];
}
