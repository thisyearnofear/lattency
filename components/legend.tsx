import type { Tier } from "@/lib/types";

type Entry = {
  tier: Tier;
  letter: string;
  name: string;
  threshold: string;
  roast: string;
  mood: string;
  isDashed?: boolean;
};

const ENTRIES: Entry[] = [
  {
    tier: "express",
    letter: "X",
    name: "Express",
    threshold: "≥ 50 Mbps",
    roast: "dark roast",
    mood: "fast forward",
  },
  {
    tier: "local",
    letter: "L",
    name: "Local",
    threshold: "10 – 49 Mbps",
    roast: "medium roast",
    mood: "the everyday network",
  },
  {
    tier: "suspended",
    letter: "S",
    name: "Suspended",
    threshold: "< 10 Mbps",
    roast: "decaf",
    mood: "service intermittent",
    isDashed: true,
  },
];

// A small coffee-bean glyph — the project's quiet coffee signal, used as a
// bullet beside the roast label.
function CoffeeBean({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <ellipse
        cx={12}
        cy={12}
        rx={6.5}
        ry={9.5}
        transform="rotate(28 12 12)"
        fill="currentColor"
      />
      <path
        d="M12 3.5 C 9 8, 15 16, 12 20.5"
        fill="none"
        stroke="var(--color-cream)"
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    </svg>
  );
}

const TIER_BG: Record<Tier, string> = {
  express: "bg-express",
  local: "bg-local",
  suspended: "bg-suspended",
};
const TIER_STROKE: Record<Tier, string> = {
  express: "stroke-express",
  local: "stroke-local",
  suspended: "stroke-suspended",
};
const TIER_TEXT: Record<Tier, string> = {
  express: "text-express",
  local: "text-local",
  suspended: "text-suspended",
};

export function Legend() {
  return (
    <section
      className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10 mt-6 pt-6 border-t border-ink/80"
      aria-label="Map legend — three lines of service"
    >
      <h2 className="stamp md:col-span-3 coffee-ring inline-block">
        Lines of service
      </h2>

      {ENTRIES.map((e) => (
        <article
          key={e.tier}
          className="flex items-start gap-4 border-l border-cream-deep pl-4 first:border-l-0 first:pl-0 md:border-l md:pl-4 md:first:border-l md:first:pl-4"
        >
          {/* Tier badge */}
          <div
            className={`${TIER_BG[e.tier]} text-cream font-display font-black text-3xl w-12 h-14 flex items-center justify-center shrink-0`}
          >
            {e.letter}
          </div>

          <div className="flex-1 min-w-0">
            {/* Mini line graphic */}
            <svg viewBox="0 0 220 14" className="w-full h-3 mb-2">
              <line
                x1={0}
                y1={7}
                x2={220}
                y2={7}
                className={`${TIER_STROKE[e.tier]} ${
                  e.isDashed ? "" : "legend-line"
                }`}
                strokeWidth={6}
                strokeLinecap={e.isDashed ? "butt" : "round"}
                strokeDasharray={e.isDashed ? "12 8" : undefined}
              />
            </svg>

            <h3 className="font-display font-black uppercase tracking-wide text-xl text-ink">
              {e.name}
            </h3>
            <p className="font-mono text-[11px] tracking-[0.15em] uppercase text-ink-soft mt-1">
              {e.threshold}
            </p>
            <p className="flex items-center gap-1.5 font-mono text-[11px] tracking-[0.15em] uppercase text-ink-faint mt-1.5">
              <CoffeeBean className={`w-3 h-3 ${TIER_TEXT[e.tier]}`} />
              {e.roast}
            </p>
            <p className="font-serif italic text-base text-ink-faint mt-1">
              {e.mood}
            </p>
          </div>
        </article>
      ))}
    </section>
  );
}
