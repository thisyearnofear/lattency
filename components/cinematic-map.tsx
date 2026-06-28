"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import type { CafeStation, Neighbourhood, Tier } from "@/lib/types";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const VIEW_W = 1440;
const VIEW_H = 720;
const CENTER_X = VIEW_W / 2;
const CENTER_Y = VIEW_H / 2;

const TIER_COLOUR: Record<Tier, string> = {
  express: "#006D45",
  local: "#C77F00",
  suspended: "#B23A48",
};
const TIER_TINT: Record<Tier, string> = {
  express: "#9FC7B5",
  local: "#E8C98A",
  suspended: "#DDA0A4",
};

type Hood = {
  id: Neighbourhood;
  label: string;
  ordinal: string;
  d: string;
  anchor: { x: number; y: number };
};

const HOODS: Hood[] = [
  {
    id: "Westlands",
    label: "WESTLANDS",
    ordinal: "01",
    d: "M 80 130 L 380 110 L 440 240 L 390 340 L 90 340 Z",
    anchor: { x: 250, y: 96 },
  },
  {
    id: "Kilimani",
    label: "KILIMANI",
    ordinal: "02",
    d: "M 440 240 L 680 220 L 720 460 L 460 490 Z",
    anchor: { x: 560, y: 196 },
  },
  {
    id: "CBD",
    label: "CBD",
    ordinal: "03",
    d: "M 720 200 L 1000 190 L 1040 470 L 740 470 Z",
    anchor: { x: 860, y: 168 },
  },
  {
    id: "Karen",
    label: "KAREN",
    ordinal: "04",
    d: "M 1040 360 L 1360 350 L 1380 640 L 1060 640 Z",
    anchor: { x: 1210, y: 326 },
  },
];

// Bezier paths — Q endpoints match the station waypoints below.
const TIER_PATH: Record<Tier, string> = {
  express:
    "M 100 220 Q 200 260, 300 280 Q 410 350, 520 380 Q 720 410, 900 320 Q 1060 360, 1200 540 Q 1280 580, 1340 580",
  local:
    "M 100 360 Q 170 340, 250 360 Q 300 370, 340 380 Q 410 400, 480 420 Q 660 460, 820 420 Q 950 460, 1080 560 Q 1140 600, 1180 600 Q 1260 620, 1340 620",
  suspended:
    "M 140 480 Q 360 500, 560 510 Q 720 500, 900 480 Q 1020 460, 1100 460",
};

// Per-cafe waypoint along its tier's path (x/y and 0-1 progress).
const STATION_WAYPOINT: Record<string, { x: number; y: number; progress: number }> = {
  "mock-3": { x: 300, y: 280, progress: 0.13 },
  "mock-6": { x: 520, y: 380, progress: 0.42 },
  "mock-8": { x: 900, y: 320, progress: 0.68 },
  "mock-11": { x: 1200, y: 540, progress: 0.95 },
  "mock-1": { x: 250, y: 360, progress: 0.07 },
  "mock-2": { x: 340, y: 380, progress: 0.18 },
  "mock-4": { x: 480, y: 420, progress: 0.35 },
  "mock-7": { x: 820, y: 420, progress: 0.62 },
  "mock-10": { x: 1080, y: 560, progress: 0.84 },
  "mock-12": { x: 1180, y: 600, progress: 0.93 },
  "mock-5": { x: 560, y: 510, progress: 0.50 },
  "mock-9": { x: 900, y: 480, progress: 0.88 },
};

function splitName(name: string): [string, string?] {
  const upper = name.toUpperCase();
  const words = upper.split(" ");
  if (words.length <= 2 && upper.length <= 16) return [upper];
  const splitAt = words.length <= 3 ? 1 : 2;
  return [words.slice(0, splitAt).join(" "), words.slice(splitAt).join(" ")];
}

function NameLabel({ name, x, y }: { name: string; x: number; y: number }) {
  const [line1, line2] = splitName(name);
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fontFamily="var(--font-display)"
      fontWeight={800}
      fontSize={13}
      letterSpacing="0.04em"
      fill="var(--color-ink)"
    >
      <tspan x={x}>{line1}</tspan>
      {line2 && (
        <tspan x={x} dy={14}>
          {line2}
        </tspan>
      )}
    </text>
  );
}

