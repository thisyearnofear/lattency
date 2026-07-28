import type { MetadataRoute } from "next";
import { getCafes } from "@/lib/cafes";
import { CITY_ORDER, cityPath } from "@/lib/cities";
import { slugify } from "@/lib/slug";

// Sitemap — lists every city page and every café page so search engines can
// discover them without crawling. Café slugs are derived from names (see
// lib/slug.ts), so we enumerate from the same data the route uses.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://lattency.vercel.app";
  const now = new Date();

  const cityPages = CITY_ORDER.map((cityId) => ({
    url: `${base}${cityPath(cityId)}`,
    lastModified: now,
    changeFrequency: "hourly" as const,
    priority: 0.9,
  }));

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${base}/tour`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/partners`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
  ];

  // All café pages — fetch from every city so user-generated cafés are included.
  let cafePages: MetadataRoute.Sitemap = [];
  try {
    const cafes = await getCafes({ all: true });
    cafePages = cafes.map((cafe) => ({
      url: `${base}/cafes/${slugify(cafe.name)}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.7,
    }));
  } catch {
    // If the backend is unreachable, ship the city + static pages alone.
  }

  return [...cityPages, ...staticPages, ...cafePages];
}
