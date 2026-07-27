import { redirect } from "next/navigation";
import { cityPath, DEFAULT_CITY_ID } from "@/lib/cities";

// The root redirects to the default city. Every curated city lives at
// /{cityId}, served by the dynamic route app/[city]/page.tsx.
// Query params carry over so old links like /?contribute=1 keep working.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v == null) continue;
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else qs.set(k, v);
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  redirect(`${cityPath(DEFAULT_CITY_ID)}${suffix}`);
}
