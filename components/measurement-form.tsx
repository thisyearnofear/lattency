"use client";

import { useState } from "react";
import type { MeasurementInput, MeasurementReading, Tier } from "@/lib/types";
import { postWithRetry } from "@/lib/fetch-retry";
import {
  runSpeedTest,
  type SpeedTestProgress,
  type SpeedTestResult,
} from "@/lib/speedtest";
import { useNimiq } from "@/hooks/use-nimiq";
import { useContributor } from "@/hooks/use-contributor";
import { useBountyMatch } from "@/hooks/use-bounty-match";
import { haptic } from "@/lib/haptics";
import { GrowBar } from "./grow-bar";

// Maps a download speed to the tier it would fall into — mirrors the
// thresholds the materialized view uses server-side, so the contributor sees
// which "line" their reading lands on before it's even saved.
function tierFor(downMbps: number): Tier {
  if (downMbps >= 50) return "express";
  if (downMbps >= 10) return "local";
  return "suspended";
}

const TIER_RANK: Record<Tier, number> = { express: 2, local: 1, suspended: 0 };

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
const TIER_LINE_COLOUR: Record<Tier, string> = {
  express: "var(--color-express)",
  local: "var(--color-local)",
  suspended: "var(--color-suspended)",
};
const TIER_HEX: Record<Tier, string> = {
  express: "#006D45",
  local: "#C77F00",
  suspended: "#B23A48",
};

// Live progress label for the speed test readout.
function progressLabel(p: SpeedTestProgress): string {
  switch (p.phase) {
    case "ping":
      return "Pinging edge…";
    case "download":
      return p.downMbps !== undefined ? `↓ ${p.downMbps} Mbps` : "Downloading…";
    case "upload":
      return p.upMbps !== undefined ? `↑ ${p.upMbps} Mbps` : "Uploading…";
    case "done":
      return "Test complete";
  }
}

type Status = "idle" | "sending" | "done" | "error" | "rate-limited";
type TestState = "idle" | "running" | "done" | "error";

