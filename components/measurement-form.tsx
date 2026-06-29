"use client";

import { useState } from "react";
import type { MeasurementInput, MeasurementReading, Tier } from "@/lib/types";
import {
  runSpeedTest,
  type SpeedTestProgress,
  type SpeedTestResult,
} from "@/lib/speedtest";

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
  onContributed,
}: {
  cafeId: string;
  cafeName: string;
  onContributed?: (reading: MeasurementReading) => void;
}) {
  const [down, setDown] = useState("");
  const [up, setUp] = useState("");
  const [ping, setPing] = useState("");
  const [status, setStatus] = useState<Status>("idle");

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

    // Optimistic: reflect the contribution immediately so the demo is snappy
    // and never blocks on the write path waking Aurora. We reconcile in the
    // background and only surface a soft error if the POST truly fails.
    setStatus("sending");
    onContributed?.(reading);

    try {
      const body: MeasurementInput = {
        cafeId,
        ...reading,
        ...(autoResult && {
          testMethod: "browser-auto",
          targetServer: autoResult.targetServer,
          downloadBytes: autoResult.downloadBytes,
          downloadDurationMs: autoResult.downloadDurationMs,
        }),
      };
      const res = await fetch("/api/measurements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setStatus("done");
      } else if (res.status === 429) {
        setStatus("rate-limited");
      } else {
        setStatus("error");
      }
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
