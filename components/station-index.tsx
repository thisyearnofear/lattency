import type { CafeStation, Tier } from "@/lib/types";

const TIER_BG: Record<Tier, string> = {
  express: "bg-express",
  local: "bg-local",
  suspended: "bg-suspended",
};
const TIER_LABEL: Record<Tier, string> = {
  express: "X · EXPRESS",
  local: "L · LOCAL",
  suspended: "S · SUSPENDED",
};

function initials(name: string): string {
  const words = name
    .split(/\s+/)
    .filter((w) => w.length > 0 && !/^(the|of|a)$/i.test(w));
  return words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function StationCard({ cafe, index }: { cafe: CafeStation; index: number }) {
  const ord = String(index + 1).padStart(2, "0");
  return (
    <article
      className="station-card group relative bg-cream border border-ink/15 hover:border-ink/60 hover:-translate-y-1 hover:shadow-[6px_8px_0_0_var(--color-ink)] transition-[transform,border-color,box-shadow] duration-300"
      style={{ animationDelay: `${Math.min(index * 90, 720)}ms` }}
    >
      {/* Photo / diagrammatic fallback */}
      <div className="relative aspect-[5/3] overflow-hidden bg-cream-edge">
        {/* Fallback layer — visible when image is absent or fails to load.
            Designed so the card never looks broken. */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-display font-black text-[88px] leading-none text-ink-faint/30 select-none">
            {initials(cafe.name)}
          </span>
        </div>
        {/* Tier band on the left, regardless of photo presence */}
        <div className={`absolute inset-y-0 left-0 w-1 ${TIER_BG[cafe.tier]}`} />

        {cafe.latestPhotoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cafe.latestPhotoUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover grayscale-[40%] contrast-[1.05] group-hover:grayscale-0 transition-[filter] duration-500"
          />
        )}

        {/* Tier chip top-right */}
        <div
          className={`${TIER_BG[cafe.tier]} absolute top-0 right-0 px-3 py-1.5 text-cream font-mono text-[10px] tracking-[0.2em] uppercase`}
        >
          {TIER_LABEL[cafe.tier]}
        </div>

        {/* Big edition number bottom-left */}
        <div className="absolute bottom-0 left-0 px-3 pb-1 pt-2 bg-cream/95 font-display font-black text-4xl leading-none text-ink">
          {ord}
        </div>
      </div>

      {/* Meta */}
      <div className="p-5 space-y-3">
        <h3 className="font-display font-black uppercase leading-[0.95] text-[26px] tracking-[-0.01em] text-ink">
          {cafe.name}
        </h3>

        <div className="flex items-baseline justify-between gap-3">
          <p className="font-serif italic text-ink-faint text-base">
            {cafe.neighbourhood}
          </p>
          <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-soft">
            {cafe.vibe}
          </p>
        </div>

        <div className="pt-3 border-t border-cream-deep grid grid-cols-3 gap-2 font-mono text-[11px] text-ink-soft">
          <div>
            <div className="text-[9px] tracking-[0.2em] uppercase text-ink-faint">
              Down
            </div>
            <div className="text-base text-ink font-medium tabular-nums">
              {Math.round(cafe.medianDownMbps)}
              <span className="text-[10px] text-ink-faint ml-1">Mbps</span>
            </div>
          </div>
          <div>
            <div className="text-[9px] tracking-[0.2em] uppercase text-ink-faint">
              Up
            </div>
            <div className="text-base text-ink font-medium tabular-nums">
              {cafe.medianUpMbps.toFixed(1)}
              <span className="text-[10px] text-ink-faint ml-1">Mbps</span>
            </div>
          </div>
          <div>
            <div className="text-[9px] tracking-[0.2em] uppercase text-ink-faint">
              Ping
            </div>
            <div className="text-base text-ink font-medium tabular-nums">
              {Math.round(cafe.medianLatencyMs)}
              <span className="text-[10px] text-ink-faint ml-1">ms</span>
            </div>
          </div>
        </div>

        <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-ink-faint">
          {cafe.measurementCount} measurements on file
        </p>
      </div>
    </article>
  );
}

export function StationIndex({ cafes }: { cafes: CafeStation[] }) {
  return (
    <section className="mt-24 pt-10 border-t border-ink/80">
      <div className="flex items-baseline justify-between mb-8">
        <div>
          <p className="stamp">Section II</p>
          <h2 className="font-display font-black uppercase text-5xl md:text-6xl tracking-[-0.02em] text-ink mt-1">
            Stations · Twelve
          </h2>
        </div>
        <p className="font-serif italic text-ink-faint hidden md:block">
          alphabetised by edition number
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-10">
        {cafes.map((c, i) => (
          <StationCard key={c.id} cafe={c} index={i} />
        ))}
      </div>
    </section>
  );
}
