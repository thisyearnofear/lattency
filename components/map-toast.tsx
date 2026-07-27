"use client";

// MapToast — a tiny toast context used to celebrate map events: a new
// station landing (optimistic pin), a tier promotion, a bounty milestone.
// Styled as a stamped ticket: hard offset shadow, square corners, mono type.
// Rendered at the city-page level so the map and the contribution modal
// share one toast stack.

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Tier } from "@/lib/types";
import { TIER_COLOUR, TIER_USE } from "@/lib/map-data";

export interface MapToastItem {
  id: number;
  /** Tier colours the accent bar; omit for a neutral ink ticket. */
  tier?: Tier;
  title: string;
  body?: string;
}

const ToastContext = createContext<(t: Omit<MapToastItem, "id">) => void>(
  () => {},
);

export function useMapToast() {
  return useContext(ToastContext);
}

export function MapToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<MapToastItem[]>([]);
  const idRef = useRef(0);

  const push = useCallback((t: Omit<MapToastItem, "id">) => {
    const id = ++idRef.current;
    setItems((prev) => [...prev.slice(-2), { ...t, id }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== id));
    }, 3600);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      {/* Toast stack — top-right under the sticky nav. */}
      <div
        aria-live="polite"
        className="fixed top-16 right-3 sm:right-6 z-[900] flex flex-col gap-2 pointer-events-none w-[280px] max-w-[85vw]"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className="toast-in relative bg-cream border border-ink/80 shadow-[4px_5px_0_0_var(--color-ink)] pl-4 pr-3 py-2.5 overflow-hidden"
          >
            {/* Tier accent bar */}
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-1.5"
              style={{ background: t.tier ? TIER_COLOUR[t.tier] : "var(--color-ink)" }}
            />
            <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-ink leading-snug">
              {t.title}
            </p>
            {t.body && (
              <p
                className="font-serif italic text-[13px] leading-snug mt-0.5"
                style={{ color: t.tier ? TIER_COLOUR[t.tier] : "var(--color-ink-soft)" }}
              >
                {t.body}
              </p>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export { TIER_USE };
