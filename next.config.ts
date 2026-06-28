import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tell Turbopack the workspace root explicitly so it stops trying to infer
  // it from a stray package-lock.json in $HOME.
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
    ],
  },
};

export default nextConfig;
