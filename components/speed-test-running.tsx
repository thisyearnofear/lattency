"use client";

import type { SpeedTestProgress } from "@/lib/speedtest";
import { TickNumber } from "./tick-number";

interface SpeedTestRunningProps {
  progress: SpeedTestProgress;
}

export function SpeedTestRunning({ progress }: SpeedTestRunningProps) {
  const phases: Array<{ id: SpeedTestProgress["phase"]; label: string }> = [
    { id: "ping", label: "Ping" },
    { id: "download", label: "Download" },
    { id: "upload", label: "Upload" },
  ];
  const phaseIndex = phases.findIndex((p) => p.id === progress.phase);
  const widthPct =
    progress.phase === "done"
      ? 100
      : phaseIndex < 0
        ? 5
        : ((phaseIndex + 0.85) / phases.length) * 100;

  // Live rolling readout — the number ticks through TickNumber while the
  // phrase says what the service is doing.
  const liveValue =
    progress.phase === "download"
      ? progress.downMbps
      : progress.phase === "upload"
        ? progress.upMbps
        : undefined;

  const liveLabel =
    progress.phase === "ping"
      ? "Signalling the nearest edge…"
      : progress.phase === "download"
        ? liveValue !== undefined
          ? "Mbps riding the down line"
          : "Boarding the down service…"
        : progress.phase === "upload"
          ? liveValue !== undefined
            ? "Mbps on the up line"
            : "Returning on the up line…"
          : "Pulling into the platform…";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {phases.map((p, i) => {
          const isActive = p.id === progress.phase;
          const isDone = i < phaseIndex || progress.phase === "done";
          return (
            <div
              key={p.id}
              className={[
                "border px-2 py-1.5 transition-colors duration-300",
                isActive
                  ? "border-express bg-express/10 text-ink"
                  : isDone
                    ? "border-ink/40 bg-cream text-ink-soft"
                    : "border-ink/15 bg-cream-edge/40 text-ink-faint",
              ].join(" ")}
            >
              <div className="flex items-center justify-between font-mono text-[9px] tracking-[0.18em] uppercase">
                <span>{p.label}</span>
                <span aria-hidden>{isDone ? "✓" : isActive ? "●" : "○"}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="font-mono text-sm text-ink min-h-[1.25rem] flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block w-2 h-2 rounded-full bg-express animate-pulse"
        />
        {liveValue !== undefined ? (
          <>
            <TickNumber value={liveValue} decimals={1} />
            <span>{liveLabel}</span>
          </>
        ) : (
          <span>{liveLabel}</span>
        )}
      </div>

      {/* The line — with a square carriage riding it. */}
      <div className="relative h-1 bg-ink/10 overflow-visible">
        <div
          className="absolute inset-y-0 left-0 bg-express transition-all duration-500 ease-out"
          style={{ width: `${widthPct}%` }}
        />
        <span
          aria-hidden
          className={`train-car ${progress.phase === "ping" ? "idle" : ""} absolute top-1/2 -translate-y-1/2 w-2.5 h-3.5 bg-ink border border-cream transition-[left] duration-500 ease-out`}
          style={{ left: `calc(${widthPct}% - 5px)` }}
        />
      </div>

      <div aria-hidden className="grid grid-cols-4 gap-2 pt-2 opacity-50">
        {["DOWN", "UP", "PING", "JITTER"].map((label) => (
          <div key={label} className="border border-dashed border-ink/20 py-2">
            <div className="font-mono text-[8px] tracking-[0.14em] uppercase text-ink-faint">
              {label}
            </div>
            <div className="mt-1 h-4 bg-ink/10 animate-pulse" />
            <div className="mt-1 h-2 bg-ink/5" />
          </div>
        ))}
      </div>

      <p className="font-mono text-[10px] text-ink-faint leading-snug">
        Inspection ride to the nearest Vercel edge and back. ~12 seconds.
      </p>
    </div>
  );
}
