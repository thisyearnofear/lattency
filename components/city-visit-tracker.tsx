"use client";

import { useEffect } from "react";

const STORAGE_KEY = "lattency:last_city";

export function CityVisitTracker({ city }: { city: string }) {
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, city);
    } catch {
      // Ignore storage errors.
    }
  }, [city]);
  return null;
}

export function getLastVisitedCity(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
