"use client";

import { useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { useGSAP } from "@gsap/react";
import type { CafeStation, Tier } from "@/lib/types";
import {
  CENTER_X,
  CENTER_Y,
  HOODS,
  STATION_WAYPOINT,
  TIER_COLOUR,
  TIER_PATH,
  TIER_TINT,
  VIEW_H,
  VIEW_W,
  WORLD_CITIES,
  WORLD_OUTLINE_D,
  projectLatLng,
  smoothPathThrough,
  splitName,
} from "@/lib/map-data";

gsap.registerPlugin(ScrollTrigger, MotionPathPlugin, DrawSVGPlugin, useGSAP);

// ── Phases ───────────────────────────────────────────────────────────────────

type Phase =
  | "intro"
  | "wide"
  | "express"
  | "local"
  | "suspended"
  | "finale";

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
  intro: {
    number: "00",
    title: "Boarding",
    line: "ALL LINES",
    tone: "neutral",
    blurb: "Twelve stations. Three lines. One city, measured in megabits.",
  },
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
    title: "One Engine, Every City",
    line: "GLOBAL",
    tone: "neutral",
    blurb: "Nairobi was the first board. The next twelve thousand are next.",
  },
};

const PHASE_TONE_BG: Record<Tier | "neutral", string> = {
  express: "bg-express",
  local: "bg-local",
  suspended: "bg-suspended",
  neutral: "bg-ink",
};

// ── View mode ────────────────────────────────────────────────────────────────

type ViewMode = "schematic" | "geographic";

// ── Small presentational helpers ─────────────────────────────────────────────

function NameLabel({
  name,
  x,
  y,
  className,
}: {
  name: string;
  x: number;
  y: number;
  className?: string;
}) {
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
      className={className}
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

// ── Chyron (top bar) ──────────────────────────────────────────────────────────

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
  activeStopVibe,
}: {
  phase: Phase;
  stopsVisited: number;
  stopsTotal: number;
  activeStopName: string | null;
  activeStopVibe: string | null;
}) {
  const d = PHASE_DETAILS[phase];
  const tone =
    d.tone === "neutral" ? "var(--color-ink)" : `var(--color-${d.tone})`;
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
        {activeStopVibe && (
          <p className="font-serif italic normal-case tracking-normal text-ink-faint text-xs mt-1.5">
            {activeStopVibe}
          </p>
        )}
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

// ── View toggle (bottom-left) ────────────────────────────────────────────────

function ViewToggle({
  view,
  onChange,
  disabled,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
  disabled: boolean;
}) {
  return (
    <div className="absolute bottom-8 left-6 md:left-10 z-20 pointer-events-auto max-w-[260px]">
      {/* Contextual caption — spells out what the metaphor toggle does, so the
          "lines are speed, not streets" idea never needs explaining twice. */}
      <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-ink-soft mb-1.5 leading-snug">
        {view === "schematic" ? (
          <>
            <span className="text-ink">Schematic</span> · lines are speed tiers
          </>
        ) : (
          <>
            <span className="text-ink">Geographic</span> · true café locations
          </>
        )}
      </p>
      <div className="cm-toggle-hint inline-flex items-center gap-1 bg-cream/95 border border-ink/80 p-1 font-mono text-[10px] tracking-[0.2em] uppercase">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("schematic")}
          className={`px-2.5 py-1.5 transition-colors disabled:opacity-40 ${
            view === "schematic"
              ? "bg-ink text-cream"
              : "text-ink-soft hover:text-ink"
          }`}
        >
          Schematic
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("geographic")}
          className={`px-2.5 py-1.5 transition-colors disabled:opacity-40 ${
            view === "geographic"
              ? "bg-ink text-cream"
              : "text-ink-soft hover:text-ink"
          }`}
        >
          Geographic
        </button>
      </div>
    </div>
  );
}

// ── CinematicMap ─────────────────────────────────────────────────────────────

