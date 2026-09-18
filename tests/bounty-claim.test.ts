import { describe, it, expect } from "vitest";
import { evaluateClaimEligibility, type ClaimableBounty } from "@/lib/bounty-claim";

/** A syntactically valid Nimiq address: NQ + exactly 38 alphanumerics. */
function nq(tag: string): string {
  return `NQ${tag.toUpperCase().replace(/[^0-9A-Z]/g, "").padEnd(38, "A").slice(0, 38)}`;
}

const ANON = "contrib-test-abc123";

function filled(overrides: Partial<ClaimableBounty> = {}): ClaimableBounty {
  return { id: "b-1", status: "open", progress: 1, target: 1, ...overrides };
}

describe("evaluateClaimEligibility", () => {
  it("allows an attributed anonymous contributor to claim a filled bounty", () => {
    const result = evaluateClaimEligibility({
      bounty: filled(),
      contributorId: ANON,
      contributors: [ANON],
      payoutAddress: nq("wallet"),
    });

    expect(result).toEqual({ eligible: true });
  });

  it("rejects a bounty that is not filled", () => {
    const result = evaluateClaimEligibility({
      bounty: filled({ progress: 1, target: 3 }),
      contributorId: ANON,
      contributors: [ANON],
      payoutAddress: nq("wallet"),
    });

    expect(result).toEqual({
      eligible: false,
      status: 400,
      error: "bounty not eligible for claim",
    });
  });

  it("rejects a terminal (paid) bounty", () => {
    const result = evaluateClaimEligibility({
      bounty: filled({ status: "paid" }),
      contributorId: ANON,
      contributors: [ANON],
      payoutAddress: nq("wallet"),
    });

    expect(result).toEqual({
      eligible: false,
      status: 400,
      error: "bounty not eligible for claim",
    });
  });

  it("accepts a filled bounty in the `claiming` state", () => {
    // Regression: the progress-update function flips completed bounties to
    // `claiming`, so requiring `open` stranded every real completion.
    const result = evaluateClaimEligibility({
      bounty: filled({ status: "claiming" }),
      contributorId: ANON,
      contributors: [ANON],
      payoutAddress: nq("wallet"),
    });

    expect(result).toEqual({ eligible: true });
  });

  it("rejects a claimant with no identity", () => {
    const result = evaluateClaimEligibility({
      bounty: filled(),
      contributorId: null,
      contributors: [ANON],
      payoutAddress: nq("wallet"),
    });

    expect(result).toEqual({
      eligible: false,
      status: 403,
      error: "claim requires the contributor identity that completed this bounty",
    });
  });

  it("rejects a filled bounty with no recorded contributors (fails closed)", () => {
    const result = evaluateClaimEligibility({
      bounty: filled(),
      contributorId: ANON,
      contributors: [],
      payoutAddress: nq("wallet"),
    });

    expect(result).toEqual({
      eligible: false,
      status: 403,
      error: "this bounty has no attributed contributors and cannot be claimed",
    });
  });

  it("rejects a claimant who did not contribute to the bounty", () => {
    const result = evaluateClaimEligibility({
      bounty: filled(),
      contributorId: ANON,
      contributors: ["contrib-someone-else1"],
      payoutAddress: nq("wallet"),
    });

    expect(result).toEqual({
      eligible: false,
      status: 403,
      error: "only a contributor to this bounty can claim it",
    });
  });

  it("allows any one of several contributors to claim a shared bounty", () => {
    const second = "contrib-second-xyz789";
    const result = evaluateClaimEligibility({
      bounty: filled({ progress: 3, target: 3 }),
      contributorId: second,
      contributors: [ANON, second, "contrib-third-xyz789"],
      payoutAddress: nq("wallet"),
    });

    expect(result).toEqual({ eligible: true });
  });

  it("ignores surrounding whitespace when matching a contributor id", () => {
    const result = evaluateClaimEligibility({
      bounty: filled(),
      contributorId: `  ${ANON}  `,
      contributors: [ANON],
      payoutAddress: nq("wallet"),
    });

    expect(result).toEqual({ eligible: true });
  });

  it("pays a wallet-bound contributor to their own wallet", () => {
    const wallet = nq("author");
    const result = evaluateClaimEligibility({
      bounty: filled(),
      contributorId: wallet,
      contributors: [wallet],
      payoutAddress: wallet,
    });

    expect(result).toEqual({ eligible: true });
  });

  it("pays a wallet-bound contributor whose address is formatted with spaces", () => {
    // Nimiq addresses are commonly displayed in space-separated groups.
    const wallet = nq("author");
    const grouped = `${wallet.slice(0, 4)} ${wallet.slice(4)}`;
    const result = evaluateClaimEligibility({
      bounty: filled(),
      contributorId: grouped,
      contributors: [wallet],
      payoutAddress: wallet,
    });

    expect(result).toEqual({ eligible: true });
  });

  it("accepts a payout address formatted in space-separated groups", () => {
    // Nimiq addresses are conventionally displayed in groups; the claim body
    // carries whatever the provider returned, so comparison strips whitespace.
    const wallet = nq("author");
    const grouped = `${wallet.slice(0, 4)} ${wallet.slice(4)}`;
    const result = evaluateClaimEligibility({
      bounty: filled(),
      contributorId: wallet,
      contributors: [wallet],
      payoutAddress: grouped,
    });

    expect(result).toEqual({ eligible: true });
  });

  it("refuses to redirect a wallet-bound contributor's payout to another wallet", () => {
    const author = nq("author");
    const result = evaluateClaimEligibility({
      bounty: filled(),
      contributorId: author,
      contributors: [author],
      payoutAddress: nq("attacker"),
    });

    expect(result).toEqual({
      eligible: false,
      status: 403,
      error: "payout must go to the wallet that completed this bounty",
    });
  });
});
