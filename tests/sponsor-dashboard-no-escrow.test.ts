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

// NEXT_PUBLIC_NIMIQ_ESCROW_ADDRESS is deleted in tests/setup.ts (the dev
// .env.local sets it, so the unset state must be pinned explicitly).
describe("SponsorDashboard without an escrow address", () => {
  it("shows the not-configured note, keeps the submit disabled, and never pays", async () => {
    const { SponsorDashboard } = await import(
      "@/components/sponsor-dashboard"
    );
    const html = renderToStaticMarkup(createElement(SponsorDashboard));

    expect(html).toContain(
      "Sponsor funding is not configured on this deployment.",
    );
    expect(html).toMatch(/<button[^>]*disabled[^>]*>/);
    expect(requestPayment).not.toHaveBeenCalled();
  });
});
