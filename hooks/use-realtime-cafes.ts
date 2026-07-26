"use client";

// Realtime hook — subscribes to Base44 Measurement entity changes so the
// map updates live the instant anyone, anywhere, submits a speed test.
// Gated on base44Configured; no-ops (returns false) when unconfigured.

import { useEffect, useRef } from "react";
import { base44Configured, getBase44 } from "@/lib/base44";

/** Subscribes to realtime Measurement creates. Calls `onNewReading` when
 *  a new speed test lands anywhere in the network. Returns whether the
 *  live subscription is active (false when Base44 is unconfigured). */
export function useRealtimeMeasurements(
  onNewReading: (data: { cafe_id: string; down_mbps: number }) => void,
): boolean {
  const cbRef = useRef(onNewReading);

  // Keep the callback ref fresh without triggering the "refs during render"
  // lint rule — assign inside a layout-safe effect.
  useEffect(() => {
    cbRef.current = onNewReading;
  }, [onNewReading]);

  useEffect(() => {
    if (!base44Configured) return;

    let unsubscribe: (() => void) | null = null;

    try {
      unsubscribe = getBase44().entities.Measurement.subscribe((event) => {
        if (event.type === "create") {
          const data = event.data as { cafe_id: string; down_mbps: number };
          cbRef.current(data);
        }
      });
    } catch {
      // Subscription failed — the map still works, just without live updates.
    }

    return () => {
      unsubscribe?.();
    };
  }, []);

  return base44Configured;
}
