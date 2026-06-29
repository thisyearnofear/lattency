import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { auth } from "@/auth";
import {
  getUserMeasurements,
  getUserCreatedCafes,
  type UserMeasurementRow,
  type UserCreatedCafeRow,
} from "@/lib/contributions";

export const metadata: Metadata = {
  title: "Your contributions · Lattency",
  description: "Your speed tests, the cafés you've mapped, the bounties you've helped close.",
};

// Sessions live in Aurora — read on every request, no JWT to cache. We
// could `revalidate = 60` later if traffic warrants.
export const dynamic = "force-dynamic";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function pathForCity(city: string): string {
  return city === "sf" ? "/sf" : "/";
}

function MeasurementRow({ m }: { m: UserMeasurementRow }) {
  return (
    <li className="border border-ink/15 bg-cream p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <Link
            href={`/cafes/${m.cafeSlug}`}
            className="font-display font-black uppercase text-xl tracking-[-0.01em] text-ink hover:text-express transition-colors"
          >
            {m.cafeName}
          </Link>
          {m.isOutlier && (
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase bg-suspended text-cream px-1.5 py-[2px]">
              outlier
            </span>
          )}
        </div>
        <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-faint mt-1">
          {m.neighbourhood} · {m.city.toUpperCase()} · {m.testMethod === "browser-auto" ? "auto-test" : "manual"}
        </p>
      </div>
      <div className="flex items-baseline gap-5 text-right shrink-0 font-mono tabular-nums">
        <div>
          <p className="text-[9px] tracking-[0.2em] uppercase text-ink-faint">
            Down
          </p>
          <p className="text-lg text-ink mt-0.5">
            {Math.round(m.downMbps)}
            <span className="text-[9px] text-ink-faint ml-1">Mbps</span>
          </p>
        </div>
        <div>
          <p className="text-[9px] tracking-[0.2em] uppercase text-ink-faint">
            Ping
          </p>
          <p className="text-lg text-ink mt-0.5">
            {Math.round(m.latencyMs)}
            <span className="text-[9px] text-ink-faint ml-1">ms</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[9px] tracking-[0.2em] uppercase text-ink-faint">
            When
          </p>
          <p className="text-[11px] text-ink-soft mt-0.5">
            {formatDateTime(m.measuredAt)}
          </p>
        </div>
      </div>
    </li>
  );
}

function CafeRow({ c }: { c: UserCreatedCafeRow }) {
  return (
    <li className="border border-ink/15 bg-cream p-4 flex items-center justify-between gap-3">
      <div>
        <Link
          href={`/cafes/${c.cafeSlug}`}
          className="font-display font-black uppercase text-xl tracking-[-0.01em] text-ink hover:text-express transition-colors"
        >
          {c.cafeName}
        </Link>
        <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-faint mt-1">
          {c.neighbourhood} · {c.city.toUpperCase()}
        </p>
      </div>
      <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-soft text-right">
        added
        <br />
        {formatDateTime(c.createdAt)}
      </p>
    </li>
  );
}

export default async function MePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/me");
  }
  const userId = session.user.id;
  const [measurements, cafes] = await Promise.all([
    getUserMeasurements(userId),
    getUserCreatedCafes(userId),
  ]);

  return (
    <>
      <TopNav current="me" />

      <main className="mx-auto max-w-[1100px] px-6 md:px-12 pt-10 pb-24">
        <p className="stamp">Your contributions</p>
        <h1
          className="font-display font-black uppercase text-ink leading-[0.92] tracking-[-0.02em] mt-3"
          style={{ fontSize: "clamp(40px, 7vw, 80px)" }}
        >
          {session.user.email ? session.user.email : "Hello there"}.
        </h1>
        <p className="font-serif italic text-ink-soft text-xl mt-4 max-w-2xl">
          Every reading you&rsquo;ve logged and every café you&rsquo;ve put
          on the map. When the bounty payout rail ships, this view also
          surfaces what you&rsquo;ve earned.
        </p>

        {/* Stat summary band */}
        <div className="grid grid-cols-3 gap-3 mt-8 pt-6 border-t border-ink/15">
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-faint">
              Readings
            </p>
            <p className="font-display font-black text-4xl text-ink mt-1 tabular-nums">
              {measurements.length}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-faint">
              Cafés added
            </p>
            <p className="font-display font-black text-4xl text-ink mt-1 tabular-nums">
              {cafes.length}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-faint">
              Coffees earned
            </p>
            <p className="font-display font-black text-4xl text-ink-faint mt-1 tabular-nums">
              —
              <span className="font-mono text-[10px] text-ink-faint ml-2 align-middle normal-case tracking-normal">
                payout rail in v9.3
              </span>
            </p>
          </div>
        </div>

        {/* Readings list */}
        <section className="mt-12">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-display font-black uppercase text-3xl tracking-[-0.01em] text-ink">
              Your readings
            </h2>
            <Link
              href="/?contribute=1"
              className="font-mono text-[11px] tracking-[0.22em] uppercase text-ink-soft hover:text-ink transition-colors inline-flex items-center gap-1.5"
            >
              Map another café <span aria-hidden>→</span>
            </Link>
          </div>

          {measurements.length === 0 ? (
            <div className="border border-dashed border-ink/30 bg-cream-edge/40 p-8 text-center">
              <p className="font-serif italic text-ink-soft text-lg">
                You haven&rsquo;t logged any readings yet. Map a café you&rsquo;re
                sitting in to add the first one — the form runs a real
                speed test from your browser and adds the reading the
                moment it commits.
              </p>
              <Link
                href="/?contribute=1"
                className="bg-ink text-cream font-mono text-xs tracking-[0.22em] uppercase px-4 py-3 inline-flex items-center gap-1.5 hover:bg-ink/90 transition-colors mt-5"
              >
                <span aria-hidden>+</span> Map a café
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {measurements.map((m) => (
                <MeasurementRow key={m.measurementId} m={m} />
              ))}
            </ul>
          )}
        </section>

        {/* Created cafés list */}
        <section className="mt-14">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-display font-black uppercase text-3xl tracking-[-0.01em] text-ink">
              Cafés you&rsquo;ve added
            </h2>
          </div>

          {cafes.length === 0 ? (
            <div className="border border-dashed border-ink/30 bg-cream-edge/40 p-8 text-center">
              <p className="font-serif italic text-ink-soft text-lg">
                You haven&rsquo;t added a café to the map yet. The first
                one you map gets its own page at{" "}
                <code className="font-mono text-ink">/cafes/&lt;slug&gt;</code>
                ; you&rsquo;ll see it listed here from then on.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {cafes.map((c) => (
                <CafeRow key={c.cafeId} c={c} />
              ))}
            </ul>
          )}
        </section>

        <p className="font-serif italic text-ink-soft text-base mt-12 max-w-2xl">
          Want to back-fill the network where there&rsquo;s no coverage
          yet? Stake your own bounty for an area you care about and pay it
          forward when the next contributor walks in.{" "}
          <Link
            href={`/partners#bounties`}
            className="underline underline-offset-4 hover:text-ink"
          >
            See open bounties →
          </Link>{" "}
          ·{" "}
          <Link
            href={pathForCity("nairobi")}
            className="underline underline-offset-4 hover:text-ink"
          >
            Back to the map →
          </Link>
        </p>
      </main>
    </>
  );
}
