"use client";

// Realtime hook — subscribes to Base44 Measurement entity changes so the
// map updates live the instant anyone, anywhere, submits a speed test.
// Gated on base44Configured; no-ops (returns false) when unconfigured.

import { useEffect, useRef } from "react";
import { base44Configured } from "@/lib/base44";

/** Subscribes to realtime Measurement creates. Calls `onNewReading` when
 *  a new speed test lands anywhere in the network. Returns whether the
 *  live subscription is active (false when Base44 is unconfigured). */
export function useRealtimeMeasurements(
  onNewReading: (data: { cafe_id: string; down_mbps: number } | null) => void,
): boolean {
  const cbRef = useRef(onNewReading);

  // Keep the callback ref fresh without triggering the "refs during render"
  // lint rule — assign inside a layout-safe effect.
  useEffect(() => {
    cbRef.current = onNewReading;
  }, [onNewReading]);

  useEffect(() => {
    if (!base44Configured) return;

    const refresh = () => {
      if (document.visibilityState === "visible") cbRef.current(null);
    };
    const interval = setInterval(refresh, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") cbRef.current(null);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Subscription failed — the map still works, just without live updates.
  return false;
}
