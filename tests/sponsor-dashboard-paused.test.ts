import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const requestPayment = vi.fn();

vi.mock("@/hooks/use-nimiq", () => ({
  useNimiq: () => ({
    provider: { requestPayment },
    address: "NQ" + "A".repeat(38),
    inMiniApp: true,
    loading: false,
  }),
}));

describe("SponsorDashboard while payments are paused", () => {
  it("renders the submit as disabled and never requests a payment", async () => {
    const { SponsorDashboard } = await import(
      "@/components/sponsor-dashboard"
    );
    const html = renderToStaticMarkup(createElement(SponsorDashboard));
    expect(html).toContain("Funding paused");
    expect(html).toContain("Bounty funding and payouts are paused");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>/);
    expect(requestPayment).not.toHaveBeenCalled();
  });
});
