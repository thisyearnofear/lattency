"use client";

// The LIVE RUN view — capture run v2's guided instrument (docs/venue-3d-ux-
// research.md §8). A camera preview in a square newsprint panel with three
// honest instruments, none of which pretend to measure geometry:
//
//   - SECTOR DIAL — 8 compass sectors filled by deviceorientation when
//     available; otherwise a timed sweep prompt ("turn slowly"). Labeled
//     "views recorded", never a fake coverage percent.
//   - QUALITY CHIPS — SHARPNESS (Laplacian variance vs the run's own peak),
//     PACE (DeviceMotion rotation rate → "slow down"), FACES (a manual
//     flag chip — real face detection needs a heavier dep than this tranche
//     carries, so the honest control is "tap when a face enters frame").
//   - FRAME LOOP — a JPEG keyframe every ~400ms POSTed to
//     /api/venue-scans/:id/upload as it lands ("uploaded n/m frames").
//
// END RUN → PATCH finalize with the self-computed quality score, sector
// list, and face-event count. Camera denied → the honest manual path:
// "film in your camera app and send it to us".

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CAPTURE_SECTORS,
  isRelativelyBlurry,
  orderedSectors,
  paceTooFast,
  qualityScore,
  sectorFromHeading,
  sharpnessOf,
  type CaptureSector,
} from "@/lib/capture-quality";
import { haptic } from "@/lib/haptics";

const FRAME_INTERVAL_MS = 400;
const JPEG_QUALITY = 0.75;
const UPLOAD_WIDTH = 640; // keyframe upload width
const ANALYSIS_WIDTH = 160; // sharpness probe width — small on purpose
const TICK_MS = 500;
// Timed-sweep fallback: with no compass, advance the suggested sector on a
// clock so the contributor still gets a "turn slowly" prompt.
const SWEEP_MS_PER_SECTOR = 6_000;

export interface CaptureRunSummary {
  framesSent: number;
  framesLanded: number;
  qualityScore: number;
  coverageSectors: string[];
  faceEvents: number;
  durationMs: number;
}

type Phase = "starting" | "live" | "unavailable" | "stopping";

// The sector dial as a 3×3 grid — square cells, no circle imagery.
const DIAL_CELLS: (CaptureSector | null)[] = [
  "NW",
  "N",
  "NE",
  "W",
  null,
  "E",
  "SW",
  "S",
  "SE",
];

