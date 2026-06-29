import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCafes, getCafeBySlug } from "@/lib/cafes";
import { slugify } from "@/lib/slug";
import { TopNav } from "@/components/top-nav";
import { CafePage } from "@/components/cafe-page";

// Pre-render all 12 known café pages at build time, revalidate every minute.
// New cafés (post-build) fall back to on-demand SSR via `dynamicParams`.
export const revalidate = 60;
export const dynamicParams = true;

export async function generateStaticParams() {
  // Pre-render slugs from every known city, so /cafes/sightglass-coffee-soma
  // and /cafes/about-thyme both ship as static HTML at build time.
  const [nairobi, sf] = await Promise.all([
    getCafes({ city: "nairobi" }),
    getCafes({ city: "sf" }),
  ]);
  return [...nairobi, ...sf].map((c) => ({ slug: slugify(c.name) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const cafe = await getCafeBySlug(slug);
  if (!cafe) return { title: "Not found" };

  const tier = cafe.tier[0].toUpperCase() + cafe.tier.slice(1);
  const median = Math.round(cafe.medianDownMbps);
  const blurb = `${tier} line · ${median} Mbps median${cafe.vibe ? ` · ${cafe.vibe}` : ""}`;
  const title = `${cafe.name} · ${cafe.neighbourhood}`;

  return {
    title,
    description: blurb,
    openGraph: {
      type: "article",
      title: `${cafe.name} · Lattency`,
      description: `${blurb}. ${cafe.neighbourhood}, Nairobi.`,
      siteName: "Lattency",
    },
    twitter: {
      card: "summary_large_image",
      title: `${cafe.name} · ${tier} line`,
      description: blurb,
    },
  };
}

export default async function CafeRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cafe = await getCafeBySlug(slug);
  if (!cafe) notFound();

  return (
    <>
      <TopNav current="app" />
      <CafePage cafe={cafe} />
    </>
  );
}
