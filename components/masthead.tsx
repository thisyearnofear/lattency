export function Masthead() {
  return (
    <header className="relative">
      {/* Top hairline + edition stamp */}
      <div className="flex items-center justify-between border-b border-ink/80 pb-3">
        <span className="stamp">Edition 01 · 2026 · Vol I</span>
        <span className="stamp">
          Nairobi · Live from <span className="text-express">PG_DB</span>
        </span>
      </div>

      {/* Title block */}
      <div className="grid grid-cols-12 gap-6 pt-8 pb-10">
        <div className="col-span-12 lg:col-span-8 relative">
          {/* Steam wisps — coffee identity signal, rising from the title */}
          <svg
            aria-hidden="true"
            viewBox="0 0 60 80"
            className="absolute -top-2 right-2 lg:right-10 w-10 md:w-14 h-auto text-ink-faint opacity-70 hidden sm:block"
          >
            <path
              d="M14 70 Q 8 56 14 44 T 14 22 Q 8 14 14 4"
              className="steam-wisp"
              stroke="currentColor"
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M30 70 Q 36 54 30 40 T 30 18 Q 36 12 30 2"
              className="steam-wisp"
              stroke="currentColor"
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M46 70 Q 40 58 46 46 T 46 26 Q 40 18 46 8"
              className="steam-wisp"
              stroke="currentColor"
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
            />
          </svg>

          <h1
            className="mast-title font-display font-black uppercase leading-[0.82] tracking-[-0.02em] text-ink"
            style={{ fontSize: "clamp(80px, 14vw, 220px)" }}
          >
            Lattency
          </h1>
          <p className="font-serif italic text-ink-soft text-2xl md:text-3xl mt-4">
            a metro map of the city&rsquo;s wifi · brewed in nairobi
          </p>
        </div>

        <div className="col-span-12 lg:col-span-4 lg:pl-8 lg:border-l lg:border-cream-deep flex flex-col justify-end gap-4">
          <p className="font-mono text-[13px] leading-relaxed text-ink-soft">
            Twelve cafés. Three lines. Speed measurements crowdsourced from
            anyone with a connection — turned into the only metro map of
            Nairobi where the stations don&rsquo;t move but the lines do.
          </p>
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-ink-faint scroll-cue">
            ↓ scroll for the stations index
          </p>
        </div>
      </div>

      {/* Bottom hairline */}
      <div className="border-b border-ink/80" />
    </header>
  );
}
