"use client";

import { useState } from "react";
import { useNimiq } from "@/hooks/use-nimiq";
import { BOUNTY_KINDS, BOUNTY_KIND_LABELS } from "@/lib/bounty-types";
import type { Bounty, BountyKind } from "@/lib/bounty-types";
import { bountyPaymentsEnabled, BOUNTY_PAYMENTS_PAUSED } from "@/lib/bounty-policy";

const SPONSOR_KINDS: Array<{ value: "isp" | "café" | "community" | "anon"; label: string }> = [
  { value: "isp", label: "ISP" },
  { value: "café", label: "Café owner" },
  { value: "community", label: "Community" },
  { value: "anon", label: "Anonymous" },
];

// Escrow address for NIM funding, configured per deployment. There is no
// fallback address — a hard-coded default could silently route sponsor funds
// to a wallet nobody audited. When unset, the funding form stays disabled.
const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_NIMIQ_ESCROW_ADDRESS;
const escrowConfigured = Boolean(ESCROW_ADDRESS);

export function SponsorDashboard() {
  const { provider, address, inMiniApp } = useNimiq();

  const [goal, setGoal] = useState("");
  const [area, setArea] = useState("Shoreditch");
  const [target, setTarget] = useState("1");
  const [rewardNim, setRewardNim] = useState("5");
  const [sponsor, setSponsor] = useState("");
  const [sponsorKind, setSponsorKind] = useState<"isp" | "café" | "community" | "anon">("isp");
  const [kind, setKind] = useState<BountyKind>("first-in-neighbourhood");
  const [expiresAt, setExpiresAt] = useState("");

  const [created, setCreated] = useState<Bounty[]>([]);
  const [status, setStatus] = useState<"idle" | "paying" | "creating" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [fundingTx, setFundingTx] = useState<string | null>(null);
  // Idempotency key for the funding intent — minted once per bounty so a
  // retried POST (e.g. lost response) dedupes server-side instead of
  // double-creating. Regenerated after each successful create.
  const [clientIntentId, setClientIntentId] = useState(() => crypto.randomUUID());

  const paymentsEnabled = bountyPaymentsEnabled();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentsEnabled) {
      setError(BOUNTY_PAYMENTS_PAUSED);
      return;
    }
    if (!escrowConfigured || !provider || !address) return;

    setStatus("paying");
    setError(null);

    try {
      // Step 1: sponsor funds the escrow with NIM via Nimiq SDK.
      const amountLunas = Math.floor(Number(rewardNim) * 100_000);
      const payment = await provider.requestPayment({
        recipient: ESCROW_ADDRESS as string,
        value: amountLunas,
        message: `Fund bounty: ${goal.trim()}`,
      });
      setFundingTx(payment.txHash);

      // Step 2: create the bounty on the server, carrying the funding proof
      // (txHash is verified on-chain server-side) and the intent id so a
      // retry dedupes instead of double-creating.
      setStatus("creating");
      const res = await fetch("/api/bounties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          area,
          target: Number(target),
          rewardNim: Number(rewardNim),
          sponsor,
          sponsorKind,
          kind,
          expiresAt,
          fundingTxHash: payment.txHash,
          clientIntentId,
        }),
      });

      const data = (await res.json()) as { success?: boolean; bounty?: Bounty; error?: string };
      if (!res.ok || !data.success || !data.bounty) {
        // The escrow payment already went through — always surface the tx
        // hash so the sponsor can reference it for support/refund.
        throw new Error(
          `${data.error ?? "Failed to create bounty"} — your funding transaction hash is ${payment.txHash}; keep it for support.`,
        );
      }

      setCreated((prev) => [data.bounty as Bounty, ...prev]);
      setClientIntentId(crypto.randomUUID());
      setStatus("done");
      setGoal("");
      setTarget("1");
      setRewardNim("5");
      setExpiresAt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  }

  const valid =
    goal.trim().length >= 3 &&
    area.trim().length >= 2 &&
    Number(target) >= 1 &&
    Number(rewardNim) > 0 &&
    sponsor.trim().length >= 2;

  return (
    <section className="border border-ink/15 bg-cream p-5 md:p-6">
      <p className="stamp">Sponsor dashboard</p>
      <h2 className="font-display font-black uppercase text-2xl md:text-3xl tracking-[-0.01em] text-ink mt-1">
        Fund a bounty
      </h2>
      <p className="font-serif italic text-ink-soft text-sm mt-2">
        Pre-pay NIM. Contributors earn it when they hit your target.
      </p>

      {!inMiniApp && (
        <div className="mt-4 border border-local/40 bg-local/5 p-3">
          <p className="font-serif italic text-local text-sm">
            Open in Nimiq Pay to fund with NIM.
          </p>
        </div>
      )}

      {!escrowConfigured && (
        <p
          role="status"
          className="mt-4 border border-suspended/40 bg-suspended/5 p-3 font-mono text-xs text-ink"
        >
          Sponsor funding is not configured on this deployment.
        </p>
      )}

      {!paymentsEnabled && (
        <p
          role="status"
          className="mt-4 border border-local/40 bg-local/5 p-3 font-mono text-xs text-ink"
        >
          {BOUNTY_PAYMENTS_PAUSED}
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="block">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-faint">
              Bounty goal
            </span>
            <input
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="First café in Shoreditch"
              className="mt-1 w-full bg-cream border border-ink/25 focus:border-ink px-2 py-1.5 font-mono text-sm text-ink outline-none transition-colors"
            />
          </label>
        </div>

        <label className="block">
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-faint">
            Area
          </span>
          <input
            type="text"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="mt-1 w-full bg-cream border border-ink/25 focus:border-ink px-2 py-1.5 font-mono text-sm text-ink outline-none transition-colors"
          />
        </label>

        <label className="block">
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-faint">
            Target contributions
          </span>
          <input
            type="number"
            min={1}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="mt-1 w-full bg-cream border border-ink/25 focus:border-ink px-2 py-1.5 font-mono text-sm text-ink outline-none transition-colors"
          />
        </label>

        <label className="block">
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-faint">
            Reward (NIM)
          </span>
          <input
            type="number"
            min={0.1}
            step="any"
            value={rewardNim}
            onChange={(e) => setRewardNim(e.target.value)}
            className="mt-1 w-full bg-cream border border-ink/25 focus:border-ink px-2 py-1.5 font-mono text-sm text-ink outline-none transition-colors"
          />
        </label>

        <label className="block">
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-faint">
            Sponsor name
          </span>
          <input
            type="text"
            value={sponsor}
            onChange={(e) => setSponsor(e.target.value)}
            className="mt-1 w-full bg-cream border border-ink/25 focus:border-ink px-2 py-1.5 font-mono text-sm text-ink outline-none transition-colors"
          />
        </label>

        <label className="block">
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-faint">
            Sponsor type
          </span>
          <select
            value={sponsorKind}
            onChange={(e) => setSponsorKind(e.target.value as typeof sponsorKind)}
            className="mt-1 w-full bg-cream border border-ink/25 focus:border-ink px-2 py-1.5 font-mono text-sm text-ink outline-none transition-colors"
          >
            {SPONSOR_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block md:col-span-2">
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-faint">
            Bounty type
          </span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as BountyKind)}
            className="mt-1 w-full bg-cream border border-ink/25 focus:border-ink px-2 py-1.5 font-mono text-sm text-ink outline-none transition-colors"
          >
            {BOUNTY_KINDS.map((k) => (
              <option key={k} value={k}>
                {BOUNTY_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>

        <label className="block md:col-span-2">
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-faint">
            Expires (optional)
          </span>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="mt-1 w-full bg-cream border border-ink/25 focus:border-ink px-2 py-1.5 font-mono text-sm text-ink outline-none transition-colors"
          />
        </label>

        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={
              !paymentsEnabled ||
              !escrowConfigured ||
              !valid ||
              !provider ||
              !inMiniApp ||
              status === "paying" ||
              status === "creating"
            }
            className="w-full bg-express text-cream font-mono text-[11px] tracking-[0.22em] uppercase py-3 transition-opacity hover:bg-express/90 disabled:opacity-40"
          >
            {!paymentsEnabled
              ? "Funding paused"
              : !escrowConfigured
                ? "Funding unavailable"
                : status === "paying"
                  ? "Confirm NIM payment…"
                  : status === "creating"
                    ? "Creating bounty…"
                    : `Fund ${rewardNim || "0"} NIM bounty`}
          </button>
        </div>
      </form>

      {status === "done" && (
        <p className="mt-4 font-serif italic text-express text-sm">
          Bounty created and funded{fundingTx ? ` (tx ${fundingTx.slice(0, 12)}…)` : ""}. It will appear in the public bounty board.
        </p>
      )}

      {error && (
        <p className="mt-4 font-serif italic text-suspended text-sm">{error}</p>
      )}

      {created.length > 0 && (
        <div className="mt-6 border-t border-ink/15 pt-5">
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-faint mb-3">
            Your funded bounties
          </p>
          <ul className="space-y-2">
            {created.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-3 border border-ink/10 p-3 bg-cream-edge/40"
              >
                <div>
                  <p className="font-display font-black uppercase text-sm text-ink">
                    {b.goal}
                  </p>
                  <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-soft">
                    {b.area} · {b.rewardNim} NIM
                  </p>
                </div>
                <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-express">
                  open
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
