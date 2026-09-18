"use client";

// Claiming a bounty — the money moment.
//
// Two kinds of card reach this component. A funded bounty gets the claim
// button (auto-claiming inside the Nimiq Pay mini-app). An unfunded seed-board
// example gets a "Fund this bounty" link instead: its target is real enough to
// reach, but there is no money behind it, and offering a claim button that the
// server refuses would be the worst of both worlds.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useNimiq } from "@/hooks/use-nimiq";
import { useContributor } from "@/hooks/use-contributor";
import type { Bounty } from "@/lib/bounties";
import { haptic } from "@/lib/haptics";

type ClaimState = "idle" | "loading" | "success" | "error";

export function BountyClaim({ bounty }: { bounty: Bounty }) {
  const { address, inMiniApp, loading: providerLoading } = useNimiq();
  // The server only pays a contributor on record for this bounty, so the
  // claim must carry the identity the reading was written under.
  const contributor = useContributor();
  const [state, setState] = useState<ClaimState>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoClaimed = useRef(false);

  const filled = bounty.progress >= bounty.target;
  // `claiming` means the bounty is filled and awaiting payout — the server
  // pays a filled bounty in either the `open` or `claiming` state.
  // Unfunded examples are never claimable; see lib/bounty-claim.ts step 1.
  const claimable =
    !bounty.synthetic && filled && (bounty.status === "open" || bounty.status === "claiming");

  async function handleClaim() {
    if (!address) return;
    setState("loading");
    setError(null);

    try {
      const res = await fetch("/api/bounties/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bountyId: bounty.id,
          nimiqAddress: address,
          contributorId: contributor.id,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        txHash?: string;
        error?: string;
      };

      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "claim failed");
      }

      setTxHash(data.txHash ?? null);
      setState("success");
      haptic(18);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claim failed");
      setState("error");
    }
  }

  // Auto-claim inside the Nimiq Pay mini-app: when a bounty is filled and the
  // user's wallet is connected, skip the manual click and pay out immediately.
  // The ref guard prevents double-fires on re-render.
  useEffect(() => {
    if (!inMiniApp || !claimable || !address || providerLoading) return;
    if (autoClaimed.current) return;
    autoClaimed.current = true;
    void handleClaim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inMiniApp, claimable, address, providerLoading]);

  if (bounty.status === "paid" || bounty.claimedByAddress) {
    return (
      <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-express">
        Claimed{bounty.txHash ? ` · tx ${bounty.txHash.slice(0, 12)}…` : ""}
      </p>
    );
  }

  // Unfunded examples: no claim button, because there is nothing to claim.
  // Offered as the sponsor action instead — this is the pitch, sitting exactly
  // where a reward button would have been. Must come before the `!claimable`
  // branch below, which would otherwise swallow it with "Not yet complete".
  if (bounty.synthetic) {
    return (
      <div className="space-y-2">
        <Link
          href="/partners"
          className="w-full border border-ink/40 text-ink font-mono text-[10px] tracking-[0.22em] uppercase py-2 flex items-center justify-center gap-1.5 hover:bg-ink hover:text-cream transition-colors"
        >
          Fund this bounty <span aria-hidden>→</span>
        </Link>
        <p className="font-serif italic text-ink-faint text-xs">
          No sponsor yet — this target pays nothing.
        </p>
      </div>
    );
  }

  if (!claimable) {
    return (
      <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-faint">
        {filled ? "Claim window closed" : "Not yet complete"}
      </p>
    );
  }

  if (state === "success") {
    const explorerBase =
      process.env.NEXT_PUBLIC_NIMIQ_EXPLORER_URL ??
      "https://test.nimiq.watch/#/tx/";
    const explorerUrl = txHash ? `${explorerBase}${txHash}` : null;
    return (
      <div className="relative space-y-1 pt-6">
        {/* The money moment — a rotated PAID stamp thudding onto the card. */}
        <span
          aria-hidden
          className="celebration-stamp absolute -top-1 right-0 inline-block px-2 py-1 border-2 border-express bg-express text-cream font-display font-black text-lg uppercase rotate-[-8deg] shadow-[2px_3px_0_0_var(--color-ink)]"
        >
          Paid
        </span>
        <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-express">
          Claimed · {bounty.rewardNim} NIM
          {txHash ? ` · ${txHash.slice(0, 12)}…` : ""}
        </p>
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="block font-mono text-[10px] tracking-[0.16em] uppercase text-ink-soft hover:text-express transition-colors"
          >
            View on Nimiq explorer →
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClaim}
        disabled={!address || providerLoading || state === "loading"}
        className="w-full bg-express text-cream font-mono text-[10px] tracking-[0.22em] uppercase py-2 transition-opacity hover:bg-express/90 disabled:opacity-40"
      >
        {state === "loading"
          ? "Claiming…"
          : `Claim ${bounty.rewardNim} NIM`}
      </button>

      {!inMiniApp && !providerLoading && (
        <p className="font-serif italic text-ink-faint text-xs">
          Open in Nimiq Pay to claim NIM.
        </p>
      )}

      {inMiniApp && !address && !providerLoading && (
        <p className="font-serif italic text-ink-faint text-xs">
          Authorize an account in Nimiq Pay.
        </p>
      )}

      {error && (
        <p className="font-serif italic text-suspended text-xs">{error}</p>
      )}
    </div>
  );
}
