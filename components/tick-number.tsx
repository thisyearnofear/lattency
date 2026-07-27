"use client";

// TickNumber — an odometer for speed medians. When a reading lands (or a
// café detail hydrates with fresh numbers), the value counts to its target
// with an ease-out ramp instead of snapping. Reads feel like an instrument
// settling, not a label swapping.

import { useEffect, useRef, useState } from "react";

const TICK_MS = 550;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function TickNumber({
  value,
  decimals = 0,
}: {
  value: number;
  decimals?: number;
}) {
  const [disp, setDisp] = useState(value);
  const prev = useRef(value);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const from = prev.current;
    const to = value;
    prev.current = value;
    // First mount, or no change — render the target as-is.
    if (from === to) {
      setDisp(to);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / TICK_MS);
      setDisp(from + (to - from) * easeOutCubic(p));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value]);

  return <>{disp.toFixed(decimals)}</>;
}
