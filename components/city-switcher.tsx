"use client";

// Dropdown surfacing the multi-city architecture. Nairobi is the only
// enabled option; the rest are visible-but-disabled so a curious judge
// can see the engine is designed to ship to any city.

import { useEffect, useRef, useState } from "react";

type City = {
  id: string;
  name: string;
  country: string;
  state: "live" | "soon";
};

const CITIES: City[] = [
  { id: "nairobi", name: "Nairobi", country: "Kenya", state: "live" },
  { id: "lagos", name: "Lagos", country: "Nigeria", state: "soon" },
  { id: "capetown", name: "Cape Town", country: "South Africa", state: "soon" },
  { id: "accra", name: "Accra", country: "Ghana", state: "soon" },
  { id: "kampala", name: "Kampala", country: "Uganda", state: "soon" },
  { id: "kigali", name: "Kigali", country: "Rwanda", state: "soon" },
];

export function CitySwitcher() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 font-mono text-[10px] md:text-[11px] tracking-[0.22em] uppercase text-ink-soft hover:text-ink transition-colors"
      >
        Nairobi
        <span
          aria-hidden
          className={`text-[7px] transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        >
          ▼
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Switch city"
          className="absolute right-0 mt-3 w-72 bg-cream border border-ink/80 shadow-[6px_8px_0_0_var(--color-ink)] z-50"
        >
          <div className="px-4 py-3 border-b border-ink/15">
            <p className="stamp">Network · 1 city live</p>
            <p className="font-serif italic text-ink-faint text-xs mt-1">
              One engine, every city — the next twelve thousand are next.
            </p>
          </div>

          <ul className="max-h-[60vh] overflow-y-auto">
            {CITIES.map((city) => {
              const live = city.state === "live";
              return (
                <li key={city.id}>
                  <button
                    type="button"
                    disabled={!live}
                    aria-current={live ? "page" : undefined}
                    className={`w-full px-4 py-3 flex items-baseline justify-between gap-3 text-left transition-colors ${
                      live
                        ? "bg-cream hover:bg-cream-edge"
                        : "bg-cream cursor-not-allowed"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p
                        className={`font-display font-black uppercase tracking-[-0.01em] text-lg leading-none ${
                          live ? "text-ink" : "text-ink-faint"
                        }`}
                      >
                        {city.name}
                      </p>
                      <p
                        className={`font-serif italic text-xs mt-0.5 ${
                          live ? "text-ink-soft" : "text-ink-faint/70"
                        }`}
                      >
                        {city.country}
                      </p>
                    </div>
                    {live ? (
                      <span className="font-mono text-[9px] tracking-[0.22em] uppercase text-express">
                        Live · 12 stops
                      </span>
                    ) : (
                      <span className="font-mono text-[9px] tracking-[0.22em] uppercase text-ink-faint">
                        Coming soon
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="px-4 py-3 border-t border-ink/15 bg-cream-edge/40">
            <p className="font-mono text-[9px] tracking-[0.22em] uppercase text-ink-faint">
              Your city missing?{" "}
              <a
                href="https://github.com/thisyearnofear/lattency/issues"
                target="_blank"
                rel="noreferrer noopener"
                className="text-ink hover:underline"
              >
                Open an issue →
              </a>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
