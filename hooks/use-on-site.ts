"use client";

import { useEffect, useState } from "react";
import { haversineKm } from "@/lib/geo";

/**
 * Distance from the contributor's current position to a venue, in km —
 * or null when it can't be determined without prompting.
 *
 * Presence is only read when the browser already has a geolocation grant
 * (the contribution form, "Find me", or a prior visit). The permissions
 * query can never surface a prompt, and getCurrentPosition is only called
 * behind a "granted" state — the project rule is that a geo prompt may
 * only ever appear from an explicit user gesture, never a mount effect.
 *
 * Unsupported permissions APIs (older Safari) resolve to null, which the
 * caller treats the same as "denied": render nothing rather than guess.
 */
export function useOnSiteKm(venue?: { lat: number; lng: number } | null): number | null {
  const [km, setKm] = useState<number | null>(null);

  useEffect(() => {
    if (!venue || typeof navigator === "undefined" || !navigator.geolocation) return;
    const perms = navigator.permissions as
      | { query?: (d: { name: string }) => Promise<{ state: string }> }
      | undefined;
    if (!perms?.query) return;

    let cancelled = false;
    void perms
      .query({ name: "geolocation" })
      .then((result) => {
        if (result.state !== "granted" || cancelled) return;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (cancelled) return;
            setKm(
              haversineKm(
                { lat: pos.coords.latitude, lng: pos.coords.longitude },
                venue,
              ),
            );
          },
          () => {},
          { timeout: 8000, maximumAge: 60_000 },
        );
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [venue?.lat, venue?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return km;
}
