import type { Metadata } from "next";
import { TopNav } from "@/components/top-nav";
import { ContributorProfile } from "@/components/contributor-profile";

export const metadata: Metadata = {
  title: "My line",
  description:
    "Your stations, your rank, and your standing across the Lattency network.",
};

export default function MeRoute() {
  return (
    <>
      <TopNav current="app" />
      <ContributorProfile />
    </>
  );
}
