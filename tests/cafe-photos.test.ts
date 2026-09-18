import { describe, expect, it } from "vitest";
import { cafePhotoUrl, resolveCafePhoto } from "@/lib/cafe-photos";
import { slugifyCityName } from "@/lib/cities";

describe("cafePhotoUrl", () => {
  it("returns a stable local coffee still for a seed", () => {
    const a = cafePhotoUrl("ozone-ldn");
    const b = cafePhotoUrl("ozone-ldn");
    expect(a).toBe(b);
    expect(a).toMatch(/^\/cafe-photos\/.+\.svg$/);
  });

  it("spreads seeds across variants", () => {
    const urls = new Set(
      ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map(cafePhotoUrl),
    );
    expect(urls.size).toBeGreaterThan(1);
  });
});

describe("resolveCafePhoto", () => {
  it("keeps real uploads", () => {
    expect(resolveCafePhoto("data:image/jpeg;base64,abc", "x")).toBe(
      "data:image/jpeg;base64,abc",
    );
  });

  it("rewrites picsum placeholders", () => {
    const out = resolveCafePhoto(
      "https://picsum.photos/seed/ozone-ldn/600/400",
      "ozone-ldn",
    );
    expect(out).toMatch(/^\/cafe-photos\//);
  });

  it("fills null with brand art", () => {
    expect(resolveCafePhoto(null, "ldn-1")).toMatch(/^\/cafe-photos\//);
  });
});

describe("slugifyCityName", () => {
  it("slugifies free text", () => {
    expect(slugifyCityName("Cape Town")).toBe("cape-town");
    expect(slugifyCityName("  Berlin!! ")).toBe("berlin");
  });
});
