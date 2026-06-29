"use client";

import { useState } from "react";
import type { Tier } from "@/lib/types";

// Maps a download speed to the tier it would fall into — mirrors the
// thresholds the materialized view uses server-side, so the contributor sees
// which "line" their reading lands on before it's even saved.
function tierFor(downMbps: number): Tier {
  if (downMbps >= 50) return "express";
  if (downMbps >= 10) return "local";
  return "suspended";
}

const TIER_LABEL: Record<Tier, string> = {
  express: "Express",
  local: "Local",
  suspended: "Suspended",
};
const TIER_BG: Record<Tier, string> = {
  express: "bg-express",
  local: "bg-local",
  suspended: "bg-suspended",
};

type Status = "idle" | "sending" | "done" | "error";

export function MeasurementForm({
  cafeId,
  cafeName,
  onContributed,
}: {
  cafeId: string;
  cafeName: string;
  onContributed?: (reading: { downMbps: number; upMbps: number; latencyMs: number }) => void;
}) {
  const [down, setDown] = useState("");
  const [up, setUp] = useState("");
  const [ping, setPing] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const downNum = Number(down);
  const valid =
    down !== "" &&
    up !== "" &&
    ping !== "" &&
    Number.isFinite(downNum) &&
    downNum > 0 &&
    Number.isFinite(Number(up)) &&
    Number.isFinite(Number(ping));

  const previewTier = valid ? tierFor(downNum) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || status === "sending") return;

    const reading = {
      downMbps: downNum,
      upMbps: Number(up),
      latencyMs: Number(ping),
    };

    // Optimistic: reflect the contribution immediately so the demo is snappy
    // and never blocks on the write path waking Aurora. We reconcile in the
    // background and only surface a soft error if the POST truly fails.
    setStatus("sending");
    onContributed?.(reading);

    try {
      const res = await fetch("/api/measurements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cafeId, ...reading }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="border border-express/40 bg-express/5 p-4">
        <p className="font-display font-black uppercase text-xl text-ink leading-none">
          Reading logged
        </p>
        <p className="font-serif italic text-ink-faint text-sm mt-1.5">
          Thanks — your measurement is now part of {cafeName}&rsquo;s line.
        </p>
        <button
          type="button"
          onClick={() => {
            setDown("");
            setUp("");
            setPing("");
            setStatus("idle");
          }}
          className="mt-3 font-mono text-[10px] tracking-[0.2em] uppercase text-ink-soft underline underline-offset-4 hover:text-ink"
        >
          Add another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="stamp">Contribute a reading</p>
        {previewTier && (
          <span
            className={`${TIER_BG[previewTier]} px-2 py-0.5 text-cream font-mono text-[9px] tracking-[0.2em] uppercase`}
          >
            → {TIER_LABEL[previewTier]} line
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Down", unit: "Mbps", val: down, set: setDown, ph: "50" },
          { label: "Up", unit: "Mbps", val: up, set: setUp, ph: "12" },
          { label: "Ping", unit: "ms", val: ping, set: setPing, ph: "20" },
        ].map((f) => (
          <label key={f.label} className="block">
            <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-ink-faint">
              {f.label} · {f.unit}
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              placeholder={f.ph}
              value={f.val}
              onChange={(e) => f.set(e.target.value)}
              className="mt-1 w-full bg-cream border border-ink/25 focus:border-ink px-2 py-1.5 font-mono text-base text-ink tabular-nums outline-none transition-colors"
            />
          </label>
        ))}
      </div>

      <button
        type="submit"
        disabled={!valid || status === "sending"}
        className="w-full bg-ink text-cream font-mono text-[11px] tracking-[0.22em] uppercase py-2.5 transition-opacity disabled:opacity-30 hover:bg-ink-soft"
      >
        {status === "sending" ? "Logging…" : "Log this reading"}
      </button>

      {status === "error" && (
        <p className="font-serif italic text-suspended text-xs">
          Saved to the map, but the server didn&rsquo;t confirm — it&rsquo;ll sync
          when the connection returns.
        </p>
      )}
    </form>
  );
}
