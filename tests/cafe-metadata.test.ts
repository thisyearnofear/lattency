import { describe, it, expect } from "vitest";
import {
  validateCafeMetadata,
  formatMetadata,
  metadataChips,
} from "@/lib/cafe-metadata";

describe("validateCafeMetadata", () => {
  it("drops invalid price tier values silently", () => {
    expect(
      validateCafeMetadata({ priceTier: "ultra-premium" as unknown as never }),
    ).toEqual({});
  });
  it("keeps known price tier values", () => {
    expect(validateCafeMetadata({ priceTier: "mid" })).toEqual({ priceTier: "mid" });
  });
  it("filters unknown milk options out of the array", () => {
    const out = validateCafeMetadata({ milkOptions: ["dairy", "yak", "oat"] });
    expect(out.milkOptions).toEqual(["dairy", "oat"]);
  });
  it("only accepts boolean for powerOutlets", () => {
    expect(validateCafeMetadata({ powerOutlets: "yes" as unknown as never })).toEqual({});
    expect(validateCafeMetadata({ powerOutlets: false })).toEqual({ powerOutlets: false });
  });
  it("truncates wifiNetwork over 64 chars and trims whitespace", () => {
    const long = "  " + "A".repeat(100) + "  ";
    const out = validateCafeMetadata({ wifiNetwork: long });
    expect(out.wifiNetwork).toHaveLength(64);
    expect(out.wifiNetwork?.startsWith(" ")).toBe(false);
  });
  it("drops invalid seating values", () => {
    expect(
      validateCafeMetadata({ seating: "hammocks" as unknown as never }),
    ).toEqual({});
  });
});

describe("formatMetadata", () => {
  it("returns an empty list when no metadata is attached", () => {
    expect(formatMetadata({ metadata: undefined })).toEqual([]);
  });
  it("renders a label-aware price row", () => {
    const rows = formatMetadata({ metadata: { priceTier: "mid" } });
    expect(rows[0]).toEqual({ label: "Price", value: "$$" });
  });
  it("joins milk options with commas", () => {
    const rows = formatMetadata({ metadata: { milkOptions: ["dairy", "oat"] } });
    expect(rows[0].value).toBe("Dairy, Oat milk");
  });
  it("renders power outlet boolean as a human phrase", () => {
    expect(formatMetadata({ metadata: { powerOutlets: true } })[0].value).toBe(
      "Outlets available",
    );
    expect(formatMetadata({ metadata: { powerOutlets: false } })[0].value).toBe(
      "No outlets",
    );
  });
});

describe("metadataChips", () => {
  it("returns nothing when no metadata is attached", () => {
    expect(metadataChips({ metadata: undefined })).toEqual([]);
  });
  it("caps the chip output at 3", () => {
    const chips = metadataChips({
      metadata: {
        priceTier: "mid",
        powerOutlets: true,
        milkOptions: ["oat"],
        seating: "tables",
      },
    });
    expect(chips.length).toBeLessThanOrEqual(3);
  });
  it("surfaces oat-milk specifically when present", () => {
    const chips = metadataChips({ metadata: { milkOptions: ["oat"] } });
    expect(chips).toContain("oat-milk");
  });
  it("omits the outlets chip when powerOutlets is false", () => {
    const chips = metadataChips({ metadata: { powerOutlets: false } });
    expect(chips).not.toContain("outlets");
  });
});
