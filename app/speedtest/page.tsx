import type { Metadata } from "next";
import { TopNav } from "@/components/top-nav";
import { SpeedTestPage } from "@/components/speed-test-page";

export const metadata: Metadata = {
  title: "Test my wifi · Lattency",
  description:
    "Run a free in-browser speed test against the nearest Vercel edge. See your tier — Express, Local, or Suspended — from anywhere in the world.",
};

export default function SpeedTestRoute() {
  return (
    <>
      <TopNav current="app" />
      <SpeedTestPage />
    </>
  );
}
