import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @nimiq/core loads WASM + worker_threads + comlink; it can't be bundled
  // by Turbopack. Marking it external makes Node load it natively at runtime.
  serverExternalPackages: ["@nimiq/core"],
  // Tell Turbopack the workspace root explicitly so it stops trying to infer
  // it from a stray package-lock.json in $HOME.
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      // Contributor uploads may land on Base44 / CDN hosts later; keep Unsplash
      // for any editorial assets. Picsum placeholders were removed.
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

export default nextConfig;
