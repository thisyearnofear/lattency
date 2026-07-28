import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Auth and API routes don't need indexing.
      disallow: ["/api/", "/auth/"],
    },
    sitemap: "https://lattency.vercel.app/sitemap.xml",
  };
}
