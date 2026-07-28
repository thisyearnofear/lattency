import type { MetadataRoute } from "next";

// PWA web manifest — enables "Add to Home Screen" on mobile and installability
// in desktop browsers. Colors match the newsprint/cream identity.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lattency — café wifi, mapped like transit",
    short_name: "Lattency",
    description:
      "A crowdsourced metro map of café wifi speeds. Cafés become stations; speed tiers become transit lines.",
    start_url: "/london",
    display: "standalone",
    background_color: "#F4ECD8",
    theme_color: "#1A1612",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
    categories: ["productivity", "travel", "utilities"],
  };
}