export function CaptureCoach({
  scanId,
  contributorId,
  onDone,
  onAbort,
}: {
  scanId: string;
  contributorId: string;
  onDone: (summary: CaptureRunSummary) => void;
  onAbort: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pendingRef = useRef<Promise<unknown>[]>([]);
  const runningRef = useRef(false);
  const startRef = useRef(0);

  const seqRef = useRef(0);
  const sentRef = useRef(0);
  const landedRef = useRef(0);
  const sharpRef = useRef(0);
  const peakSharpRef = useRef(0);
  const paceWarnRef = useRef(0);
  const sectorsRef = useRef<Set<CaptureSector>>(new Set());
  const timedSectorRef = useRef(0);
  const orientationSeenRef = useRef(false);
  const facesRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("starting");
  const [sensorsOn, setSensorsOn] = useState(false);
  const [compassLive, setCompassLive] = useState(false);
  const [sharpWarn, setSharpWarn] = useState(false);
  const [paceWarn, setPaceWarn] = useState(false);
  const [faceFlash, setFaceFlash] = useState(false);
  // Display snapshot — the loop and sensor handlers write refs (they run in
  // intervals/handlers, not render); a 500ms pulse mirrors them into state
  // so render never touches a ref.
  const [view, setView] = useState<{
    sent: number;
    landed: number;
    faces: number;
    elapsedSec: number;
    sectors: CaptureSector[];
    suggested: CaptureSector | null;
    mode: "compass" | "timed";
  }>({
    sent: 0,
    landed: 0,
    faces: 0,
    elapsedSec: 0,
    sectors: [],
    suggested: CAPTURE_SECTORS[0],
    mode: "timed",
  });

  // Camera acquisition. Fails honestly — the manual path stays open.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        startRef.current = Date.now();
        runningRef.current = true;
        setPhase("live");
      } catch {
        if (!cancelled) setPhase("unavailable");
      }
    })();
    return () => {
      cancelled = true;
      runningRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // Wake lock + leave-guard for the duration of the live run. iOS has no
  // background upload, so "keep this tab open" is load-bearing.
  useEffect(() => {
    if (phase !== "live") return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    void nav.wakeLock
      ?.request("screen")
      .then((l) => {
        lock = l;
      })
      .catch(() => {
        /* wake lock can be denied — the checklist copy still warns */
      });
    const guard = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => {
      window.removeEventListener("beforeunload", guard);
      void lock?.release().catch(() => {});
    };
  }, [phase]);

  // Frame loop: draw → probe sharpness → JPEG → POST immediately.
  useEffect(() => {
    if (phase !== "live") return;
    const video = videoRef.current;
    const cap = document.createElement("canvas");
    const ana = document.createElement("canvas");
    const id = window.setInterval(() => {
      if (!runningRef.current || !video || video.readyState < 2 || !video.videoWidth)
        return;
      const seq = seqRef.current++;

      const upScale = UPLOAD_WIDTH / video.videoWidth;
      cap.width = UPLOAD_WIDTH;
      cap.height = Math.max(1, Math.round(video.videoHeight * upScale));
      cap.getContext("2d")?.drawImage(video, 0, 0, cap.width, cap.height);

      const anaScale = ANALYSIS_WIDTH / video.videoWidth;
      ana.width = ANALYSIS_WIDTH;
      ana.height = Math.max(1, Math.round(video.videoHeight * anaScale));
      const actx = ana.getContext("2d", { willReadFrequently: true });
      let sharp = 0;
      if (actx) {
        actx.drawImage(video, 0, 0, ana.width, ana.height);
        try {
          const img = actx.getImageData(0, 0, ana.width, ana.height);
          sharp = sharpnessOf(img.data, img.width, img.height);
        } catch {
          sharp = 0;
        }
      }
      if (sharp > 0) {
        if (sharp > peakSharpRef.current) peakSharpRef.current = sharp;
        if (isRelativelyBlurry(sharp, peakSharpRef.current)) {
          setSharpWarn(true);
        } else {
          sharpRef.current++;
          setSharpWarn(false);
        }
      }

      const frame = cap.toDataURL("image/jpeg", JPEG_QUALITY);
      sentRef.current++;
      const ts = new Date().toISOString();
      const pending = fetch(`/api/venue-scans/${scanId}/upload`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seq, ts, contributor_id: contributorId, frame }),
      })
        .then((r) => {
          if (r.ok) landedRef.current++;
        })
        .catch(() => {
          /* a dropped frame is tracked, not fatal — the run continues */
        });
      pendingRef.current.push(pending);
    }, FRAME_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [phase, scanId, contributorId]);

  // Sensor listeners — active only after the contributor opts in (iOS
  // requires requestPermission inside a user gesture).
  useEffect(() => {
    if (phase !== "live" || !sensorsOn) return;
    const onOrient = (e: DeviceOrientationEvent) => {
      const raw =
        e.alpha ??
        (e as unknown as { webkitCompassHeading?: number }).webkitCompassHeading;
      if (typeof raw === "number" && Number.isFinite(raw)) {
        if (!orientationSeenRef.current) setCompassLive(true);
        orientationSeenRef.current = true;
        sectorsRef.current.add(sectorFromHeading(raw));
      }
    };
    const onMotion = (e: DeviceMotionEvent) => {
      const r = e.rotationRate;
      if (!r) return;
      const mag = Math.max(
        Math.abs(r.alpha ?? 0),
        Math.abs(r.beta ?? 0),
        Math.abs(r.gamma ?? 0),
      );
      if (paceTooFast(mag)) {
        paceWarnRef.current++;
        setPaceWarn(true);
      } else {
        setPaceWarn(false);
      }
    };
    window.addEventListener("deviceorientation", onOrient);
    window.addEventListener("devicemotion", onMotion);
    return () => {
      window.removeEventListener("deviceorientation", onOrient);
      window.removeEventListener("devicemotion", onMotion);
    };
  }, [phase, sensorsOn]);

  // Render pulse + timed-sweep fallback when no compass data arrives.
  useEffect(() => {
    if (phase !== "live") return;
    const id = window.setInterval(() => {
      const hasCompass = orientationSeenRef.current;
      if (!hasCompass) {
        timedSectorRef.current = Math.min(
          CAPTURE_SECTORS.length - 1,
          Math.floor((Date.now() - startRef.current) / SWEEP_MS_PER_SECTOR),
        );
      }
      setView((v) => ({
        ...v,
        sent: sentRef.current,
        landed: landedRef.current,
        faces: facesRef.current,
        elapsedSec: Math.floor((Date.now() - startRef.current) / 1000),
        sectors: hasCompass
          ? orderedSectors(sectorsRef.current)
          : [...CAPTURE_SECTORS.slice(0, timedSectorRef.current + 1)],
        suggested: hasCompass ? null : CAPTURE_SECTORS[timedSectorRef.current],
        mode: hasCompass ? "compass" : "timed",
      }));
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [phase]);

  const enableSensors = useCallback(async () => {
    try {
      const DM = DeviceMotionEvent as unknown as {
        requestPermission?: () => Promise<string>;
      };
      const DO = DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<string>;
      };
      if (DM.requestPermission) await DM.requestPermission();
      if (DO.requestPermission) await DO.requestPermission();
    } catch {
      /* denied — the timed sweep still coaches */
    }
    setSensorsOn(true);
  }, []);

  const flagFace = useCallback(() => {
    const n = facesRef.current + 1;
    facesRef.current = n;
    haptic(15);
    setFaceFlash(true);
    setView((v) => ({ ...v, faces: n }));
    window.setTimeout(() => setFaceFlash(false), 1600);
  }, []);

  const endRun = useCallback(async () => {
    if (phase !== "live") return;
    runningRef.current = false;
    setPhase("stopping");
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    // Give in-flight chunks a moment to land before sealing the manifest.
    await Promise.allSettled(pendingRef.current.splice(0));

    const durationMs = Date.now() - startRef.current;
    // Only compass-derived sectors are reported — the timed sweep prompts
    // the contributor to turn but is never written to the manifest as if
    // it were measured coverage.
    const recorded = orderedSectors(sectorsRef.current);
    const score = qualityScore({
      framesCaptured: sentRef.current,
      sharpFrames: sharpRef.current,
      sectorsCovered: recorded.length,
      paceWarnings: paceWarnRef.current,
    });
    try {
      await fetch(`/api/venue-scans/${scanId}/upload`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          done: true,
          contributor_id: contributorId,
          frameCount: sentRef.current,
          qualityScore: score,
          coverageSectors: recorded,
          faceEvents: facesRef.current,
        }),
      });
    } catch {
      /* finalize is best-effort — the frame manifest is already on record */
    }
    haptic(20);
    onDone({
      framesSent: sentRef.current,
      framesLanded: landedRef.current,
      qualityScore: score,
      coverageSectors: [...recorded],
      faceEvents: facesRef.current,
      durationMs,
    });
  }, [phase, scanId, contributorId, onDone]);

  if (phase === "unavailable") {
    return (
      <div className="border-2 border-ink/80 bg-cream p-5 shadow-[3px_4px_0_0_var(--color-ink)]">
        <p className="stamp mb-2">Camera unavailable</p>
        <p className="font-serif italic text-ink text-[15px] leading-snug">
          This device wouldn&rsquo;t hand over its camera. Film the same slow
          lap in your camera app instead — entrance to counter and back —
          and send it to us: the manual path counts just the same.
        </p>
        <button
          type="button"
          onClick={onAbort}
          className="mt-4 w-full border border-ink/80 bg-cream py-2.5 font-mono text-[11px] tracking-[0.22em] uppercase text-ink shadow-[2px_2px_0_0_var(--color-ink)] transition-colors hover:bg-ink hover:text-cream"
        >
          ← Back to attestations
        </button>
      </div>
    );
  }

  const elapsedSec = view.elapsedSec;
  const visited = new Set(view.sectors);
  const suggested = view.suggested;

  return (
    <div>
      {/* Preview panel — square, ink-framed, instruments on top. */}
      <div className="relative border-2 border-ink/80 bg-ink shadow-[3px_4px_0_0_var(--color-ink)]">
        <video
          ref={videoRef}
          muted
          playsInline
          className="block h-64 w-full object-cover md:h-80"
        />
        {phase === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-ink">
            <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-cream/70">
              Requesting camera…
            </p>
          </div>
        )}
        {faceFlash && (
          <div className="absolute left-0 right-0 top-0 border-b-2 border-cream bg-ink px-4 py-2">
            <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-cream">
              Face flagged — reframe or stop. We blur before anything is built.
            </p>
          </div>
        )}
      </div>

      {/* Instrument row — sector dial + quality chips. */}
      <div className="mt-4 grid grid-cols-[auto_1fr] gap-4">
        <div>
          <div className="grid grid-cols-3 gap-1">
            {DIAL_CELLS.map((cell, i) =>
              cell === null ? (
                <div
                  key={i}
                  className="flex h-9 w-9 items-center justify-center border border-ink/30 bg-cream-edge/60 font-mono text-[9px] tracking-[0.1em] text-ink"
                >
                  {visited.size}/8
                </div>
              ) : (
                <div
                  key={cell}
                  className={`flex h-9 w-9 items-center justify-center border font-mono text-[10px] tracking-[0.05em] ${
                    visited.has(cell)
                      ? "border-ink bg-ink text-cream"
                      : cell === suggested
                        ? "think-blink border-ink/80 bg-cream text-ink"
                        : "border-ink/30 bg-cream text-ink-faint"
                  }`}
                >
                  {cell}
                </div>
              ),
            )}
          </div>
          <p className="mt-1.5 font-mono text-[9px] tracking-[0.18em] uppercase text-ink-faint">
            Views recorded ·{" "}
            {view.mode === "compass" || compassLive
              ? "compass"
              : "timed sweep — turn slowly"}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-2">
            <div
              className={`border px-2 py-1.5 font-mono text-[9px] tracking-[0.14em] uppercase ${
                sharpWarn
                  ? "border-ink bg-ink text-cream"
                  : "border-ink/30 text-ink-soft"
              }`}
            >
              Sharpness
              <span className="block text-[10px]">
                {sharpWarn ? "hold steadier" : "ok"}
              </span>
            </div>
            <div
              className={`border px-2 py-1.5 font-mono text-[9px] tracking-[0.14em] uppercase ${
                paceWarn
                  ? "border-ink bg-ink text-cream"
                  : "border-ink/30 text-ink-soft"
              }`}
            >
              Pace
              <span className="block text-[10px]">
                {paceWarn ? "slow down" : "ok"}
              </span>
            </div>
            <button
              type="button"
              onClick={flagFace}
              className="border border-ink/30 px-2 py-1.5 text-left font-mono text-[9px] tracking-[0.14em] uppercase text-ink-soft transition-colors hover:border-ink hover:text-ink"
            >
              Faces
              <span className="block text-[10px]">
                {view.faces} · tap to flag
              </span>
            </button>
          </div>

          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-ink-faint">
            Uploaded {view.landed}/{view.sent} frames ·{" "}
            {String(Math.floor(elapsedSec / 60)).padStart(2, "0")}:
            {String(elapsedSec % 60).padStart(2, "0")} · keep this tab open
          </p>
          <p className="font-serif italic text-ink-soft text-[12px] leading-snug">
            Walk the room — entrance → seating → counter → back. Turning in
            place isn&rsquo;t a scan; move your feet.
          </p>
        </div>
      </div>

      {!sensorsOn && phase === "live" && (
        <button
          type="button"
          onClick={enableSensors}
          className="mt-3 w-full border border-ink/40 bg-cream py-2 font-mono text-[10px] tracking-[0.2em] uppercase text-ink-soft transition-colors hover:text-ink"
        >
          Enable motion hints (compass + pace)
        </button>
      )}

      <div className="mt-4 flex items-center gap-4">
        <button
          type="button"
          onClick={onAbort}
          className="font-mono text-[10px] tracking-[0.22em] uppercase text-ink-faint transition-colors hover:text-ink"
        >
          ← Abort
        </button>
        <button
          type="button"
          onClick={endRun}
          disabled={phase !== "live"}
          className={`flex-1 py-2.5 font-mono text-[11px] tracking-[0.22em] uppercase transition-colors ${
            phase === "live"
              ? "bg-ink text-cream hover:bg-ink/90"
              : "bg-ink/20 text-ink-faint cursor-not-allowed"
          }`}
        >
          {phase === "stopping" ? "Sealing manifest…" : "End run →"}
        </button>
      </div>
    </div>
  );
}