export function CinematicMap({ cafes }: { cafes: CafeStation[] }) {
  const scope = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [stopsVisited, setStopsVisited] = useState(0);
  const [activeStopName, setActiveStopName] = useState<string | null>(null);
  const [activeStopVibe, setActiveStopVibe] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("schematic");
  const [toggleDisabled, setToggleDisabled] = useState(false);

  const stopsTotal = cafes.length;

  // Pre-compute geographic positions + smoothed tier paths for the geographic view.
  const geo = useMemo(() => {
    const positions = new Map<string, { x: number; y: number }>();
    for (const c of cafes) {
      positions.set(c.id, projectLatLng(c.lat, c.lng));
    }
    const tierPoints: Record<Tier, Array<{ x: number; y: number }>> = {
      express: [],
      local: [],
      suspended: [],
    };
    for (const c of cafes) {
      const p = positions.get(c.id);
      if (p) tierPoints[c.tier].push(p);
    }
    // Sort by x (west → east) so the line reads left-to-right.
    (Object.keys(tierPoints) as Tier[]).forEach((t) =>
      tierPoints[t].sort((a, b) => a.x - b.x),
    );
    return {
      positions,
      paths: {
        express: smoothPathThrough(tierPoints.express),
        local: smoothPathThrough(tierPoints.local),
        suspended: smoothPathThrough(tierPoints.suspended),
      } as Record<Tier, string>,
    };
  }, [cafes]);

  // The path source switches with the view mode.
  const tierPath = (t: Tier) =>
    view === "geographic" ? geo.paths[t] : TIER_PATH[t];
  // Schematic positions are keyed by café name. If a name is unknown (a future
  // city, a renamed café), fall back to the geographic projection so the
  // station still lands somewhere sensible instead of vanishing.
  const stationPos = (c: CafeStation) =>
    view === "geographic"
      ? (geo.positions.get(c.id) ?? STATION_WAYPOINT[c.name])
      : (STATION_WAYPOINT[c.name] ?? geo.positions.get(c.id));

  useGSAP(
    () => {
      if (!scope.current) return;

      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (reduceMotion) {
        gsap.set(".cm-line", { drawSVG: "100%", opacity: 1 });
        gsap.set(".cm-station", { opacity: 1, scale: 1 });
        gsap.set(".cm-train-wrap", { opacity: 1 });
        gsap.set(".cm-pov", { x: 0, y: 0, scale: 1 });
        gsap.set(".cm-pan", { x: 0, y: 0 });
        gsap.set(".cm-parallax-far", { opacity: 0.5 });
        gsap.set(".cm-parallax-mid", { opacity: 0.8 });
        gsap.set(".cm-atmos", { opacity: 0 });
        gsap.set(".cm-vignette", { opacity: 0.3 });
        gsap.set(".cm-world", { opacity: 0 });
        return;
      }

      // ── Initial state ────────────────────────────────────────────────
      gsap.set(".cm-pov", { x: 0, y: 0, scale: 1.4 });
      gsap.set(".cm-pan", { x: 0, y: 0 });

      // DrawSVG gives us clean path-drawing primitives. Lines start empty.
      gsap.set(".cm-line-express", { drawSVG: "0%", opacity: 1 });
      gsap.set(".cm-line-local", { drawSVG: "0%", opacity: 1 });
      gsap.set(".cm-line-suspended", { drawSVG: "0%", opacity: 0 });

      // Parallax depth layers — distant grid, neighbourhoods, stations.
      gsap.set(".cm-parallax-far", { opacity: 0.35 });
      gsap.set(".cm-parallax-mid", { opacity: 0.7 });

      // Atmosphere starts off, intensifies when zoomed into a line.
      gsap.set(".cm-atmos", { opacity: 0 });
      gsap.set(".cm-vignette", { opacity: 0.15 });

      // Stations start hidden, pop as the train visits them.
      gsap.set(".cm-station", {
        opacity: 0,
        scale: 0,
        transformOrigin: "50% 50%",
      });

      // Train marker.
      gsap.set(".cm-train-wrap", { opacity: 0 });

      // World layer (finale) starts invisible.
      gsap.set(".cm-world", { opacity: 0 });
      gsap.set(".cm-world-outline", { drawSVG: "0%", opacity: 0.4 });
      gsap.set(".cm-world-city", { opacity: 0, scale: 0, transformOrigin: "50% 50%" });
      gsap.set(".cm-world-arc", { drawSVG: "0%", opacity: 0 });

      // ── Camera quickTo functions ─────────────────────────────────────
      // These are the heart of the "camera" rig: optimized tweeners that
      // we call every frame to follow the train, exactly as the GSAP
      // scroll-driven SVG tutorial prescribes.
      const xTo = gsap.quickTo(".cm-pan", "x", {
        duration: 1,
        ease: "expo.out",
      });
      const yTo = gsap.quickTo(".cm-pan", "y", {
        duration: 1,
        ease: "expo.out",
      });

      // ── Timeline ─────────────────────────────────────────────────────
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: scope.current,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.6,
        },
      });

      // ── Helper: drive the train along a path using MotionPathPlugin ──
      // This replaces the manual getPointAtLength loop. MotionPathPlugin
      // animates a proxy object along the SVG path; we read its x/y each
      // frame and feed the camera quickTo functions — the tutorial pattern.
      const driveTrain = (
        pathSelector: string,
        label: string,
        ease: string,
        maxProgress = 1,
      ) => {
        const proxy = { x: 0, y: 0 };
        tl.to(
          proxy,
          {
            motionPath: {
              path: pathSelector,
              end: maxProgress,
            },
            duration: 1,
            ease,
            onStart: () => gsap.set(".cm-train-wrap", { opacity: 1 }),
            onUpdate: () => {
              gsap.set(".cm-train", { x: proxy.x, y: proxy.y });
              // Camera follows: invert the train position to center it.
              xTo(-proxy.x);
              yTo(-proxy.y);
            },
          },
          label,
        );
      };

      // ── Helper: draw a line with DrawSVGPlugin ────────────────────────
      const drawLine = (selector: string, label: string, ease: string) => {
        tl.to(
          selector,
          { drawSVG: "100%", duration: 1, ease },
          label,
        );
      };

      // ── Helper: pop stations as the train passes them ────────────────
      const popStationsForTier = (
        tier: Tier,
        label: string,
        maxProgress = 1,
      ) => {
        cafes
          .filter((c) => c.tier === tier && STATION_WAYPOINT[c.name])
          .sort(
            (a, b) =>
              STATION_WAYPOINT[a.name].progress -
              STATION_WAYPOINT[b.name].progress,
          )
          .forEach((c) => {
            const wp = STATION_WAYPOINT[c.name];
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

      // ── Helper: tick the stops-visited counter ───────────────────────
      const tickStopVisits = (
        tier: Tier,
        label: string,
        maxProgress = 1,
      ) => {
        cafes
          .filter((c) => c.tier === tier && STATION_WAYPOINT[c.name])
          .sort(
            (a, b) =>
              STATION_WAYPOINT[a.name].progress -
              STATION_WAYPOINT[b.name].progress,
          )
          .forEach((c) => {
            const wp = STATION_WAYPOINT[c.name];
            if (wp.progress > maxProgress) return;
            tl.call(
              () => {
                setStopsVisited((n) => n + 1);
                setActiveStopName(c.name);
                setActiveStopVibe(c.vibe);
              },
              undefined,
              `${label}+=${wp.progress}`,
            );
          });
      };

      // ═════════════════════════════════════════════════════════════════
      // PHASE 0 — Intro: the map fades in, camera settles from above.
      // A theatrical opening beat — the paper folds open.
      // ═════════════════════════════════════════════════════════════════
      tl.addLabel("intro")
        .call(
          () => {
            setPhase("intro");
            setStopsVisited(0);
            setActiveStopName(null);
            setActiveStopVibe(null);
          },
          undefined,
          "intro",
        )
        .fromTo(
          ".cm-pov",
          { scale: 2.4, x: -120, y: -80 },
          { scale: 1.4, x: 0, y: 0, duration: 0.5, ease: "power3.out" },
          "intro",
        )
        .fromTo(
          ".cm-parallax-far",
          { opacity: 0 },
          { opacity: 0.35, duration: 0.4 },
          "intro",
        )
        .fromTo(
          ".cm-parallax-mid",
          { opacity: 0 },
          { opacity: 0.7, duration: 0.4 },
          "intro+=0.05",
        )
        .fromTo(
          ".cm-vignette",
          { opacity: 0 },
          { opacity: 0.15, duration: 0.5 },
          "intro",
        );

      // ═════════════════════════════════════════════════════════════════
      // PHASE 1 — Wide overview: all lines draw at once, camera steady.
      // ═════════════════════════════════════════════════════════════════
      tl.addLabel("wide")
        .call(
          () => {
            setPhase("wide");
            setStopsVisited(0);
            setActiveStopName(null);
            setActiveStopVibe(null);
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

      // Draw all three lines concurrently in the wide view.
      drawLine(".cm-line-express", "wide", "power1.inOut");
      drawLine(".cm-line-local", "wide+=0.05", "power1.inOut");
      tl.to(
        ".cm-line-suspended",
        { opacity: 0.85, drawSVG: "100%", duration: 0.9, ease: "power1.inOut" },
        "wide+=0.1",
      );

      // Pop all stations in the wide view, staggered.
      tl.to(
        ".cm-station",
        {
          opacity: 1,
          scale: 1,
          stagger: { each: 0.025, from: "start" },
          duration: 0.2,
          ease: "back.out(1.6)",
        },
        "wide+=0.3",
      );

      // ═════════════════════════════════════════════════════════════════
      // PHASE 2 — Express tour: zoom in, ride the green line.
      // ═════════════════════════════════════════════════════════════════
      tl.addLabel("express")
        .call(
          () => {
            setPhase("express");
            setStopsVisited(0);
            setActiveStopName(null);
            setActiveStopVibe(null);
          },
          undefined,
          "express",
        )
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
        )
        // Atmosphere intensifies — vignette + active-line glow.
        .to(".cm-atmos", { opacity: 0.6, duration: 0.4 }, "express")
        .to(".cm-vignette", { opacity: 0.35, duration: 0.4 }, "express")
        // Dim the non-active lines slightly.
        .to(".cm-line-local", { opacity: 0.25, duration: 0.4 }, "express")
        .to(".cm-line-suspended", { opacity: 0.15, duration: 0.4 }, "express");

      driveTrain(".cm-line-express", "express", "power1.inOut");
      popStationsForTier("express", "express");
      tickStopVisits("express", "express");

      // ═════════════════════════════════════════════════════════════════
      // PHASE 3 — Local tour: amber line, the everyday backbone.
      // ═════════════════════════════════════════════════════════════════
      tl.addLabel("local")
        .call(
          () => {
            setPhase("local");
            setStopsVisited(0);
            setActiveStopName(null);
            setActiveStopVibe(null);
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
        )
        // Restore express line, dim it; bring local to full.
        .to(".cm-line-express", { opacity: 0.3, duration: 0.4 }, "local")
        .to(".cm-line-local", { opacity: 1, duration: 0.4 }, "local")
        .to(".cm-line-suspended", { opacity: 0.15, duration: 0.4 }, "local");

      driveTrain(".cm-line-local", "local", "power1.inOut");
      popStationsForTier("local", "local");
      tickStopVisits("local", "local");

      // ═════════════════════════════════════════════════════════════════
      // PHASE 4 — Suspended tour: the line stutters, service drops out.
      // The train only makes it 65% before the signal dies.
      // ═════════════════════════════════════════════════════════════════
      tl.addLabel("suspended")
        .call(
          () => {
            setPhase("suspended");
            setStopsVisited(0);
            setActiveStopName(null);
            setActiveStopVibe(null);
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
        )
        .to(".cm-line-express", { opacity: 0.2, duration: 0.4 }, "suspended")
        .to(".cm-line-local", { opacity: 0.2, duration: 0.4 }, "suspended")
        .to(".cm-line-suspended", { opacity: 1, duration: 0.4 }, "suspended");

      // Train stutters (steps ease = jerky motion) and only reaches 65%.
      driveTrain(".cm-line-suspended", "suspended", "steps(8)", 0.65);
      popStationsForTier("suspended", "suspended", 0.65);
      tickStopVisits("suspended", "suspended", 0.65);

      // After 65%, service drops — line and train fade.
      tl.to(
        ".cm-line-suspended",
        { opacity: 0.2, duration: 0.3, ease: "power1.in" },
        "suspended+=0.55",
      ).to(
        ".cm-train-wrap",
        { opacity: 0.4, duration: 0.3, ease: "power1.in" },
        "suspended+=0.55",
      );

      // ═════════════════════════════════════════════════════════════════
      // PHASE 5 — Global finale: zoom way out, Nairobi becomes one star
      // in a constellation of world cities. The "twelve thousand" promise.
      // ═════════════════════════════════════════════════════════════════
      tl.addLabel("finale")
        .call(
          () => {
            setPhase("finale");
            setActiveStopName(null);
            setActiveStopVibe(null);
          },
          undefined,
          "finale",
        )
        // Fade out the city map layers.
        .to(".cm-train-wrap", { opacity: 0, duration: 0.2 }, "finale")
        .to(".cm-atmos", { opacity: 0, duration: 0.3 }, "finale")
        .to(".cm-vignette", { opacity: 0.5, duration: 0.5 }, "finale")
        .to(
          [".cm-line-express", ".cm-line-local", ".cm-line-suspended"],
          { opacity: 0.1, duration: 0.4 },
          "finale",
        )
        .to(".cm-station", { opacity: 0.15, scale: 0.4, duration: 0.4 }, "finale")
        .to(".cm-parallax-far", { opacity: 0.1, duration: 0.4 }, "finale")
        .to(".cm-parallax-mid", { opacity: 0.15, duration: 0.4 }, "finale")
        // City-scale chrome (compass + 2 KM scale + edition stamps) makes no
        // sense over a world map — fade it as the globe takes over.
        .to(".cm-city-chrome", { opacity: 0, duration: 0.35 }, "finale")
        // Zoom the POV way out and recenter.
        .to(
          ".cm-pov",
          { scale: 0.45, x: 0, y: 0, duration: 0.7, ease: "power2.inOut" },
          "finale",
        )
        .to(
          ".cm-pan",
          { x: 0, y: 0, duration: 0.7, ease: "power2.inOut" },
          "finale",
        )
        // Reveal the world layer.
        .to(".cm-world", { opacity: 1, duration: 0.4 }, "finale+=0.2")
        // Draw the continent outline.
        .to(
          ".cm-world-outline",
          { drawSVG: "100%", duration: 0.5, ease: "power1.inOut" },
          "finale+=0.2",
        );

      // Light up each city, staggered — Nairobi pulses first, then the rest.
      const darkCities = WORLD_CITIES.filter((c) => !c.lit);

      // Nairobi gets a pulse.
      tl.to(
        `.cm-world-city[data-city-id="nairobi"]`,
        { opacity: 1, scale: 1.4, duration: 0.3, ease: "back.out(2)" },
        "finale+=0.3",
      ).to(
        `.cm-world-city[data-city-id="nairobi"]`,
        { scale: 1, duration: 0.3, ease: "power2.out" },
        "finale+=0.55",
      );

      // Draw arcs from Nairobi to each dark city, then light them.
      darkCities.forEach((city, i) => {
        const arcSel = `.cm-world-arc[data-target="${city.id}"]`;
        const citySel = `.cm-world-city[data-city-id="${city.id}"]`;
        const pos = `finale+=${0.6 + i * 0.06}`;
        tl.to(
          arcSel,
          { drawSVG: "100%", opacity: 0.5, duration: 0.15, ease: "none" },
          pos,
        ).to(
          citySel,
          { opacity: 1, scale: 1, duration: 0.2, ease: "back.out(1.8)" },
          `${pos}+=0.1`,
        );
      });

      // Final settle — all arcs fade to a gentle glow, vignette softens.
      tl.to(".cm-world-arc", { opacity: 0.2, duration: 0.4 }, "finale+=1.4")
        .to(".cm-vignette", { opacity: 0.2, duration: 0.5 }, "finale+=1.4");
    },
    { scope, dependencies: [cafes, view] },
  );

  // ── View toggle transition ──────────────────────────────────────────────
  // When the user flips schematic ↔ geographic, we crossfade the line paths
  // and station positions. The GSAP timeline re-runs via the `view` dep above,
  // but we also do a quick morph tween for immediate visual feedback.
  const handleViewChange = (next: ViewMode) => {
    if (next === view) return;
    setToggleDisabled(true);
    // A quick fade of the map content, then the timeline rebuilds on the
    // new view's paths. The `view` dependency in useGSAP handles the rebuild.
    gsap.to([".cm-line", ".cm-station"], {
      opacity: 0.15,
      duration: 0.3,
      onComplete: () => {
        setView(next);
        // Re-enable after the timeline has had a frame to rebuild.
        setTimeout(() => setToggleDisabled(false), 400);
      },
    });
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <section ref={scope} className="relative h-[800vh] -mx-6 md:-mx-12">
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
              {/* Vignette — darkens edges when zoomed in for cinematic depth. */}
              <radialGradient id="cm-vignette" cx="50%" cy="50%" r="75%">
                <stop offset="55%" stopColor="#000" stopOpacity="0" />
                <stop offset="100%" stopColor="#1A1612" stopOpacity="0.5" />
              </radialGradient>
              {/* Atmosphere — soft warm glow behind the active line. */}
              <radialGradient id="cm-atmos-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#FFF6E0" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#FFF6E0" stopOpacity="0" />
              </radialGradient>
              {/* World layer — ocean gradient for the finale. */}
              <radialGradient id="cm-world-ocean" cx="50%" cy="50%" r="70%">
                <stop offset="0%" stopColor="#F4ECD8" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#D9CFB1" stopOpacity="0.6" />
              </radialGradient>
              <filter id="cm-world-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* ── Static page chrome (paper + grid) ────────────────────── */}
            <rect
              x={0}
              y={0}
              width={VIEW_W}
              height={VIEW_H}
              fill="url(#cm-paper)"
            />

            {/* ── World layer (finale) ─────────────────────────────────── */}
            {/* Sits above the paper, below the city map. The finale fades */}
            {/* the city content out and reveals this layer underneath.    */}
            <g className="cm-world" style={{ opacity: 0 }}>
              <rect
                x={0}
                y={0}
                width={VIEW_W}
                height={VIEW_H}
                fill="url(#cm-world-ocean)"
              />

              {/* Graticule — faint equirectangular lat/long grid, like an
                  atlas plate, so the globe reads as a real map. */}
              <g className="cm-world-graticule" opacity={0.18}>
                {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lng) => {
                  const x = ((lng + 180) / 360) * VIEW_W;
                  return (
                    <line
                      key={`mer-${lng}`}
                      x1={x}
                      y1={0}
                      x2={x}
                      y2={VIEW_H}
                      stroke="var(--color-ink-soft)"
                      strokeWidth={lng === 0 ? 0.8 : 0.4}
                    />
                  );
                })}
                {[-60, -30, 0, 30, 60].map((lat) => {
                  const y = ((90 - lat) / 180) * VIEW_H;
                  return (
                    <line
                      key={`par-${lat}`}
                      x1={0}
                      y1={y}
                      x2={VIEW_W}
                      y2={y}
                      stroke="var(--color-ink-soft)"
                      strokeWidth={lat === 0 ? 0.8 : 0.4}
                      strokeDasharray={lat === 0 ? undefined : "2 6"}
                    />
                  );
                })}
              </g>

              {/* Real-world land silhouette (Natural Earth, equirectangular). */}
              <path
                className="cm-world-outline"
                d={WORLD_OUTLINE_D}
                fill="var(--color-cream-edge)"
                fillOpacity={0.5}
                stroke="var(--color-ink-soft)"
                strokeWidth={0.8}
                strokeOpacity={0.45}
                strokeLinejoin="round"
              />

              {/* Arcs from Nairobi to each city */}
              {WORLD_CITIES.filter((c) => !c.lit).map((city) => {
                const nbi = WORLD_CITIES.find((c) => c.id === "nairobi")!;
                // Quadratic arc bowing upward from Nairobi to the city.
                const midX = (nbi.x + city.x) / 2;
                const midY = (nbi.y + city.y) / 2 - Math.abs(city.x - nbi.x) * 0.25 - 20;
                return (
                  <path
                    key={`arc-${city.id}`}
                    className="cm-world-arc"
                    data-target={city.id}
                    d={`M ${nbi.x} ${nbi.y} Q ${midX} ${midY}, ${city.x} ${city.y}`}
                    fill="none"
                    stroke="var(--color-express)"
                    strokeWidth={1}
                    strokeOpacity={0.6}
                    strokeDasharray="2 4"
                  />
                );
              })}

              {/* City dots */}
              {WORLD_CITIES.map((city) => (
                <g
                  key={city.id}
                  className="cm-world-city"
                  data-city-id={city.id}
                  transform={`translate(${city.x} ${city.y})`}
                >
                  <circle
                    r={city.lit ? 6 : 4}
                    fill={city.lit ? "var(--color-express)" : "var(--color-ink-soft)"}
                    filter="url(#cm-world-glow)"
                  />
                  <circle
                    r={city.lit ? 3 : 2}
                    fill="var(--color-cream)"
                  />
                  <text
                    x={city.lx ?? 0}
                    y={city.ly ?? (city.lit ? -14 : -10)}
                    textAnchor={city.anchor ?? "middle"}
                    fontFamily="var(--font-mono)"
                    fontSize={city.lit ? 11 : 9}
                    fontWeight={city.lit ? 600 : 400}
                    letterSpacing="0.1em"
                    fill="var(--color-ink)"
                  >
                    {city.name.toUpperCase()}
                  </text>
                  {city.lit && (
                    <text
                      x={city.lx ?? 0}
                      y={(city.ly ?? -14) + 14}
                      textAnchor={city.anchor ?? "middle"}
                      fontFamily="var(--font-serif)"
                      fontStyle="italic"
                      fontSize={9}
                      fill="var(--color-ink-faint)"
                    >
                      {city.stations} stations live
                    </text>
                  )}
                </g>
              ))}
            </g>

            {/* ── Parallax layer: FAR (grid) ───────────────────────────── */}
            <g className="cm-parallax-far" style={{ opacity: 0.35 }}>
              <rect
                x={0}
                y={0}
                width={VIEW_W}
                height={VIEW_H}
                fill="url(#cm-grid)"
                opacity={0.6}
              />
            </g>

            {/* ── Atmosphere glow (behind POV, intensifies on zoom) ────── */}
            <g className="cm-atmos" style={{ opacity: 0 }}>
              <rect
                x={0}
                y={0}
                width={VIEW_W}
                height={VIEW_H}
                fill="url(#cm-atmos-glow)"
              />
            </g>

            {/* ── POV group — scaled & translated (the "camera") ──────── */}
            <g className="cm-pov">
              <g className="cm-pan">
                {/* ── Parallax layer: MID (neighbourhoods) ─────────────── */}
                <g className="cm-parallax-mid cm-neighbourhoods" style={{ opacity: 0.7 }}>
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

                {/* ── Faint glow halos under each line for depth ────── */}
                <path
                  d={tierPath("express")}
                  fill="none"
                  stroke={TIER_TINT.express}
                  strokeWidth={26}
                  strokeLinecap="round"
                  opacity={0.35}
                  className="cm-line-glow cm-line-glow-express"
                />
                <path
                  d={tierPath("local")}
                  fill="none"
                  stroke={TIER_TINT.local}
                  strokeWidth={26}
                  strokeLinecap="round"
                  opacity={0.35}
                  className="cm-line-glow cm-line-glow-local"
                />
                <path
                  d={tierPath("suspended")}
                  fill="none"
                  stroke={TIER_TINT.suspended}
                  strokeWidth={26}
                  strokeLinecap="round"
                  opacity={0.3}
                  className="cm-line-glow cm-line-glow-suspended"
                />

                {/* ── The visible bezier paths ──────────────────────── */}
                <path
                  className="cm-line cm-line-express"
                  d={tierPath("express")}
                  fill="none"
                  stroke={TIER_COLOUR.express}
                  strokeWidth={11}
                  strokeLinecap="round"
                />
                <path
                  className="cm-line cm-line-local"
                  d={tierPath("local")}
                  fill="none"
                  stroke={TIER_COLOUR.local}
                  strokeWidth={9}
                  strokeLinecap="round"
                />
                <path
                  className="cm-line cm-line-suspended"
                  d={tierPath("suspended")}
                  fill="none"
                  stroke={TIER_COLOUR.suspended}
                  strokeWidth={8}
                  strokeLinecap="butt"
                  strokeDasharray="14 9"
                />

                {/* ── Stations ──────────────────────────────────────── */}
                {cafes.map((cafe) => {
                  const wp = stationPos(cafe);
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

                {/* ── The train — positioned along the active path ──── */}
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

            {/* ── Vignette overlay (above map, below chrome) ─────────── */}
            <rect
              className="cm-vignette"
              x={0}
              y={0}
              width={VIEW_W}
              height={VIEW_H}
              fill="url(#cm-vignette)"
              style={{ opacity: 0.15, pointerEvents: "none" }}
            />

            {/* ── City-scale chrome (compass, scale, stamps) ─────────── */}
            {/* A 2 KM scale bar is meaningless over a world map, so this whole
                group fades out as the finale zooms to the globe. */}
            <g className="cm-city-chrome">
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
            </g>
          </svg>
        </div>

        <RouteCard
          phase={phase}
          stopsVisited={stopsVisited}
          stopsTotal={stopsTotal}
          activeStopName={activeStopName}
          activeStopVibe={activeStopVibe}
        />

        <ViewToggle
          view={view}
          onChange={handleViewChange}
          disabled={toggleDisabled}
        />

        <div className="absolute inset-x-0 bottom-3 text-center pointer-events-none">
          <p className="font-mono text-[10px] tracking-[0.32em] uppercase text-ink-faint">
            {phase === "finale"
              ? "the network is everywhere ↑"
              : "scroll to ride the lines ↓"}
          </p>
        </div>
      </div>
    </section>
  );
}
