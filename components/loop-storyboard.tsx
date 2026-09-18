"use client";

// LoopStoryboard — self-running product reel.
// Desktop: wide SVG stage (cursor lands on foreignObject UI).
// Mobile: phone-native HTML stage so drawers/tests stay readable.
// Both share one step clock, pause/scrub controls, and reduced-motion path.

import { useEffect, useState } from "react";
import Link from "next/link";
import { TIER_COLOUR, TIER_USE } from "@/lib/map-data";
import { LOOP_DURATIONS, LOOP_STEPS } from "@/lib/tour-loop";
import { useMatchMedia } from "@/hooks/use-match-media";

export { LOOP_STEPS } from "@/lib/tour-loop";

const CURSOR: Array<{ x: number; y: number }> = [
  { x: 196, y: 186 },
  { x: 636, y: 266 },
  { x: 636, y: 266 },
  { x: 812, y: 168 },
  { x: 622, y: 44 },
];

function CountUp({
  to,
  run,
  duration = 2300,
}: {
  to: number;
  run: boolean;
  duration?: number;
}) {
  const [v, setV] = useState(0);
  /* eslint-disable react-hooks/set-state-in-effect -- rAF-driven count-up */
  useEffect(() => {
    if (!run) {
      setV(0);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, to, duration]);
  /* eslint-enable react-hooks/set-state-in-effect */
  return <>{v}</>;
}

function StationCard({
  testing,
  runTest = true,
}: {
  testing: boolean;
  runTest?: boolean;
}) {
  return (
    <div className="bg-cream border border-ink shadow-[4px_5px_0_0_var(--color-ink)] p-3.5 sm:p-4">
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-faint">
        Station · Shoreditch
      </p>
      <p className="font-display font-black uppercase text-[22px] sm:text-[24px] leading-none text-ink mt-1">
        Ozone Coffee Roasters
      </p>
      <div className="flex items-center gap-2 mt-3">
        <span
          className="flex items-center justify-center text-cream w-7 h-7 font-display font-black text-base"
          style={{ background: TIER_COLOUR.express }}
        >
          X
        </span>
        <span
          className="font-mono text-[11px] tracking-[0.14em] uppercase"
          style={{ color: TIER_COLOUR.express }}
        >
          Express · 82 Mbps
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t border-cream-deep font-mono text-[11px] text-ink-soft">
        <span>
          ▼ <b className="text-ink">82</b>
        </span>
        <span>
          ▲ <b className="text-ink">21.3</b>
        </span>
        <span>
          ◷ <b className="text-ink">11</b> ms
        </span>
        <span className="text-ink-faint">6 obs</span>
      </div>

      {!testing && (
        <div className="mt-3 flex items-center justify-between bg-ink text-cream px-3 py-3 font-mono text-[10px] tracking-[0.2em] uppercase">
          Log a reading <span aria-hidden>→</span>
        </div>
      )}
      {testing && (
        <div className="mt-3">
          <div className="relative bg-ink text-cream px-3 py-3 overflow-hidden font-mono text-[10px] tracking-[0.16em]">
            <div
              className="absolute inset-y-0 left-0 bg-express"
              style={{
                animation: runTest ? "sb-progress 2.3s linear both" : "none",
                width: "100%",
              }}
            />
            <span className="relative flex items-center justify-between uppercase">
              <span>Testing…</span>
              <span className="tabular-nums font-bold">
                <CountUp to={72} run={runTest} /> Mbps
              </span>
            </span>
          </div>
          <div
            className="msg-in flex items-center gap-2 mt-2 px-2.5 py-2 border"
            style={{
              borderColor: TIER_COLOUR.express,
              background: `${TIER_COLOUR.express}14`,
              animationDelay: runTest ? "2.7s" : "0s",
              opacity: runTest ? 0 : 1,
              animation: runTest ? undefined : "none",
            }}
          >
            <span
              className="font-display font-black text-[13px]"
              style={{ color: TIER_COLOUR.express }}
            >
              X
            </span>
            <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink">
              You&rsquo;re on the <b>Express</b> line · {TIER_USE.express}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function BountyToast() {
  return (
    <div className="toast-in bg-cream border border-ink shadow-[4px_5px_0_0_var(--color-ink)] pl-4 pr-3 py-3 relative overflow-hidden">
      <span
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ background: TIER_COLOUR.express }}
      />
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink">
        Bounty +1 · Savanna Coffee Lounge
      </p>
      <div className="flex items-center gap-2.5 mt-2">
        <div
          className="relative h-[4px] flex-1"
          style={{ background: "var(--color-cream-deep)" }}
        >
          <div
            className="absolute inset-y-0 left-0"
            style={{ background: "var(--color-ink)", width: "70%" }}
          />
          <div
            className="absolute inset-y-0"
            style={{
              background: TIER_COLOUR.express,
              left: "70%",
              width: "10%",
              animation: "sb-bar-fill 700ms ease-out 600ms both",
            }}
          />
        </div>
        <span className="font-mono text-[10px] text-ink-soft tabular-nums">
          8/10
        </span>
      </div>
      <p className="font-serif italic text-[12px] text-ink-faint mt-1.5">
        2 more verified readings · NIM pays out at 10/10
      </p>
    </div>
  );
}

function MiniMap({
  step,
  loop,
  reduced,
}: {
  step: number;
  loop: number;
  reduced: boolean;
}) {
  const pinDropped = step >= 3;
  return (
    <svg
      viewBox="40 120 780 220"
      className="w-full h-auto block"
      aria-hidden
    >
      <path
        d="M 60 150 Q 200 200, 340 205 Q 500 210, 620 165 Q 700 140, 750 155"
        fill="none"
        stroke={TIER_COLOUR.express}
        strokeWidth={10}
        strokeLinecap="round"
      />
      <path
        d="M 60 290 Q 170 265, 290 285 Q 430 305, 560 300 Q 680 295, 750 305"
        fill="none"
        stroke={TIER_COLOUR.local}
        strokeWidth={10}
        strokeLinecap="round"
      />
      {pinDropped && (
        <path
          key={`m-ext-${loop}`}
          d="M 750 155 Q 786 160, 812 172"
          fill="none"
          stroke={TIER_COLOUR.express}
          strokeWidth={10}
          strokeLinecap="round"
          className={reduced ? "" : "sb-line-grow"}
        />
      )}
      <g transform="translate(200,189)">
        {step === 0 && (
          <circle
            key={`m-rip-${loop}`}
            r={8}
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth={2.5}
            className={reduced ? "" : "sb-ripple"}
          />
        )}
        <circle
          r={10}
          fill="var(--color-cream)"
          stroke="var(--color-ink)"
          strokeWidth={2.5}
          className={step === 0 ? "sb-station-pulse" : ""}
        />
        <text
          x={0}
          y={28}
          textAnchor="middle"
          fontFamily="var(--font-display)"
          fontWeight={800}
          fontSize={14}
          fill="var(--color-ink)"
        >
          OZONE
        </text>
      </g>
      {pinDropped && (
        <g key={`m-pin-${loop}`} transform="translate(812,172)">
          <circle
            r={10}
            fill="none"
            stroke={TIER_COLOUR.express}
            strokeWidth={3}
            className={reduced ? "" : "arrival-ring"}
          />
          <circle
            r={10}
            fill="var(--color-cream)"
            stroke="var(--color-ink)"
            strokeWidth={2.5}
            className={reduced ? "" : "station-arrive"}
          />
          <rect x={-3} y={-3} width={6} height={6} fill="var(--color-ink)" />
          <text
            x={0}
            y={28}
            textAnchor="middle"
            fontFamily="var(--font-display)"
            fontWeight={800}
            fontSize={13}
            fill="var(--color-ink)"
          >
            YOURS
          </text>
        </g>
      )}
    </svg>
  );
}

function MobileReel({
  step,
  loop,
  reduced,
  paused,
  onSelect,
  onTogglePause,
}: {
  step: number;
  loop: number;
  reduced: boolean;
  paused: boolean;
  onSelect: (i: number) => void;
  onTogglePause: () => void;
}) {
  const st = LOOP_STEPS[step];

  return (
    <div className="border border-ink/80 bg-cream shadow-[4px_5px_0_0_var(--color-ink)] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-ink/15 bg-cream-edge/40">
        <p className="stamp">
          {st.n} · {st.verb}
        </p>
        <button
          type="button"
          onClick={onTogglePause}
          className="pressable font-mono text-[10px] tracking-[0.2em] uppercase text-ink-soft hover:text-ink px-2 py-1 border border-ink/30"
          aria-pressed={paused}
        >
          {paused ? "Play" : "Pause"}
        </button>
      </div>

      <div className="relative px-2 pt-3">
        <div aria-hidden className="absolute inset-0 print-rules opacity-40" />
        <div className="relative">
          <MiniMap step={step} loop={loop} reduced={reduced} />
        </div>
      </div>

      <div className="px-3 pb-3 pt-1 min-h-[200px]">
        {step === 0 && (
          <div className="border border-dashed border-ink/40 bg-cream-edge/30 px-4 py-5 text-center">
            <p className="font-display font-black uppercase text-2xl text-ink">
              Tap Ozone
            </p>
            <p className="font-serif italic text-ink-soft mt-1">
              The pulse marks a live station.
            </p>
          </div>
        )}
        {(step === 1 || step === 2) && (
          <StationCard
            testing={step === 2 && !reduced}
            runTest={step === 2 && !reduced && !paused}
          />
        )}
        {step === 3 && (
          <div className="border border-ink bg-cream shadow-[3px_4px_0_0_var(--color-ink)] px-4 py-5">
            <p className="stamp text-express">Pin landed</p>
            <p className="font-display font-black uppercase text-3xl text-ink mt-1 leading-none">
              Your café · 72 Mbps
            </p>
            <p className="font-serif italic text-ink-soft mt-2">
              Express line extended — no refresh.
            </p>
          </div>
        )}
        {step === 4 && <BountyToast />}
      </div>

      <div className="px-3 pb-3">
        <p className="font-serif italic text-ink-soft text-[15px] leading-snug">
          {st.caption}
        </p>
      </div>

      <div className="flex items-center gap-1 px-2 pb-3 overflow-x-auto">
        {LOOP_STEPS.map((item, i) => {
          const active = i === step;
          const done = i < step;
          return (
            <button
              key={item.n}
              type="button"
              onClick={() => onSelect(i)}
              className={`pressable shrink-0 px-3 py-2 font-mono text-[10px] tracking-[0.16em] uppercase border transition-colors ${
                active
                  ? "bg-ink text-cream border-ink"
                  : done
                    ? "bg-cream-edge text-ink border-ink/40"
                    : "bg-cream text-ink-faint border-ink/20"
              }`}
              aria-current={active ? "step" : undefined}
            >
              {item.verb}
            </button>
          );
        })}
      </div>

      <div className="relative h-[3px] bg-cream-deep">
        {!reduced && !paused && (
          <span
            key={`m-rail-${loop}-${step}`}
            className="absolute inset-y-0 left-0 bg-express"
            style={{
              animation: `sb-progress ${LOOP_DURATIONS[step]}ms linear both`,
            }}
          />
        )}
      </div>
    </div>
  );
}

function DesktopReel({
  step,
  loop,
  reduced,
  showCursor,
}: {
  step: number;
  loop: number;
  reduced: boolean;
  showCursor: boolean;
}) {
  const drawerOpen = step === 1 || step === 2;
  const pinDropped = step >= 3;
  const toastShown = step === 4;

  return (
    <div className="relative border border-ink/80 bg-cream shadow-[6px_8px_0_0_var(--color-ink)] overflow-hidden">
      <div aria-hidden className="absolute inset-0 print-rules opacity-60" />

      <svg
        viewBox="0 0 860 520"
        className="relative w-full h-auto block"
        role="img"
        aria-label="Animated walkthrough of the contribution loop"
      >
        <path
          d="M 60 150 Q 200 200, 340 205 Q 500 210, 620 165 Q 700 140, 750 155"
          fill="none"
          stroke={TIER_COLOUR.express}
          strokeWidth={11}
          strokeLinecap="round"
          opacity={0.95}
        />
        <path
          d="M 60 290 Q 170 265, 290 285 Q 430 305, 560 300 Q 680 295, 750 305"
          fill="none"
          stroke={TIER_COLOUR.local}
          strokeWidth={11}
          strokeLinecap="round"
          opacity={0.95}
        />
        <path
          d="M 90 410 Q 300 435, 480 415 Q 600 402, 720 412"
          fill="none"
          stroke={TIER_COLOUR.suspended}
          strokeWidth={9}
          strokeDasharray="10 8"
          opacity={0.8}
        />

        {pinDropped && (
          <path
            key={`ext-${loop}`}
            d="M 750 155 Q 786 160, 812 172"
            fill="none"
            stroke={TIER_COLOUR.express}
            strokeWidth={11}
            strokeLinecap="round"
            className={reduced ? "" : "sb-line-grow"}
          />
        )}

        {[
          {
            name: "OZONE",
            x: 200,
            y: 189,
            mbps: 82,
            tier: "express" as const,
            tap: true,
          },
          {
            name: "ALLPRESS",
            x: 620,
            y: 165,
            mbps: 74,
            tier: "express" as const,
          },
          {
            name: "GRIND",
            x: 290,
            y: 285,
            mbps: 7,
            tier: "suspended" as const,
          },
          {
            name: "CLIMPSON",
            x: 428,
            y: 299,
            mbps: 29,
            tier: "local" as const,
          },
          {
            name: "BREW BISTRO",
            x: 293,
            y: 424,
            mbps: 6,
            tier: "suspended" as const,
          },
          {
            name: "THE MILL",
            x: 480,
            y: 415,
            mbps: 7,
            tier: "suspended" as const,
          },
        ].map((st) => (
          <g key={st.name} transform={`translate(${st.x},${st.y})`}>
            {st.tap && step === 0 && (
              <circle
                key={`rip-${loop}`}
                r={6}
                fill="none"
                stroke="var(--color-ink)"
                strokeWidth={2.5}
                className={reduced ? "" : "sb-ripple"}
              />
            )}
            <text
              x={0}
              y={-20}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize={10}
              letterSpacing="0.12em"
              fill={TIER_COLOUR[st.tier]}
            >
              {st.mbps}
            </text>
            <circle
              r={9}
              fill="var(--color-cream)"
              stroke="var(--color-ink)"
              strokeWidth={2.5}
              className={st.tap && step === 0 ? "sb-station-pulse" : ""}
            />
            <text
              x={0}
              y={26}
              textAnchor="middle"
              fontFamily="var(--font-display)"
              fontWeight={800}
              fontSize={12}
              letterSpacing="0.06em"
              fill="var(--color-ink)"
            >
              {st.name}
            </text>
          </g>
        ))}

        {pinDropped && (
          <g key={`pin-${loop}`} transform="translate(812,172)">
            <circle
              r={9}
              fill="none"
              stroke={TIER_COLOUR.express}
              strokeWidth={3}
              className={reduced ? "" : "arrival-ring"}
            />
            <text
              x={0}
              y={-20}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize={10}
              letterSpacing="0.12em"
              fill={TIER_COLOUR.express}
            >
              72
            </text>
            <circle
              r={9}
              fill="var(--color-cream)"
              stroke="var(--color-ink)"
              strokeWidth={2.5}
              className={reduced ? "" : "station-arrive"}
            />
            <rect x={-3} y={-3} width={6} height={6} fill="var(--color-ink)" />
            <text
              x={0}
              y={26}
              textAnchor="middle"
              fontFamily="var(--font-display)"
              fontWeight={800}
              fontSize={12}
              letterSpacing="0.06em"
              fill="var(--color-ink)"
            >
              YOUR CAFÉ
            </text>
          </g>
        )}

        <foreignObject
          x={468}
          y={58}
          width={334}
          height={272}
          style={{
            opacity: drawerOpen ? 1 : 0,
            transition: "opacity 250ms",
          }}
          pointerEvents={drawerOpen ? "auto" : "none"}
        >
          <div className="w-full h-full" style={{ fontFamily: "var(--font-mono)" }}>
            <StationCard
              testing={step === 2 && !reduced}
              runTest={step === 2 && !reduced}
            />
          </div>
        </foreignObject>

        {toastShown && (
          <foreignObject key={`toast-${loop}`} x={455} y={12} width={350} height={90}>
            <BountyToast />
          </foreignObject>
        )}

        {showCursor && !reduced && (
          <g
            style={{
              transform: `translate(${CURSOR[step].x}px, ${CURSOR[step].y}px)`,
              transition: "transform 650ms cubic-bezier(0.3, 0.7, 0.2, 1)",
            }}
          >
            <path
              d="M0 0 L0 17 L4.8 13.2 L8 20 L10.6 18.8 L7.4 12.2 L12.6 11.6 Z"
              fill="var(--color-ink)"
              stroke="var(--color-cream)"
              strokeWidth={1.4}
              transform="scale(1.5)"
            />
          </g>
        )}
      </svg>

      <div className="relative flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-ink/20 px-4 py-2.5 bg-cream-edge/50">
        {(["express", "local", "suspended"] as const).map((t) => (
          <span key={t} className="inline-flex items-center gap-2">
            <span
              className="inline-block w-6 h-[5px]"
              style={
                t === "suspended"
                  ? {
                      backgroundImage: `repeating-linear-gradient(90deg, ${TIER_COLOUR[t]} 0 6px, transparent 6px 10px)`,
                    }
                  : { background: TIER_COLOUR[t] }
              }
            />
            <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-soft">
              {t} ·{" "}
              <span className="font-serif italic normal-case tracking-normal text-[11px]">
                {TIER_USE[t]}
              </span>
            </span>
          </span>
        ))}
        <span className="ml-auto font-mono text-[10px] tracking-[0.18em] uppercase text-ink-faint">
          reel {String(loop + 1).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}

export function LoopStoryboard({
  hero = false,
  startDelay = 0,
  hold = false,
}: {
  hero?: boolean;
  startDelay?: number;
  /** When true, keep the reel on frame 0 until released (boarding gate). */
  hold?: boolean;
}) {
  const [step, setStep] = useState(0);
  const [loop, setLoop] = useState(0);
  const [paused, setPaused] = useState(false);
  const [armed, setArmed] = useState(startDelay <= 0 && !hold);
  const coarse = useMatchMedia("(pointer: coarse)");
  const reduced = useMatchMedia("(prefers-reduced-motion: reduce)");

  /* eslint-disable react-hooks/set-state-in-effect -- boarding / delay arm gate */
  useEffect(() => {
    if (hold) {
      setArmed(false);
      return;
    }
    if (startDelay <= 0 || reduced) {
      setArmed(true);
      return;
    }
    const t = setTimeout(() => setArmed(true), startDelay);
    return () => clearTimeout(t);
  }, [startDelay, reduced, hold]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (reduced || !armed || paused) return;
    const t = setTimeout(() => {
      if (step === LOOP_STEPS.length - 1) {
        setStep(0);
        setLoop((l) => l + 1);
      } else {
        setStep((s) => s + 1);
      }
    }, LOOP_DURATIONS[step]);
    return () => clearTimeout(t);
  }, [step, reduced, armed, paused]);

  const s = reduced ? 4 : step;

  function selectStep(i: number) {
    setStep(i);
    setPaused(true);
  }

  return (
    <section
      className={hero ? "mt-4 sm:mt-6 md:mt-8" : "mt-20"}
      aria-label="How the product loop works"
    >
      {!hero && (
        <div className="flex flex-wrap items-end justify-between gap-6 mb-8">
          <div className="max-w-3xl">
            <p className="stamp">
              No demo mode · no sign-up · the real flow, on loop
            </p>
            <h2
              className="font-display font-black uppercase text-ink leading-[0.88] tracking-[-0.02em] mt-2"
              style={{ fontSize: "clamp(40px, 6.5vw, 88px)" }}
            >
              Sixty seconds,
              <br />
              start to finish.
            </h2>
          </div>
          <Link
            href="/london?contribute=1"
            className="bg-ink text-cream font-mono text-[11px] tracking-[0.22em] uppercase px-5 py-3 inline-flex items-center gap-2"
          >
            Run it yourself <span aria-hidden>→</span>
          </Link>
        </div>
      )}

      {hero && (
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3 sm:mb-4">
          <p className="stamp">
            Product proof · live reel
            <span className="hidden sm:inline text-ink-faint">
              {" "}
              · tap → read → test → land → earn
            </span>
          </p>
          <Link
            href="/london?contribute=1"
            className="stamp text-express hover:text-ink transition-colors hidden sm:inline-flex items-center gap-1.5"
          >
            Run it yourself <span aria-hidden>→</span>
          </Link>
        </div>
      )}

      {/* CSS breakpoint (not JS) so mobile never flashes the desktop SVG. */}
      <div className="lg:hidden">
        <MobileReel
          step={s}
          loop={loop}
          reduced={reduced}
          paused={paused || !armed}
          onSelect={selectStep}
          onTogglePause={() => setPaused((p) => !p)}
        />
      </div>

      <div className="hidden lg:grid grid-cols-[1.7fr_1fr] gap-5">
        <DesktopReel
          step={s}
          loop={loop}
          reduced={reduced}
          showCursor={!coarse}
        />

        <div className="flex flex-col gap-5">
          <div
            className="bg-ink text-cream shadow-[6px_8px_0_0_rgba(26,22,18,0.35)]"
            role="list"
            aria-label="Loop steps"
          >
            <div
              className="flex items-center justify-between px-4 py-2.5"
              style={{ borderBottom: "1px solid rgba(244,236,216,0.2)" }}
            >
              <p className="font-mono text-[10px] tracking-[0.24em] uppercase text-cream/60">
                The loop · departure board
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPaused((p) => !p)}
                  className="pressable font-mono text-[10px] tracking-[0.18em] uppercase text-cream/70 hover:text-cream"
                  aria-pressed={paused}
                >
                  {paused ? "Play" : "Pause"}
                </button>
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-cream/60">
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full bg-express ${reduced || paused ? "" : "animate-pulse"}`}
                    aria-hidden
                  />
                  {reduced ? "static" : paused ? "paused" : "live"}
                </span>
              </div>
            </div>
            <ul>
              {LOOP_STEPS.map((st, i) => {
                const active = i === s;
                const done = i < s;
                return (
                  <li key={st.n} role="listitem">
                    <button
                      type="button"
                      onClick={() => selectStep(i)}
                      className={`relative w-full text-left px-4 py-3 transition-colors duration-300 ${
                        active
                          ? "bg-cream text-ink"
                          : "text-cream hover:bg-cream/10"
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span
                          className={`font-mono text-[10px] tracking-[0.2em] ${active ? "text-ink-faint" : "text-cream/40"}`}
                        >
                          {st.n}
                        </span>
                        <span
                          className={`font-display font-black uppercase text-2xl leading-none tracking-[-0.01em] flex-1 ${active || done ? "" : "opacity-35"}`}
                        >
                          {st.verb}
                        </span>
                        <span
                          className={`font-mono text-[10px] tracking-[0.18em] uppercase ${active ? "text-express" : done ? "text-cream/50" : "text-cream/25"}`}
                        >
                          {done ? "✓ done" : active ? "▸ now" : "·"}
                        </span>
                      </div>
                      {active && !paused && !reduced && (
                        <span
                          key={`rail-${loop}-${i}`}
                          className="absolute bottom-0 left-0 h-[3px] bg-express"
                          style={{
                            animation: `sb-progress ${LOOP_DURATIONS[i]}ms linear both`,
                          }}
                          aria-hidden
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div
            key={`cap-${loop}-${s}`}
            className="msg-in border border-ink/60 bg-cream px-5 py-4 shadow-[3px_4px_0_0_var(--color-ink)]"
          >
            <p className="stamp">
              {LOOP_STEPS[s].n} · {LOOP_STEPS[s].verb}
            </p>
            <p className="font-serif italic text-ink-soft text-lg leading-snug mt-1.5">
              {LOOP_STEPS[s].caption}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
