"use client";

import { useEffect, useRef, useState } from "react";
import { useNimiq } from "@/hooks/use-nimiq";
import type { Bounty } from "@/lib/bounties";

type ClaimState = "idle" | "loading" | "success" | "error";

export function BountyClaim({ bounty }: { bounty: Bounty }) {
  const { address, inMiniApp, loading: providerLoading } = useNimiq();
  const [state, setState] = useState<ClaimState>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoClaimed = useRef(false);

  const filled = bounty.progress >= bounty.target;
  const claimable = filled && bounty.status === "open";

  async function handleClaim() {
    if (!address) return;
    setState("loading");
    setError(null);

    try {
      const res = await fetch("/api/bounties/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bountyId: bounty.id, nimiqAddress: address }),
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
      <div className="space-y-1">
        <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-express">
          Claimed · {bounty.rewardNim} NIM
          {txHash ? ` · ${txHash.slice(0, 12)}…` : ""}
        </p>
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="block font-mono text-[9px] tracking-[0.16em] uppercase text-ink-soft hover:text-express transition-colors"
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