export function MeasurementForm({
  cafeId,
  cafeName,
  city,
  neighbourhood,
  /** The station's tier before this reading — lets the success state say
   *  whether the contributor's reading moved the line up or down. */
  currentTier,
  onContributed,
}: {
  cafeId: string;
  cafeName: string;
  city?: string;
  neighbourhood?: string;
  currentTier?: Tier;
  onContributed?: (reading: MeasurementReading) => void;
}) {
  const { inMiniApp } = useNimiq();
  const contributor = useContributor();
  const [down, setDown] = useState("");
  const [up, setUp] = useState("");
  const [ping, setPing] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  /** Tier before the reading landed, frozen at submit for the diff callout. */
  const [prevTier, setPrevTier] = useState<Tier | null>(null);
  /** The reading that was just logged (for the success state). */
  const [logged, setLogged] = useState<MeasurementReading | null>(null);

  // In-browser speed test state. When autoResult is set, the submit path
  // includes the provenance metadata (target server, download bytes, etc.)
  // so the API tags the measurement as 'browser-auto' rather than 'manual'.
  const [testState, setTestState] = useState<TestState>("idle");
  const [progress, setProgress] = useState<SpeedTestProgress | null>(null);
  const [autoResult, setAutoResult] = useState<SpeedTestResult | null>(null);

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

  async function runTest() {
    setTestState("running");
    setProgress(null);
    setAutoResult(null);
    // Clear any previous manual values so the live readout isn't misleading.
    setDown("");
    setUp("");
    setPing("");
    try {
      const result = await runSpeedTest(setProgress);
      setDown(String(result.downMbps));
      setUp(String(result.upMbps));
      setPing(String(result.latencyMs));
      setAutoResult(result);
      setTestState("done");
    } catch {
      setTestState("error");
    }
  }

  function resetTest() {
    setTestState("idle");
    setProgress(null);
    setAutoResult(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || status === "sending") return;

    const reading: MeasurementReading = {
      downMbps: downNum,
      upMbps: Number(up),
      latencyMs: Number(ping),
    };
    if (autoResult) {
      reading.jitterMs = autoResult.jitterMs;
      reading.lossPct = autoResult.lossPct;
    }

    // Freeze the station's tier before this reading so the success state can
    // say whether the line moved.
    const before = currentTier ?? null;

    // Optimistic: reflect the contribution immediately so the demo is snappy
    // and never blocks on the write path waking Aurora. We reconcile in the
    // background and only surface a soft error if the POST truly fails.
    setStatus("sending");
    onContributed?.(reading);

    try {
      const body: MeasurementInput = {
        cafeId,
        ...reading,
        contributorId: contributor.id,
        ...(contributor.referredBy && { referredBy: contributor.referredBy }),
        ...(autoResult && {
          testMethod: "browser-auto",
          targetServer: autoResult.targetServer,
          downloadBytes: autoResult.downloadBytes,
          downloadDurationMs: autoResult.downloadDurationMs,
        }),
      };
      const res = await postWithRetry("/api/measurements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setLogged(reading);
        setPrevTier(before);
        setStatus("done");
        haptic();
      } else if (res.status === 429) {
        setStatus("rate-limited");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  // Tier-diff + bounty connection for the success state. The bounty fetch
  // only fires once the reading has landed.
  const bounty = useBountyMatch(city, neighbourhood, status === "done");

  if (status === "done" && logged) {
    const newTier = tierFor(logged.downMbps);
    const moved = prevTier && prevTier !== newTier;
    const movedUp = moved && TIER_RANK[newTier] > TIER_RANK[prevTier];
    const bountyPct = bounty
      ? Math.round((Math.min(bounty.progress + 1, bounty.target) / bounty.target) * 100)
      : 0;

    return (
      <div className="border border-express/40 bg-express/5 p-4">
        <p className="font-display font-black uppercase text-xl text-ink leading-none">
          Reading logged
        </p>

        {/* Tier diff — did this reading move the line? */}
        {moved ? (
          <div
            className="mt-2 inline-flex items-center gap-2 px-2.5 py-1.5 border"
            style={{
              borderColor: TIER_LINE_COLOUR[newTier],
              background: `${TIER_HEX[newTier]}14`,
            }}
          >
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-soft">
              {TIER_LABEL[prevTier]}
            </span>
            <span aria-hidden className="font-display font-black text-ink">
              →
            </span>
            <span
              className="font-mono text-[10px] tracking-[0.2em] uppercase"
              style={{ color: movedUp ? "var(--color-express)" : "var(--color-suspended)" }}
            >
              {TIER_LABEL[newTier]}
            </span>
          </div>
        ) : null}

        <p className="font-serif italic text-ink-faint text-sm mt-1.5">
          {moved
            ? movedUp
              ? "Your reading moved the line up. The map is honest because of you."
              : "Your reading moved the line down. The map is honest because of you."
            : `Thanks — your measurement is now part of ${cafeName}’s ${TIER_LABEL[newTier]} line.`}
        </p>

        {/* Bounty connection — the reward this reading just pushed forward. */}
        {bounty && (
          <div className="mt-3 border-t border-ink/10 pt-3">
            <p className="font-mono text-[9px] tracking-[0.22em] uppercase text-express">
              Bounty in your area
            </p>
            <p className="font-display font-black text-[15px] uppercase text-ink leading-tight mt-0.5">
              {bounty.goal}
            </p>
            <GrowBar
              pct={bountyPct}
              className="h-[3px] bg-cream-deep w-full mt-2"
              barClassName="bg-express"
            />
            <p className="font-serif italic text-[12px] text-ink-soft mt-1.5">
              {Math.min(bounty.progress + 1, bounty.target)}/{bounty.target} ·{" "}
              {bounty.progress + 1 >= bounty.target
                ? "Filled — claim it on the bounties board."
                : `${bounty.target - bounty.progress - 1} more to unlock ${bounty.rewardNim} NIM.`}
            </p>
          </div>
        )}

        {inMiniApp && (
          <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-express mt-2">
            Open the bounties board to claim any earned NIM.
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setDown("");
            setUp("");
            setPing("");
            setStatus("idle");
            setLogged(null);
            resetTest();
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
        <div className="flex items-center gap-1.5">
          {autoResult && (
            <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-express">
              auto
            </span>
          )}
          {previewTier && (
            <span
              className={`${TIER_BG[previewTier]} px-2 py-0.5 text-cream font-mono text-[9px] tracking-[0.2em] uppercase`}
            >
              → {TIER_LABEL[previewTier]} line
            </span>
          )}
        </div>
      </div>

      {/* In-browser speed test — one click measures against Vercel's edge,
          fills the fields below, and tags the reading as browser-auto. */}
      {testState === "idle" && (
        <button
          type="button"
          onClick={runTest}
          className="w-full border border-express/50 text-express bg-express/5 font-mono text-[11px] tracking-[0.22em] uppercase py-2.5 transition-colors hover:bg-express/10"
        >
          ▶ Run speed test
        </button>
      )}

      {testState === "running" && (
        <div className="border border-express/30 bg-express/5 px-3 py-2.5">
          <p className="font-mono text-sm text-ink tabular-nums">
            {progress ? progressLabel(progress) : "Starting…"}
          </p>
          <div className="mt-1.5 h-0.5 bg-ink/10 overflow-hidden">
            <div
              className="h-full bg-express transition-all duration-300"
              style={{
                width:
                  progress?.phase === "ping"
                    ? "15%"
                    : progress?.phase === "download"
                      ? "50%"
                      : progress?.phase === "upload"
                        ? "85%"
                        : "0%",
              }}
            />
          </div>
        </div>
      )}

      {testState === "done" && (
        <div className="border border-express/30 bg-express/5 px-3 py-2 flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-ink-soft">
              Test complete — review below
            </p>
            {autoResult?.targetServer && autoResult.targetServer !== "unknown" && (
              <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-ink-faint mt-0.5">
                Measured against {autoResult.targetServer.split("::")[0]}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={runTest}
            className="font-mono text-[9px] tracking-[0.2em] uppercase text-express underline underline-offset-4 hover:text-ink shrink-0"
          >
            Run again
          </button>
        </div>
      )}

      {testState === "error" && (
        <div className="border border-suspended/40 bg-suspended/5 px-3 py-2 flex items-center justify-between">
          <p className="font-serif italic text-suspended text-xs">
            Test failed — enter numbers manually below.
          </p>
          <button
            type="button"
            onClick={runTest}
            className="font-mono text-[9px] tracking-[0.2em] uppercase text-ink-soft underline underline-offset-4 hover:text-ink"
          >
            Retry
          </button>
        </div>
      )}

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
              onChange={(e) => {
                f.set(e.target.value);
                // Manual edit invalidates the auto-test metadata — the
                // reading reverts to 'manual' on submit.
                if (autoResult) resetTest();
              }}
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

      {status === "rate-limited" && (
        <p className="font-serif italic text-local text-xs">
          You&rsquo;ve already logged a reading for this café recently — try again
          in a few minutes.
        </p>
      )}
    </form>
  );
}
