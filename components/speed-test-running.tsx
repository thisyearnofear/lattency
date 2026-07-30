"use client";

import type { SpeedTestProgress } from "@/lib/speedtest";

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

  const liveLabel =
    progress.phase === "ping"
      ? "Pinging the edge…"
      : progress.phase === "download"
        ? progress.downMbps !== undefined
          ? `${progress.downMbps.toFixed(1)} Mbps down`
          : "Streaming the 10 MB blob…"
        : progress.phase === "upload"
          ? progress.upMbps !== undefined
            ? `${progress.upMbps.toFixed(1)} Mbps up`
            : "Uploading test payloads…"
          : "Wrapping up…";

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
        {liveLabel}
      </div>

      <div className="h-1 bg-ink/10 overflow-hidden">
        <div
          className="h-full bg-express transition-all duration-500 ease-out"
          style={{ width: `${widthPct}%` }}
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
        Round-trip recorded against the nearest Vercel edge. ~12 seconds.
      </p>
    </div>
  );
}
