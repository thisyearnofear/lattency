"use client";

// Check-ins — privacy-preserving "I was here" confirmations. When a user
// checks in at a café, we verify their geolocation is within ~150m of the
// café's coordinates, then store only a boolean "verified" flag + optional
// receipt photo (Base64, client-side resized). The user's exact coordinates
// are NEVER stored — only the proximity result. No account needed; the
// check-ins are local to the device, keyed by café id.

import { useCallback, useState } from "react";
import { haversineKm } from "@/lib/geo";

const STORAGE_KEY = "lattency:checkins:v1";

export interface CheckIn {
  cafeId: string;
  verified: boolean;
  /** ISO timestamp of the check-in. */
  at: string;
  /** Optional receipt photo as Base64 data URL (client-side resized to 800px). */
  receiptPhoto?: string | null;
}

type CheckInMap = Record<string, CheckIn>;

function readCheckIns(): CheckInMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as CheckInMap;
  } catch {
    return {};
  }
}

const PROXIMITY_THRESHOLD_M = 150;

export function useCheckins() {
  const [checkins, setCheckins] = useState<CheckInMap>(readCheckIns);

  const checkIn = useCallback(
    (cafeId: string, cafeLat: number, cafeLng: number, receiptPhoto?: string | null) => {
      return new Promise<{ verified: boolean; distanceM: number }>((resolve, reject) => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
          reject(new Error("Geolocation not available"));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const distanceM =
              haversineKm(
                { lat: pos.coords.latitude, lng: pos.coords.longitude },
                { lat: cafeLat, lng: cafeLng },
              ) * 1000;
            const verified = distanceM <= PROXIMITY_THRESHOLD_M;
            const entry: CheckIn = {
              cafeId,
              verified,
              at: new Date().toISOString(),
              receiptPhoto: receiptPhoto ?? null,
            };
            setCheckins((prev) => {
              const next = { ...prev, [cafeId]: entry };
              try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
              } catch {
                // Storage full or unavailable — in-memory still works.
              }
              return next;
            });
            resolve({ verified, distanceM });
          },
          (err) => reject(new Error(`Location error: ${err.message}`)),
          { enableHighAccuracy: true, timeout: 10000 },
        );
      });
    },
    [],
  );

  const getCheckIn = useCallback(
    (cafeId: string): CheckIn | null => {
      return checkins[cafeId] ?? null;
    },
    [checkins],
  );

  return { checkins, checkIn, getCheckIn };
}
