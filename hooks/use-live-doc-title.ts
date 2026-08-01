"use client";

// useLiveDocTitle — temporarily replaces the tab title while an ambient state
// is active (a speed test mid-run), restoring the previous title on exit.
// The browser tab is free real estate: watching "▼ 42 Mbps · Lattency" tick
// from another tab makes the test feel like a live instrument, not a modal.

import { useEffect } from "react";

export function useLiveDocTitle(overlay: string | null): void {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!overlay) return;
    const previous = document.title;
    document.title = overlay;
    return () => {
      document.title = previous;
    };
  }, [overlay]);
}
