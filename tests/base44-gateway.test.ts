import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const createClient = vi.fn((config: unknown) => ({ __client: true, config }));
vi.mock("@base44/sdk", () => ({ createClient: (config: unknown) => createClient(config) }));

import { getBase44Gateway, ContributionGatewayUnavailable } from "@/lib/base44-gateway";

describe("getBase44Gateway", () => {
  beforeEach(() => {
    createClient.mockClear();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("throws before creating a client when config is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE44_APP_ID", "");
    vi.stubEnv("LATTENCY_SERVER_KEY", "");
    expect(() => getBase44Gateway()).toThrow(ContributionGatewayUnavailable);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("throws on a short secret", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE44_APP_ID", "app-1");
    vi.stubEnv("LATTENCY_SERVER_KEY", "short");
    expect(() => getBase44Gateway()).toThrow(ContributionGatewayUnavailable);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("passes the secret only via the private header", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE44_APP_ID", "app-1");
    vi.stubEnv("LATTENCY_SERVER_KEY", "k".repeat(32));
    getBase44Gateway();
    const args = createClient.mock.calls[0]![0] as unknown as { headers: Record<string, string> };
    expect(args.headers["x-lattency-server-key"]).toBe("k".repeat(32));
    expect(JSON.stringify(args)).toContain("x-lattency-server-key");
  });
});
