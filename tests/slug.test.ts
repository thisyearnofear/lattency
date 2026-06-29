import { describe, it, expect } from "vitest";
import { slugify } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases and joins words with hyphens", () => {
    expect(slugify("About Thyme")).toBe("about-thyme");
  });
  it("drops apostrophes cleanly", () => {
    expect(slugify("Kaldi's Coffee Yaya")).toBe("kaldis-coffee-yaya");
  });
  it("collapses multiple spaces and punctuation", () => {
    expect(slugify("Brew  Bistro -- Kilimani!")).toBe("brew-bistro-kilimani");
  });
  it("handles accents", () => {
    expect(slugify("Café Réveille")).toBe("cafe-reveille");
  });
  it("is stable on repeat application", () => {
    expect(slugify(slugify("Connect Coffee Roasters"))).toBe("connect-coffee-roasters");
  });
});
