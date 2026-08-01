"use client";

// GrowBar — a progress track whose fill animates from 0 to its value on
// mount, so every bar in the app (bounty progress, rank progress, nudge
// meters) reads as something that *grew*, not something that was already
// finished. Drop-in replacement for the hand-rolled track + fill pairs.

import { useEffect, useState } from "react";

export function GrowBar({
  pct,
  className = "",
  barClassName = "",
}: {
  /** 0–100. Clamped. */
  pct: number;
  /** Classes for the track (positioning, height, bg). */
  className?: string;
  /** Classes for the fill (colour). */
  barClassName?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const clamped = Math.min(100, Math.max(0, pct));

  return (
    <div className={`relative ${className}`}>
      <div
        className={`absolute inset-y-0 left-0 transition-[width] duration-700 ease-out ${barClassName}`}
        style={{ width: mounted ? `${clamped}%` : "0%" }}
      />
    </div>
  );
}
