import { redirect } from "next/navigation";
import { cityPath, DEFAULT_CITY_ID } from "@/lib/cities";

// The root redirects to the default city. Every curated city lives at
// /{cityId}, served by the dynamic route app/[city]/page.tsx.
export default function Home() {
  redirect(cityPath(DEFAULT_CITY_ID));
}
