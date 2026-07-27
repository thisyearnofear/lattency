"use client";

// LoopStoryboard — the entire product loop, running itself on an endless
// 20-second reel. A schematic mini-map, a travelling cursor, a readings
// drawer, a live speed-test count-up, an optimistic pin drop with arrival
// ring, and a bounty toast. Judges who never open the real map still see
// the product move. Built as one SVG (cursor + foreignObject drawer/toast
// share a single coordinate space, so the cursor lands exactly on buttons).

import { useEffect, useState } from "react";
import Link from "next/link";
import { TIER_COLOUR, TIER_USE } from "@/lib/map-data";

const STEPS = [
  { n: "01", verb: "Tap", caption: "Every dot is a real place to work. Tap a station." },
  { n: "02", verb: "Read", caption: "Its verified readings open — median, jitter, sample size. Nothing claimed, everything measured." },
  { n: "03", verb: "Test", caption: "Run a real speed test from where you're sitting. A round-trip to the edge can't be faked." },
  { n: "04", verb: "Land", caption: "Your reading extends the line. The new station appears the instant you submit — no refresh." },
  { n: "05", verb: "Earn", caption: "Verified readings close bounties. NIM lands in your Nimiq Pay wallet." },
] as const;

const DURATIONS = [3200, 4200, 5200, 3600, 4300];

const CURSOR: Array<{ x: number; y: number }> = [
  { x: 196, y: 186 },  // over Ozone station
  { x: 636, y: 266 },  // over the drawer's "Log a reading" button
  { x: 636, y: 266 },  // resting on the running test
  { x: 812, y: 168 },  // the new pin at the end of the express line
  { x: 622, y: 44 },   // the bounty toast
];

