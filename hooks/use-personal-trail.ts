"use client";

// Personal trail — remembers which stations this browser has contributed to
// and draws a connecting "your line" across the map. No account needed; the
// trail is local to the device, keyed by city so each network gets its own.
// It's the quiet reward for contributing twice: the map becomes personal.

import { useCallback, useState } from "react";

const STORAGE_KEY = "lattency:trail:v1";

export type Trail = Record<string, Array<{ name: string; lat: number; lng: number }>>;

function readTrail(): Trail {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Trail;
  } catch {
    return {};
  }
}

export function usePersonalTrail() {
  const [trail, setTrail] = useState<Trail>(readTrail);

  const addToTrail = useCallback((city: string, name: string, lat: number, lng: number) => {
    setTrail((prev) => {
      const list = prev[city] ?? [];
      if (list.some((p) => p.name === name)) return prev;
      const next = { ...prev, [city]: [...list, { name, lat, lng }] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage full or unavailable — the in-memory trail still works.
      }
      return next;
    });
  }, []);

  return { trail, addToTrail };
}
