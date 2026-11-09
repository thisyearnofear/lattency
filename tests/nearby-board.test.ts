import { describe, it, expect } from "vitest";
import { nearbyBoardHint, NEARBY_BOARD_FAR_KM } from "@/lib/nearby-board";
import { CITIES } from "@/lib/cities";

describe("nearbyBoardHint", () => {
  it("returns null when the visitor is already near the current board", () => {
    const { centre } = CITIES.london;
    expect(nearbyBoardHint(centre.lat, centre.lng, "london")).toBeNull();
  });

  it("points at a different board when the visitor is inside its bubble", () => {
    const { centre } = CITIES.nairobi;
    const hint = nearbyBoardHint(centre.lat, centre.lng, "london");
    expect(hint).toEqual({
      kind: "near",
      cityId: "nairobi",
      cityName: "Nairobi",
      km: 0,
    });
  });

  it("returns 'far' when the visitor is outside every curated bubble", () => {
    // Middle of the South Atlantic — far from London, Nairobi, and SF.
    expect(nearbyBoardHint(-30, -15, "london")).toEqual({ kind: "far" });
  });

  it("picks the nearest board when several are in range", () => {
    const { centre } = CITIES.sf;
    const hint = nearbyBoardHint(centre.lat + 0.01, centre.lng + 0.01, "london", 2000);
    expect(hint?.kind).toBe("near");
    if (hint?.kind === "near") expect(hint.cityId).toBe("sf");
  });

  it("honours a custom far threshold", () => {
    // ~100 km north of the London centre (1° lat ≈ 111 km) — outside the
    // default bubble, back inside it when the threshold is widened.
    const justOutside = {
      lat: CITIES.london.centre.lat + (NEARBY_BOARD_FAR_KM + 20) / 111,
      lng: CITIES.london.centre.lng,
    };
    expect(nearbyBoardHint(justOutside.lat, justOutside.lng, "london")).toEqual({ kind: "far" });
    expect(
      nearbyBoardHint(justOutside.lat, justOutside.lng, "london", NEARBY_BOARD_FAR_KM + 60),
    ).toBeNull();
  });
});