function CountUp({ to, run, duration = 2300 }: { to: number; run: boolean; duration?: number }) {
  const [v, setV] = useState(0);
  /* eslint-disable react-hooks/set-state-in-effect -- rAF-driven count-up:
     setV fires inside the animation-frame callback (a subscription pattern),
     and the reset branch intentionally clears the value when the reel restarts. */
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

export function LoopStoryboard() {
  const [step, setStep] = useState(0);
  const [loop, setLoop] = useState(0);
  const [reduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  // The reel timer — advances a step, wraps at the end.
  useEffect(() => {
    if (reduced) return;
    const t = setTimeout(() => {
      if (step === STEPS.length - 1) {
        setStep(0);
        setLoop((l) => l + 1);
      } else {
        setStep((s) => s + 1);
      }
    }, DURATIONS[step]);
    return () => clearTimeout(t);
  }, [step, reduced]);

  // Reduced motion: hold the final composed frame, no animation.
  const s = reduced ? 4 : step;
  const drawerOpen = s === 1 || s === 2;
  const pinDropped = s >= 3;
  const toastShown = s === 4;

  return (
    <section className="mt-20" aria-label="How the product loop works">
      {/* Section masthead */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-3xl">
          <p className="stamp">No demo mode · no sign-up · the real flow, on loop</p>
          <h2
            className="font-display font-black uppercase text-ink leading-[0.88] tracking-[-0.02em] mt-2"
            style={{ fontSize: "clamp(44px, 6.5vw, 88px)" }}
          >
            Sixty seconds,
            <br />
            start to finish.
          </h2>
          <p className="font-serif italic text-ink-soft text-xl md:text-2xl mt-4 max-w-2xl">
            One gesture, end to end: tap a station, see its verified readings,
            run a real speed test, watch your pin extend the line, earn NIM
            when your reading closes a bounty. This reel runs on the real
            mechanics — then do it yourself.
          </p>
        </div>
        <Link
          href="/london?contribute=1"
          className="bg-ink text-cream font-mono text-[11px] tracking-[0.22em] uppercase px-5 py-3 inline-flex items-center gap-2 hover:bg-ink/90 hover:-translate-y-0.5 hover:shadow-[4px_5px_0_0_var(--color-ink)] transition-all mb-2"
        >
          Run it yourself <span aria-hidden>→</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-5 mt-10">
        {/* ── The reel — one SVG stage ─────────────────────────────────── */}
        <div className="relative border border-ink/80 bg-cream shadow-[6px_8px_0_0_var(--color-ink)] overflow-hidden">
          {/* Ambient print rules behind the map */}
          <div aria-hidden className="absolute inset-0 print-rules opacity-60" />

          <svg viewBox="0 0 860 520" className="relative w-full h-auto block" role="img" aria-label="Animated walkthrough of the contribution loop">
            {/* Tier lines */}
            <path d="M 60 150 Q 200 200, 340 205 Q 500 210, 620 165 Q 700 140, 750 155" fill="none" stroke={TIER_COLOUR.express} strokeWidth={11} strokeLinecap="round" opacity={0.95} />
            <path d="M 60 290 Q 170 265, 290 285 Q 430 305, 560 300 Q 680 295, 750 305" fill="none" stroke={TIER_COLOUR.local} strokeWidth={11} strokeLinecap="round" opacity={0.95} />
            <path d="M 90 410 Q 300 435, 480 415 Q 600 402, 720 412" fill="none" stroke={TIER_COLOUR.suspended} strokeWidth={9} strokeDasharray="10 8" opacity={0.8} />

            {/* Line extension — drawn in when the new pin lands */}
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

            {/* Stations */}
            {[
              { name: "OZONE", x: 200, y: 189, mbps: 82, tier: "express" as const, tap: true },
              { name: "ALLPRESS", x: 620, y: 165, mbps: 74, tier: "express" as const },
              { name: "GRIND", x: 290, y: 285, mbps: 7, tier: "suspended" as const },
              { name: "CLIMPSON", x: 428, y: 299, mbps: 29, tier: "local" as const },
              { name: "BREW BISTRO", x: 293, y: 424, mbps: 6, tier: "suspended" as const },
              { name: "THE MILL", x: 480, y: 415, mbps: 7, tier: "suspended" as const },
            ].map((st) => (
              <g key={st.name} transform={`translate(${st.x},${st.y})`}>
                {/* Tap ring on Ozone during the Tap step */}
                {st.tap && s === 0 && (
                  <circle key={`rip-${loop}`} r={6} fill="none" stroke="var(--color-ink)" strokeWidth={2.5} className={reduced ? "" : "sb-ripple"} />
                )}
                <text x={0} y={-20} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={10} letterSpacing="0.12em" fill={TIER_COLOUR[st.tier]}>
                  {st.mbps}
                </text>
                <circle r={9} fill="var(--color-cream)" stroke="var(--color-ink)" strokeWidth={2.5} className={st.tap && s === 0 ? "sb-station-pulse" : ""} />
                <text x={0} y={26} textAnchor="middle" fontFamily="var(--font-display)" fontWeight={800} fontSize={12} letterSpacing="0.06em" fill="var(--color-ink)">
                  {st.name}
                </text>
              </g>
            ))}

            {/* The contributor's pin — drops at the end of the express line */}
            {pinDropped && (
              <g key={`pin-${loop}`} transform="translate(812,172)">
                <circle r={9} fill="none" stroke={TIER_COLOUR.express} strokeWidth={3} className={reduced ? "" : "arrival-ring"} />
                <text x={0} y={-20} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={10} letterSpacing="0.12em" fill={TIER_COLOUR.express}>
                  72
                </text>
                <circle r={9} fill="var(--color-cream)" stroke="var(--color-ink)" strokeWidth={2.5} className={reduced ? "" : "station-arrive"} />
                <rect x={-3} y={-3} width={6} height={6} fill="var(--color-ink)" />
                <text x={0} y={26} textAnchor="middle" fontFamily="var(--font-display)" fontWeight={800} fontSize={12} letterSpacing="0.06em" fill="var(--color-ink)">
                  YOUR CAFÉ
                </text>
              </g>
            )}

            {/* Readings drawer — foreignObject so the cursor can land on its button */}
            <foreignObject x={468} y={58} width={334} height={272} style={{ opacity: drawerOpen ? 1 : 0, transition: "opacity 250ms" }} pointerEvents={drawerOpen ? "auto" : "none"}>
              <div className="w-full h-full" style={{ fontFamily: "var(--font-mono)" }}>
                <div className="bg-cream border border-ink shadow-[4px_5px_0_0_var(--color-ink)] p-3.5">
                  <p style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--color-ink-faint)" }}>
                    Station · Shoreditch
                  </p>
                  <p style={{ fontFamily: "var(--font-display)", fontWeight: 900, textTransform: "uppercase", fontSize: 19, lineHeight: 1, color: "var(--color-ink)", marginTop: 4 }}>
                    Ozone Coffee Roasters
                  </p>
                  <div className="flex items-center gap-2 mt-2.5">
                    <span className="flex items-center justify-center text-cream" style={{ background: TIER_COLOUR.express, width: 26, height: 26, fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 15 }}>X</span>
                    <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: TIER_COLOUR.express }}>
                      Express · 82 Mbps
                    </span>
                  </div>
                  <div className="flex gap-4 mt-2.5 pt-2.5" style={{ borderTop: "1px solid var(--color-cream-deep)", fontSize: 11, color: "var(--color-ink-soft)" }}>
                    <span>▼ <b style={{ color: "var(--color-ink)" }}>82</b></span>
                    <span>▲ <b style={{ color: "var(--color-ink)" }}>21.3</b></span>
                    <span>◷ <b style={{ color: "var(--color-ink)" }}>11</b> ms</span>
                    <span style={{ color: "var(--color-ink-faint)" }}>6 obs</span>
                  </div>

                  {/* The action button — becomes the live test during step 3 */}
                  {s === 1 && (
                    <div className="mt-3 flex items-center justify-between bg-ink text-cream px-3 py-2.5" style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase" }}>
                      Log a reading <span>→</span>
                    </div>
                  )}
                  {s >= 2 && (
                    <div className="mt-3">
                      <div className="relative bg-ink text-cream px-3 py-2.5 overflow-hidden" style={{ fontSize: 10, letterSpacing: "0.16em" }}>
                        <div className="absolute inset-y-0 left-0 bg-express" style={{ width: s === 2 ? "100%" : "100%", animation: reduced ? "none" : `sb-progress 2.3s linear both` }} />
                        <span className="relative flex items-center justify-between uppercase" style={{ textTransform: "uppercase" }}>
                          <span>Testing…</span>
                          <span className="tabular-nums" style={{ fontWeight: 700 }}>
                            <CountUp to={72} run={s >= 2 && !reduced} /> Mbps
                          </span>
                        </span>
                      </div>
                      {/* Tier verdict — delayed entrance after the count-up */}
                      <div
                        className="msg-in flex items-center gap-2 mt-2 px-2.5 py-2 border"
                        style={{
                          borderColor: TIER_COLOUR.express,
                          background: `${TIER_COLOUR.express}14`,
                          animationDelay: reduced ? "0s" : "2.7s",
                          opacity: reduced ? 1 : 0,
                        }}
                      >
                        <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 13, color: TIER_COLOUR.express }}>X</span>
                        <span style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-ink)" }}>
                          You&rsquo;re on the <b>Express</b> line · {TIER_USE.express}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </foreignObject>

            {/* Bounty toast */}
            {toastShown && (
              <foreignObject key={`toast-${loop}`} x={455} y={12} width={350} height={76}>
                <div className="toast-in bg-cream border border-ink shadow-[4px_5px_0_0_var(--color-ink)] pl-4 pr-3 py-2.5 relative overflow-hidden" style={{ fontFamily: "var(--font-mono)" }}>
                  <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: TIER_COLOUR.express }} />
                  <p style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--color-ink)" }}>
                    Bounty +1 · Savanna Coffee Lounge
                  </p>
                  <div className="flex items-center gap-2.5 mt-1.5">
                    <div className="relative h-[4px] flex-1" style={{ background: "var(--color-cream-deep)" }}>
                      <div className="absolute inset-y-0 left-0" style={{ background: "var(--color-ink)", width: "70%" }} />
                      <div className="absolute inset-y-0" style={{ background: TIER_COLOUR.express, left: "70%", width: "10%", animation: reduced ? "none" : "sb-bar-fill 700ms ease-out 600ms both" }} />
                    </div>
                    <span style={{ fontSize: 10, color: "var(--color-ink-soft)" }} className="tabular-nums">8/10</span>
                  </div>
                  <p style={{ fontSize: 9, color: "var(--color-ink-faint)", marginTop: 4, fontStyle: "italic", fontFamily: "var(--font-serif)" }}>
                    2 more verified readings · NIM pays out at 10/10
                  </p>
                </div>
              </foreignObject>
            )}

            {/* The cursor */}
            {!reduced && (
              <g style={{ transform: `translate(${CURSOR[s].x}px, ${CURSOR[s].y}px)`, transition: "transform 650ms cubic-bezier(0.3, 0.7, 0.2, 1)" }}>
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

          {/* Legend strip — the three lines and what they mean */}
          <div className="relative flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-ink/20 px-4 py-2.5 bg-cream-edge/50">
            {(["express", "local", "suspended"] as const).map((t) => (
              <span key={t} className="inline-flex items-center gap-2">
                <span className="inline-block w-6 h-[5px]" style={{ background: TIER_COLOUR[t], ...(t === "suspended" ? { backgroundImage: `repeating-linear-gradient(90deg, ${TIER_COLOUR[t]} 0 6px, transparent 6px 10px)`, background: "transparent" } : {}) }} />
                <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-ink-soft">
                  {t} · <span className="font-serif italic normal-case tracking-normal text-[11px]">{TIER_USE[t]}</span>
                </span>
              </span>
            ))}
            <span className="ml-auto font-mono text-[9px] tracking-[0.18em] uppercase text-ink-faint">
              reel {String(loop + 1).padStart(2, "0")}
            </span>
          </div>
        </div>

        {/* ── Departure board — the step ledger ─────────────────────────── */}
        <div className="flex flex-col gap-5">
          <div className="bg-ink text-cream shadow-[6px_8px_0_0_rgba(26,22,18,0.35)]" role="list" aria-label="Loop steps">
            <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: "1px solid rgba(244,236,216,0.2)" }}>
              <p className="font-mono text-[9px] tracking-[0.24em] uppercase text-cream/60">The loop · departure board</p>
              <span className="inline-flex items-center gap-1.5 font-mono text-[9px] tracking-[0.2em] uppercase text-cream/60">
                <span className={`inline-block w-1.5 h-1.5 rounded-full bg-express ${reduced ? "" : "animate-pulse"}`} aria-hidden />
                {reduced ? "static" : "live"}
              </span>
            </div>
            <ul>
              {STEPS.map((st, i) => {
                const active = i === s;
                const done = i < s;
                return (
                  <li
                    key={st.n}
                    role="listitem"
                    className={`relative px-4 py-3 transition-colors duration-300 ${active ? "bg-cream text-ink" : "text-cream"}`}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={`font-mono text-[10px] tracking-[0.2em] ${active ? "text-ink-faint" : "text-cream/40"}`}>{st.n}</span>
                      <span className={`font-display font-black uppercase text-2xl leading-none tracking-[-0.01em] flex-1 ${active || done ? "" : "opacity-35"}`}>
                        {st.verb}
                      </span>
                      <span className={`font-mono text-[9px] tracking-[0.18em] uppercase ${active ? "text-express" : done ? "text-cream/50" : "text-cream/25"}`}>
                        {done ? "✓ done" : active ? "▸ now" : "·"}
                      </span>
                    </div>
                    {/* Step progress rail */}
                    {active && (
                      <span
                        key={`rail-${loop}-${i}`}
                        className="absolute bottom-0 left-0 h-[3px] bg-express"
                        style={{ animation: reduced ? "none" : `sb-progress ${DURATIONS[i]}ms linear both` }}
                        aria-hidden
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Live caption */}
          <div key={`cap-${loop}-${s}`} className="msg-in border border-ink/60 bg-cream px-5 py-4 shadow-[3px_4px_0_0_var(--color-ink)]">
            <p className="stamp">{STEPS[s].n} · {STEPS[s].verb}</p>
            <p className="font-serif italic text-ink-soft text-lg leading-snug mt-1.5">
              {STEPS[s].caption}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
