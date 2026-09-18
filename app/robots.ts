import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/api/network", "/llms.txt"],
      // Write endpoints and auth don't need indexing. The read-only network
      // snapshot is allowed above — it's the dataset agents consume.
      disallow: ["/api/", "/auth/"],
    },
    sitemap: "https://lattency.vercel.app/sitemap.xml",
  };
}
