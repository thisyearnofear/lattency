"use client";

import { useCallback, useState } from "react";
import {
  runSpeedTest,
  type SpeedTestProgress,
  type SpeedTestResult,
} from "@/lib/speedtest";
import { TIER_COLOUR, TIER_USE, tierForDown } from "@/lib/map-data";
import { SpeedTestRunning } from "./speed-test-running";

type TestState = "idle" | "running" | "done" | "error";

interface SpeedTestPanelProps {
  onResult?: (result: SpeedTestResult) => void;
  onContribute?: (result: SpeedTestResult) => void;
  compact?: boolean;
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="border border-ink/15 py-2 text-center">
      <div className="font-mono text-[8px] tracking-[0.14em] uppercase text-ink-faint">
        {label}
      </div>
      <div className="font-display font-black text-lg text-ink leading-none mt-1">
        {value}
      </div>
      <div className="font-mono text-[8px] text-ink-faint mt-0.5">{unit}</div>
    </div>
  );
}

export function SpeedTestPanel({ onResult, onContribute, compact }: SpeedTestPanelProps) {
  const [state, setState] = useState<TestState>("idle");
  const [progress, setProgress] = useState<SpeedTestProgress | null>(null);
  const [result, setResult] = useState<SpeedTestResult | null>(null);
  const [error, setError] = useState("");

  const run = useCallback(async () => {
    setState("running");
    setProgress(null);
    setError("");
    try {
      const r = await runSpeedTest((p) => setProgress(p));
      setResult(r);
      setState("done");
      onResult?.(r);
    } catch (err) {
      setError((err as Error).message);
      setState("error");
    }
  }, [onResult]);

  if (state === "done" && result) {
    const tier = tierForDown(result.downMbps);
    const colour = TIER_COLOUR[tier];
    return (
      <div className={`space-y-4 ${compact ? "" : "border border-ink/15 bg-cream p-5"}`}>
        <div
          className="flex items-center gap-3 px-3.5 py-3 border border-ink/20"
          style={{ background: `${colour}14` }}
        >
          <span
            className="font-display font-black text-2xl w-10 h-12 flex items-center justify-center text-cream shrink-0"
            style={{ background: colour }}
          >
            {tier[0].toUpperCase()}
          </span>
          <div>
            <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-ink">
              You&rsquo;re on the {tier} line
            </p>
            <p
              className="font-serif italic text-[13px] leading-snug mt-0.5"
              style={{ color: colour }}
            >
              {TIER_USE[tier]}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 text-center">
          <Stat label="DOWN" value={`${Math.round(result.downMbps)}`} unit="Mbps" />
          <Stat label="UP" value={`${result.upMbps.toFixed(1)}`} unit="Mbps" />
          <Stat label="PING" value={`${Math.round(result.latencyMs)}`} unit="ms" />
          <Stat
            label="JITTER"
            value={`${result.jitterMs?.toFixed(1) ?? "—"}`}
            unit="ms"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onContribute?.(result)}
            className="flex-1 min-w-[140px] py-3 bg-express text-cream font-mono text-xs tracking-[0.22em] uppercase hover:bg-express/90 transition-colors"
          >
            Map a café with this
          </button>
          <button
            type="button"
            onClick={run}
            className="flex-1 min-w-[140px] py-3 border border-ink/40 font-mono text-xs tracking-[0.22em] uppercase text-ink-soft hover:border-ink hover:text-ink transition-colors"
          >
            Test again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${compact ? "" : "border border-ink/15 bg-cream p-5"}`}>
      {state === "idle" && (
        <>
          <p className="font-serif italic text-ink-soft text-sm leading-relaxed">
            Run a free speed test from where you are right now. No account needed.
            The test hits the nearest Vercel edge and takes about 12 seconds.
          </p>
          <button
            type="button"
            onClick={run}
            className="w-full py-4 bg-express text-cream font-mono text-xs tracking-[0.22em] uppercase hover:opacity-90 transition-opacity"
          >
            Run speed test
          </button>
        </>
      )}

      {state === "running" && progress && <SpeedTestRunning progress={progress} />}

      {state === "error" && (
        <div className="space-y-3">
          <p className="font-mono text-xs text-suspended">{error}</p>
          <button
            type="button"
            onClick={run}
            className="w-full py-3 border border-ink/30 font-mono text-xs tracking-[0.22em] uppercase text-ink-soft hover:border-ink transition-colors"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