// ── Chyron (top bar) ────────────────────────────────────────────────────────

type Phase = "wide" | "express" | "local" | "suspended" | "finale";

const PHASE_DETAILS: Record<
  Phase,
  {
    number: string;
    title: string;
    line: string;
    threshold?: string;
    tone: Tier | "neutral";
    blurb: string;
  }
> = {
  wide: {
    number: "00",
    title: "The Whole System",
    line: "ALL LINES",
    tone: "neutral",
    blurb: "Twelve stations. Three lines. One city, measured in megabits.",
  },
  express: {
    number: "01",
    title: "The Express Line",
    line: "EXPRESS",
    threshold: "≥ 50 Mbps",
    tone: "express",
    blurb: "The fastest connections in the city. Four stops, end to end.",
  },
  local: {
    number: "02",
    title: "The Local Line",
    line: "LOCAL",
    threshold: "10 – 49 Mbps",
    tone: "local",
    blurb: "The everyday backbone. Six stops, six neighbourhoods worth.",
  },
  suspended: {
    number: "03",
    title: "Service Suspended",
    line: "SUSPENDED",
    threshold: "< 10 Mbps",
    tone: "suspended",
    blurb: "Two stations where the line keeps dropping. The map shows you why.",
  },
  finale: {
    number: "04",
    title: "The Network, In Full",
    line: "ALL LINES",
    tone: "neutral",
    blurb: "Keep scrolling. The stations index is next.",
  },
};

const PHASE_TONE_BG: Record<Tier | "neutral", string> = {
  express: "bg-express",
  local: "bg-local",
  suspended: "bg-suspended",
  neutral: "bg-ink",
};

function Chyron({
  phase,
  stopsVisited,
  stopsTotal,
}: {
  phase: Phase;
  stopsVisited: number;
  stopsTotal: number;
}) {
  const d = PHASE_DETAILS[phase];
  return (
    <div className="absolute inset-x-0 top-0 z-20 pointer-events-none">
      <div className="border-b border-ink/20 bg-cream/80 backdrop-blur-sm">
        <div className="max-w-[1440px] mx-auto px-6 md:px-12 py-3 flex items-center gap-3 md:gap-5 font-mono text-[11px] tracking-[0.2em] uppercase text-ink-soft">
          <span className="inline-flex items-center gap-2">
            <span className="relative inline-block w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-suspended" />
              <span className="absolute inset-0 rounded-full bg-suspended animate-ping" />
            </span>
            <span className="text-ink">Live</span>
          </span>

          <span className="text-ink-faint">/</span>

          <span className="font-serif italic normal-case text-base text-ink leading-none">
            Section {d.number}
          </span>

          <span className="text-ink-faint">/</span>

          <span className="text-ink font-medium hidden sm:inline">{d.title}</span>

          <span className="ml-auto flex items-center gap-3">
            <span
              className={`${PHASE_TONE_BG[d.tone]} px-2.5 py-1 text-cream tracking-[0.25em] transition-colors duration-500`}
            >
              {d.line}
            </span>
            {d.threshold && (
              <span className="hidden md:inline text-ink-soft">
                {d.threshold}
              </span>
            )}
          </span>
        </div>
      </div>
      <div className="max-w-[1440px] mx-auto px-6 md:px-12 pt-3 hidden md:flex items-center gap-4">
        <p className="font-serif italic text-ink-faint text-base max-w-md">
          {d.blurb}
        </p>
        <span className="ml-auto font-mono text-[10px] tracking-[0.22em] uppercase text-ink-faint">
          Stops ·{" "}
          <span className="text-ink font-medium tabular-nums">
            {String(stopsVisited).padStart(2, "0")}
          </span>{" "}
          / {String(stopsTotal).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}

// ── Route info card (bottom-right) ───────────────────────────────────────────

function RouteCard({
  phase,
  stopsVisited,
  stopsTotal,
  activeStopName,
}: {
  phase: Phase;
  stopsVisited: number;
  stopsTotal: number;
  activeStopName: string | null;
}) {
  const d = PHASE_DETAILS[phase];
  const tone =
    d.tone === "neutral"
      ? "var(--color-ink)"
      : `var(--color-${d.tone})`;
  return (
    <div className="absolute bottom-8 right-6 md:right-10 z-20 pointer-events-none max-w-[320px]">
      <div className="bg-cream/95 border border-ink/80 px-4 py-3 font-mono text-[10px] tracking-[0.22em] uppercase text-ink-soft">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ background: tone }}
          />
          <span className="text-ink font-medium">{d.line}</span>
          <span className="text-ink-faint">·</span>
          <span>Now boarding</span>
        </div>
        <p className="font-display font-black uppercase tracking-[-0.01em] text-ink text-2xl mt-2 leading-none truncate min-h-[1.5em]">
          {activeStopName ?? "—"}
        </p>
        <div className="mt-3 h-0.5 bg-cream-deep relative overflow-hidden">
          <span
            className="absolute inset-y-0 left-0 transition-[width] duration-300"
            style={{
              width: `${Math.min(100, (stopsVisited / Math.max(1, stopsTotal)) * 100)}%`,
              background: tone,
            }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[9px] text-ink-faint">
          <span>Route progress</span>
          <span className="tabular-nums text-ink">
            {Math.round((stopsVisited / Math.max(1, stopsTotal)) * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}

// ── CinematicMap ─────────────────────────────────────────────────────────────

export function CinematicMap({ cafes }: { cafes: CafeStation[] }) {
  const scope = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("wide");
  const [stopsVisited, setStopsVisited] = useState(0);
  const [activeStopName, setActiveStopName] = useState<string | null>(null);

  const stopsTotal = cafes.length;

  useGSAP(
    () => {
      if (!scope.current) return;

      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (reduceMotion) {
        gsap.set(".cm-line", { strokeDashoffset: 0, opacity: 1 });
        gsap.set(".cm-station", { opacity: 1, scale: 1 });
        gsap.set(".cm-train-wrap", { opacity: 1 });
        gsap.set(".cm-pov", { x: 0, y: 0, scale: 1 });
        gsap.set(".cm-pan", { x: 0, y: 0 });
        return;
      }

      gsap.set(".cm-pov", { x: 0, y: 0, scale: 1 });
      gsap.set(".cm-pan", { x: 0, y: 0 });

      const expressLine = document.querySelector<SVGPathElement>(
        ".cm-line-express",
      );
      const localLine = document.querySelector<SVGPathElement>(
        ".cm-line-local",
      );
      const suspendedLine = document.querySelector<SVGPathElement>(
        ".cm-line-suspended",
      );

      const lenE = expressLine?.getTotalLength() ?? 1500;
      const lenL = localLine?.getTotalLength() ?? 1800;

      gsap.set(".cm-line-express", {
        strokeDasharray: lenE,
        strokeDashoffset: lenE,
      });
      gsap.set(".cm-line-local", {
        strokeDasharray: lenL,
        strokeDashoffset: lenL,
      });
      // Suspended line is genuinely dashed (broken-service look).
      gsap.set(".cm-line-suspended", {
        strokeDasharray: "14 9",
        opacity: 0,
      });

      gsap.set(".cm-station", {
        opacity: 0,
        scale: 0,
        transformOrigin: "50% 50%",
      });

      gsap.set(".cm-train-wrap", { opacity: 0 });
      gsap.set(".cm-train", { x: 0, y: 0 });

      const xTo = gsap.quickTo(".cm-pan", "x", {
        duration: 1,
        ease: "expo.out",
      });
      const yTo = gsap.quickTo(".cm-pan", "y", {
        duration: 1,
        ease: "expo.out",
      });

      const driveTrain = (
        lineEl: SVGPathElement | null,
        label: string,
        ease: string,
        maxProgress = 1,
      ) => {
        if (!lineEl) return;
        const length = lineEl.getTotalLength();
        const progress = { value: 0 };
        tl.to(
          progress,
          {
            value: maxProgress,
            duration: 1,
            ease,
            onUpdate: () => {
              const p = lineEl.getPointAtLength(progress.value * length);
              gsap.set(".cm-train", { x: p.x, y: p.y });
              xTo(-p.x);
              yTo(-p.y);
            },
          },
          label,
        );
      };

      const drawLine = (selector: string, label: string, ease: string) => {
        tl.to(
          selector,
          { strokeDashoffset: 0, duration: 1, ease },
          label,
        );
      };

      const popStationsForTier = (
        tier: Tier,
        label: string,
        maxProgress = 1,
      ) => {
        cafes
          .filter((c) => c.tier === tier && STATION_WAYPOINT[c.id])
          .sort(
            (a, b) =>
              STATION_WAYPOINT[a.id].progress -
              STATION_WAYPOINT[b.id].progress,
          )
          .forEach((c) => {
            const wp = STATION_WAYPOINT[c.id];
            if (wp.progress > maxProgress) return;
            tl.to(
              `.cm-station[data-cafe-id="${c.id}"]`,
              {
                opacity: 1,
                scale: 1,
                duration: 0.25,
                ease: "back.out(1.8)",
              },
              `${label}+=${Math.max(0.02, wp.progress - 0.04)}`,
            );
          });
      };

      const tickStopVisits = (
        tier: Tier,
        label: string,
        maxProgress = 1,
      ) => {
        cafes
          .filter((c) => c.tier === tier && STATION_WAYPOINT[c.id])
          .sort(
            (a, b) =>
              STATION_WAYPOINT[a.id].progress -
              STATION_WAYPOINT[b.id].progress,
          )
          .forEach((c) => {
            const wp = STATION_WAYPOINT[c.id];
            if (wp.progress > maxProgress) return;
            tl.call(
              () => {
                setStopsVisited((n) => n + 1);
                setActiveStopName(c.name);
              },
              undefined,
              `${label}+=${wp.progress}`,
            );
          });
      };

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: scope.current,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.6,
        },
      });

      // ── Phase 0 — Wide overview ────────────────────────────────────
      tl.addLabel("wide")
        .call(
          () => {
            setPhase("wide");
            setStopsVisited(0);
            setActiveStopName(null);
          },
          undefined,
          "wide",
        )
        .to(
          ".cm-pov",
          { scale: 1, x: 0, y: 0, duration: 0.5, ease: "power2.inOut" },
          "wide",
        )
        .to(
          ".cm-pan",
          { x: 0, y: 0, duration: 0.5, ease: "power2.inOut" },
          "wide",
        );

      // ── Phase 1 — Express tour ────────────────────────────────────
      tl.addLabel("express")
        .call(
          () => {
            setPhase("express");
            setStopsVisited(0);
            setActiveStopName(null);
          },
          undefined,
          "express",
        )
        .to(".cm-train-wrap", { opacity: 1, duration: 0.05 }, "express")
        .to(
          ".cm-pov",
          {
            scale: 1.9,
            x: CENTER_X,
            y: CENTER_Y,
            duration: 0.6,
            ease: "power2.inOut",
          },
          "express",
        );
      driveTrain(expressLine, "express", "power1.inOut");
      drawLine(".cm-line-express", "express", "power1.inOut");
      popStationsForTier("express", "express");
      tickStopVisits("express", "express");

      // ── Phase 2 — Local tour ───────────────────────────────────────
      tl.addLabel("local")
        .call(
          () => {
            setPhase("local");
            setStopsVisited(0);
            setActiveStopName(null);
          },
          undefined,
          "local",
        )
        .to(
          ".cm-pov",
          {
            scale: 1.7,
            x: CENTER_X,
            y: CENTER_Y,
            duration: 0.6,
            ease: "power2.inOut",
          },
          "local",
        );
      driveTrain(localLine, "local", "power1.inOut");
      drawLine(".cm-line-local", "local", "power1.inOut");
      popStationsForTier("local", "local");
      tickStopVisits("local", "local");

      // ── Phase 3 — Suspended tour (stutter, service drops out) ─────
      tl.addLabel("suspended")
        .call(
          () => {
            setPhase("suspended");
            setStopsVisited(0);
            setActiveStopName(null);
          },
          undefined,
          "suspended",
        )
        .to(
          ".cm-pov",
          {
            scale: 1.75,
            x: CENTER_X,
            y: CENTER_Y,
            duration: 0.6,
            ease: "power2.inOut",
          },
          "suspended",
        );
      // Train only makes it ~65% — past Brew Bistro service drops, Dormans never lights up.
      driveTrain(suspendedLine, "suspended", "steps(8)", 0.65);
      // Suspended line fades in (the dashed pattern means strokeDashoffset won't draw it).
      tl.to(
        ".cm-line-suspended",
        { opacity: 0.85, duration: 0.5, ease: "power1.in" },
        "suspended",
      );
      popStationsForTier("suspended", "suspended", 0.65);
      tickStopVisits("suspended", "suspended", 0.65);
      // After Brew Bistro, the line and train fade — service drops out.
      tl.to(
        ".cm-line-suspended",
        { opacity: 0.2, duration: 0.3, ease: "power1.in" },
        "suspended+=0.55",
      ).to(
        ".cm-train-wrap",
        { opacity: 0.4, duration: 0.3, ease: "power1.in" },
        "suspended+=0.55",
      );

      // ── Phase 4 — Finale, zoom back out ────────────────────────────
      tl.addLabel("finale")
        .call(
          () => {
            setPhase("finale");
            setActiveStopName(null);
          },
          undefined,
          "finale",
        )
        .to(".cm-train-wrap", { opacity: 0, duration: 0.2 }, "finale")
        .to(
          ".cm-pov",
          { scale: 1, x: 0, y: 0, duration: 0.8, ease: "power3.inOut" },
          "finale",
        )
        .to(
          ".cm-pan",
          { x: 0, y: 0, duration: 0.8, ease: "power3.inOut" },
          "finale",
        )
        .to(
          ".cm-station",
          {
            opacity: 1,
            scale: 1,
            stagger: 0.015,
            duration: 0.2,
            ease: "power2.out",
          },
          "finale",
        );
    },
    { scope, dependencies: [cafes] },
  );

  return (
    <section ref={scope} className="relative h-[700vh] -mx-6 md:-mx-12">
      <div className="sticky top-0 h-screen overflow-hidden bg-cream">
        <Chyron
          phase={phase}
          stopsVisited={stopsVisited}
          stopsTotal={stopsTotal}
        />

        <div className="absolute inset-0 grid place-items-center px-6 md:px-12 pt-24 pb-24">
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="transit-svg w-full max-h-[78vh]"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Cinematic metro map of Nairobi café wifi speeds"
          >
            <defs>
              <pattern
                id="cm-grid"
                width="40"
                height="40"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 40 0 L 0 0 0 40"
                  fill="none"
                  stroke="var(--color-cream-deep)"
                  strokeWidth={0.6}
                />
              </pattern>
              <radialGradient id="cm-paper" cx="50%" cy="42%" r="78%">
                <stop offset="0%" stopColor="#F8F1DE" />
                <stop offset="100%" stopColor="#E5DBBE" />
              </radialGradient>
              <radialGradient id="cm-train-glow">
                <stop offset="0%" stopColor="#FFF6E0" stopOpacity="0.95" />
                <stop offset="55%" stopColor="#FFF6E0" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#FFF6E0" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Static page chrome */}
            <rect
              x={0}
              y={0}
              width={VIEW_W}
              height={VIEW_H}
              fill="url(#cm-paper)"
            />
            <rect
              x={0}
              y={0}
              width={VIEW_W}
              height={VIEW_H}
              fill="url(#cm-grid)"
              opacity={0.6}
            />

            {/* Compass */}
            <g transform={`translate(${VIEW_W - 90} ${VIEW_H - 130})`}>
              <circle
                r={28}
                fill="var(--color-cream)"
                stroke="var(--color-ink)"
                strokeWidth={1}
              />
              <circle
                r={28}
                fill="none"
                stroke="var(--color-ink-soft)"
                strokeWidth={0.5}
                strokeDasharray="1 4"
              />
              <line
                x1={0}
                y1={-26}
                x2={0}
                y2={26}
                stroke="var(--color-ink)"
                strokeWidth={1}
              />
              <line
                x1={-26}
                y1={0}
                x2={26}
                y2={0}
                stroke="var(--color-ink)"
                strokeWidth={0.6}
              />
              <polygon
                points="0,-24 -4,-14 0,-18 4,-14"
                fill="var(--color-ink)"
              />
              <text
                x={0}
                y={-32}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fontSize={9}
                fontWeight={600}
                letterSpacing="0.18em"
                fill="var(--color-ink)"
              >
                N
              </text>
              <text
                x={36}
                y={3}
                fontFamily="var(--font-serif)"
                fontStyle="italic"
                fontSize={10}
                fill="var(--color-ink-faint)"
              >
                true
              </text>
            </g>

            {/* Scale bar */}
            <g transform={`translate(64 ${VIEW_H - 70})`}>
              <line
                x1={0}
                y1={0}
                x2={120}
                y2={0}
                stroke="var(--color-ink)"
                strokeWidth={2}
              />
              <line
                x1={0}
                y1={-4}
                x2={0}
                y2={4}
                stroke="var(--color-ink)"
                strokeWidth={2}
              />
              <line
                x1={60}
                y1={-3}
                x2={60}
                y2={3}
                stroke="var(--color-ink)"
                strokeWidth={1.2}
              />
              <line
                x1={120}
                y1={-4}
                x2={120}
                y2={4}
                stroke="var(--color-ink)"
                strokeWidth={2}
              />
              <text
                x={0}
                y={18}
                fontFamily="var(--font-mono)"
                fontSize={9}
                letterSpacing="0.2em"
                fill="var(--color-ink-soft)"
              >
                0
              </text>
              <text
                x={60}
                y={18}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fontSize={9}
                letterSpacing="0.2em"
                fill="var(--color-ink-soft)"
              >
                2 KM
              </text>
              <text
                x={120}
                y={18}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fontSize={9}
                letterSpacing="0.2em"
                fill="var(--color-ink-soft)"
              >
                4
              </text>
            </g>

            {/* ── POV group — scaled & translated ───────────────── */}
            <g className="cm-pov">
              <g className="cm-pan">
                {/* Neighbourhood polygons */}
                <g className="cm-neighbourhoods">
                  {HOODS.map((h) => (
                    <g key={h.id}>
                      <path
                        d={h.d}
                        fill="var(--color-cream-edge)"
                        stroke="var(--color-ink-faint)"
                        strokeWidth={1}
                        strokeDasharray="3 5"
                        opacity={0.5}
                      />
                      <path
                        d={h.d}
                        fill="none"
                        stroke="var(--color-ink)"
                        strokeWidth={0.6}
                        opacity={0.22}
                      />
                      <text
                        x={h.anchor.x}
                        y={h.anchor.y}
                        textAnchor="middle"
                        fontFamily="var(--font-mono)"
                        fontSize={10}
                        fontWeight={500}
                        letterSpacing="0.32em"
                        fill="var(--color-ink-soft)"
                        opacity={0.75}
                      >
                        {h.ordinal} · {h.label}
                      </text>
                    </g>
                  ))}
                </g>

                {/* Faint glow halos under each line for depth */}
                <path
                  d={TIER_PATH.express}
                  fill="none"
                  stroke={TIER_TINT.express}
                  strokeWidth={26}
                  strokeLinecap="round"
                  opacity={0.35}
                />
                <path
                  d={TIER_PATH.local}
                  fill="none"
                  stroke={TIER_TINT.local}
                  strokeWidth={26}
                  strokeLinecap="round"
                  opacity={0.35}
                />
                <path
                  d={TIER_PATH.suspended}
                  fill="none"
                  stroke={TIER_TINT.suspended}
                  strokeWidth={26}
                  strokeLinecap="round"
                  opacity={0.3}
                />

                {/* The visible bezier paths */}
                <path
                  className="cm-line cm-line-express"
                  d={TIER_PATH.express}
                  fill="none"
                  stroke={TIER_COLOUR.express}
                  strokeWidth={11}
                  strokeLinecap="round"
                />
                <path
                  className="cm-line cm-line-local"
                  d={TIER_PATH.local}
                  fill="none"
                  stroke={TIER_COLOUR.local}
                  strokeWidth={9}
                  strokeLinecap="round"
                />
                <path
                  className="cm-line cm-line-suspended"
                  d={TIER_PATH.suspended}
                  fill="none"
                  stroke={TIER_COLOUR.suspended}
                  strokeWidth={8}
                  strokeLinecap="butt"
                />

                {/* Stations */}
                {cafes.map((cafe) => {
                  const wp = STATION_WAYPOINT[cafe.id];
                  if (!wp) return null;
                  const stroke =
                    cafe.tier === "suspended"
                      ? "var(--color-suspended-ink)"
                      : "var(--color-ink)";
                  return (
                    <g
                      key={cafe.id}
                      className={`cm-station cm-station-${cafe.tier}`}
                      data-cafe-id={cafe.id}
                      data-tier={cafe.tier}
                    >
                      <circle
                        cx={wp.x}
                        cy={wp.y}
                        r={17}
                        fill="var(--color-cream)"
                        opacity={0.88}
                      />
                      <text
                        x={wp.x}
                        y={wp.y - 24}
                        textAnchor="middle"
                        fontFamily="var(--font-mono)"
                        fontWeight={600}
                        fontSize={12}
                        fill={TIER_COLOUR[cafe.tier]}
                        letterSpacing="0.04em"
                      >
                        {Math.round(cafe.medianDownMbps)}
                      </text>
                      <circle
                        cx={wp.x}
                        cy={wp.y}
                        r={11}
                        fill="var(--color-cream)"
                        stroke={stroke}
                        strokeWidth={3}
                      />
                      <circle
                        cx={wp.x}
                        cy={wp.y}
                        r={3}
                        fill={TIER_COLOUR[cafe.tier]}
                      />
                      <NameLabel name={cafe.name} x={wp.x} y={wp.y + 32} />
                    </g>
                  );
                })}

                {/* The train — positioned along the active path */}
                <g className="cm-train-wrap">
                  <g className="cm-train" transform="translate(0 0)">
                    <circle
                      r={34}
                      fill="url(#cm-train-glow)"
                      className="cm-train-aura"
                    />
                    <circle
                      r={18}
                      fill="var(--color-cream)"
                      stroke="var(--color-ink)"
                      strokeWidth={3}
                    />
                    <circle r={6} fill="var(--color-ink)" />
                    <circle r={2.5} fill="var(--color-cream)" />
                  </g>
                </g>
              </g>
            </g>

            {/* Edition stamp — static */}
            <text
              x={1408}
              y={VIEW_H - 16}
              textAnchor="end"
              fontFamily="var(--font-mono)"
              fontSize={10}
              letterSpacing="0.22em"
              fill="var(--color-ink-faint)"
            >
              EDITION 01 · NAIROBI · 2026.06.29
            </text>
            <text
              x={100}
              y={VIEW_H - 16}
              textAnchor="start"
              fontFamily="var(--font-serif)"
              fontStyle="italic"
              fontSize={12}
              fill="var(--color-ink-faint)"
            >
              printed from live measurements
            </text>
          </svg>
        </div>

        <RouteCard
          phase={phase}
          stopsVisited={stopsVisited}
          stopsTotal={stopsTotal}
          activeStopName={activeStopName}
        />

        <div className="absolute inset-x-0 bottom-3 text-center pointer-events-none">
          <p className="font-mono text-[10px] tracking-[0.32em] uppercase text-ink-faint">
            scroll to ride the lines ↓
          </p>
        </div>
      </div>
    </section>
  );
}
