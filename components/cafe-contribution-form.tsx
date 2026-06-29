"use client";

// CafeContributionForm — multi-step modal for mapping a new café.
// Composes existing infrastructure: lib/speedtest.ts for the speed test,
// browser geolocation API, and POST /api/cafes for the submission.
//
// Flow: geolocation → café details → coffee metadata → speed test → photo → submit
// On success: calls onSuccess with the new café's slug so the parent can navigate.

import { useState, useRef, useCallback } from "react";
import type { CafeMetadata, MeasurementInput } from "@/lib/types";
import { runSpeedTest, type SpeedTestProgress, type SpeedTestResult } from "@/lib/speedtest";
import {
  MILK_OPTIONS,
  PRICE_TIERS,
  SEATING_TYPES,
  PRICE_TIER_LABELS,
  SEATING_LABELS,
  MILK_LABELS,
} from "@/lib/cafe-metadata";
import { CITIES } from "@/lib/cities";
import { postWithRetry } from "@/lib/fetch-retry";

type Step = "location" | "details" | "metadata" | "speedtest" | "photo" | "submitting" | "done" | "error";

interface FormState {
  lat: number | null;
  lng: number | null;
  name: string;
  neighbourhood: string;
  city: string;
  vibe: string;
  priceTier: string;
  milkOptions: string[];
  powerOutlets: boolean;
  seating: string;
  wifiNetwork: string;
  measurement: MeasurementInput | null;
  photo: string | null;
}

// Short alphanumeric suffix that keeps demo submissions from colliding on
// slug — same café name twice in a row would otherwise share `/cafes/demo-cafe`.
function randomSuffix(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 3; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return s;
}

// Generates a base64 SVG placeholder card so the demo path doesn't ask
// judges to find a real photo. Same poster aesthetic as the rest of the
// site so the new café page still looks composed.
function buildDemoPhoto(name: string, neighbourhood: string): string {
  const safeName = name.replace(/[<&>]/g, "");
  const safeHood = neighbourhood.replace(/[<&>]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
    <rect width="800" height="600" fill="#F4ECD8"/>
    <rect x="36" y="36" width="728" height="528" fill="none" stroke="#1A1612" stroke-width="3"/>
    <g transform="translate(400 230)">
      <path d="M-70 -40 Q0 -100 70 -40" stroke="#006D45" stroke-width="9" fill="none" stroke-linecap="round"/>
      <path d="M-40 -10 Q0 -50 40 -10" stroke="#006D45" stroke-width="9" fill="none" stroke-linecap="round"/>
      <circle cx="0" cy="22" r="6" fill="#006D45"/>
      <path d="M-60 40 H60 L52 105 Q50 118 38 118 H-38 Q-50 118 -52 105 Z" fill="#1A1612"/>
      <path d="M60 55 Q92 55 92 80 Q92 105 60 105" stroke="#1A1612" stroke-width="9" fill="none" stroke-linecap="round"/>
    </g>
    <text x="400" y="430" font-family="serif" font-size="56" font-weight="900" text-anchor="middle" fill="#1A1612" letter-spacing="-1">${safeName}</text>
    <text x="400" y="470" font-family="monospace" font-size="14" text-anchor="middle" fill="#1A1612" letter-spacing="3">${safeHood.toUpperCase()} · DEMO CAFÉ</text>
    <text x="400" y="540" font-family="monospace" font-size="11" text-anchor="middle" fill="#5F5750" letter-spacing="3">LATTENCY · MAPPED VIA THE CONTRIBUTION FORM</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

// Build a complete form state from a curated demo template, anchored to
// the city the form was opened in so the new café appears on the right
// map. Coordinates jitter slightly around a neighbourhood centre to keep
// repeat demos from stacking pins. Everything except the speed test is
// filled — judges run a real test, see real numbers, and submit.
function buildDemoPrefill(currentCity: string): FormState {
  const cityConfig = CITIES[currentCity] ?? CITIES["nairobi"];
  const hoods = cityConfig.demoLocations;
  const hood = hoods[Math.floor(Math.random() * hoods.length)];
  // ~500m jitter
  const lat = hood.lat + (Math.random() - 0.5) * 0.008;
  const lng = hood.lng + (Math.random() - 0.5) * 0.008;
  const namePool = [
    "Pop-up Pour",
    "Hackathon Espresso",
    "Demo Roasters",
    "Sample Brew Co",
    "Edge Café",
    "Pilot Pour-Over",
  ];
  const vibePool = [
    "demo lane regular",
    "judge's quick stop",
    "freshly mapped today",
    "first-light filter",
  ];
  const milkSets: string[][] = [["dairy", "oat"], ["dairy", "oat", "almond"], ["dairy"]];
  const priceTiers = ["budget", "mid"];
  const seatings = ["tables", "mixed", "bar"];

  const name = `${namePool[Math.floor(Math.random() * namePool.length)]} · ${hood.name} #${randomSuffix()}`;

  return {
    lat,
    lng,
    name,
    neighbourhood: hood.name,
    city: cityConfig.id,
    vibe: vibePool[Math.floor(Math.random() * vibePool.length)],
    priceTier: priceTiers[Math.floor(Math.random() * priceTiers.length)],
    milkOptions: milkSets[Math.floor(Math.random() * milkSets.length)],
    powerOutlets: Math.random() > 0.2,
    seating: seatings[Math.floor(Math.random() * seatings.length)],
    wifiNetwork: `${cityConfig.id}_guest`,
    measurement: null,
    photo: buildDemoPhoto(name, hood.name),
  };
}

function initialState(city: string): FormState {
  return {
    lat: null,
    lng: null,
    name: "",
    neighbourhood: "",
    // Pre-fill from page context so contributions land in the city the user
    // is currently looking at, instead of all defaulting to Nairobi. Users
    // can still edit if they're claiming a brand-new city.
    city,
    vibe: "",
    priceTier: "",
    milkOptions: [],
    powerOutlets: false,
    seating: "",
    wifiNetwork: "",
    measurement: null,
    photo: null,
  };
}

export function CafeContributionForm({
  onClose,
  onSuccess,
  currentCity = "nairobi",
}: {
  onClose: () => void;
  onSuccess: (slug: string) => void;
  /** Lowercase city id matching the page the form was opened from. Used
   *  to pre-fill `form.city` so contributions inherit the active city. */
  currentCity?: string;
}) {
  const [step, setStep] = useState<Step>("location");
  const [form, setForm] = useState<FormState>(() => initialState(currentCity));
  const [errorMsg, setErrorMsg] = useState("");
  const [testProgress, setTestProgress] = useState<SpeedTestProgress | null>(null);
  const [testState, setTestState] = useState<"idle" | "running" | "done" | "error">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleMilk(milk: string) {
    setForm((prev) => ({
      ...prev,
      milkOptions: prev.milkOptions.includes(milk)
        ? prev.milkOptions.filter((m) => m !== milk)
        : [...prev.milkOptions, milk],
    }));
  }

  // Demo path: fill every step except the speed test, jump straight to it.
  // Lets a judge see the end-to-end submission flow in two clicks (run test +
  // submit) without having to sit in a real café.
  function loadDemoPrefill() {
    setForm(buildDemoPrefill(currentCity));
    setStep("speedtest");
  }

  // Step 1: Geolocation
  function getLocation() {
    if (!navigator.geolocation) {
      setErrorMsg("Geolocation not available on this device");
      setStep("error");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        update("lat", pos.coords.latitude);
        update("lng", pos.coords.longitude);
        setStep("details");
      },
      (err) => {
        setErrorMsg(`Could not get location: ${err.message}`);
        setStep("error");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  // Step 4: Speed test — reuses lib/speedtest.ts directly
  const runTest = useCallback(async () => {
    setTestState("running");
    setTestProgress(null);
    try {
      const result: SpeedTestResult = await runSpeedTest((p) => setTestProgress(p));
      const measurement: MeasurementInput = {
        cafeId: "pending", // will be set by the API
        downMbps: result.downMbps,
        upMbps: result.upMbps,
        latencyMs: result.latencyMs,
        jitterMs: result.jitterMs,
        lossPct: result.lossPct,
        targetServer: result.targetServer ?? undefined,
        downloadBytes: result.downloadBytes,
        downloadDurationMs: result.downloadDurationMs,
      };
      update("measurement", measurement);
      setTestState("done");
    } catch (err) {
      setErrorMsg(`Speed test failed: ${(err as Error).message}`);
      setTestState("error");
    }
  }, []);

  // Step 5: Photo — client-side canvas resize to 800px JPEG
  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 800;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        update("photo", dataUrl);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  // Submit
  async function submit() {
    if (!form.measurement || !form.photo) return;
    setStep("submitting");

    const payload = {
      name: form.name,
      neighbourhood: form.neighbourhood,
      lat: form.lat,
      lng: form.lng,
      city: form.city || undefined,
      vibe: form.vibe || undefined,
      metadata: {
        priceTier: form.priceTier || undefined,
        milkOptions: form.milkOptions.length > 0 ? form.milkOptions : undefined,
        powerOutlets: form.powerOutlets,
        seating: form.seating || undefined,
        wifiNetwork: form.wifiNetwork || undefined,
      } as CafeMetadata,
      photo: form.photo,
      measurement: form.measurement,
    };

    try {
      const res = await postWithRetry("/api/cafes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Submission failed");
        setStep("error");
        return;
      }
      setStep("done");
      setTimeout(() => onSuccess(data.slug), 1500);
    } catch (err) {
      setErrorMsg(`Network error: ${(err as Error).message}`);
      setStep("error");
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const STEP_ORDER: Step[] = ["location", "details", "metadata", "speedtest", "photo"];
  const STEP_LABELS: Record<Step, string> = {
    location: "Location",
    details: "Café details",
    metadata: "Coffee details",
    speedtest: "Speed test",
    photo: "Photo",
    submitting: "Submitting…",
    done: "Café mapped!",
    error: "Error",
  };
  const currentStepIndex = STEP_ORDER.indexOf(step);
  const totalSteps = STEP_ORDER.length;
  const isProgressVisible = currentStepIndex >= 0;
  const stepsLeft =
    currentStepIndex >= 0 ? totalSteps - currentStepIndex - 1 : 0;
  const stepLabel = isProgressVisible
    ? `Step ${currentStepIndex + 1} of ${totalSteps} — ${STEP_LABELS[step]}`
    : STEP_LABELS[step];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-cream border border-ink shadow-[6px_8px_0_0_var(--color-ink)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-cream border-b border-ink/15 px-6 py-4 z-10">
          <div className="flex items-center justify-between">
            <div>
              <p className="stamp">Map a new café</p>
              <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-faint mt-1">
                {stepLabel}
                {isProgressVisible && stepsLeft > 0 && (
                  <span className="text-ink-faint/60 ml-2 normal-case">
                    · {stepsLeft === 1 ? "almost there" : `${stepsLeft} steps left`}
                  </span>
                )}
                {isProgressVisible && stepsLeft === 0 && (
                  <span className="text-express ml-2 normal-case">· last step</span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-ink-faint hover:text-ink text-xl leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {/* Visible 5-dot progress that fills as the user advances. */}
          {isProgressVisible && (
            <div
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={totalSteps}
              aria-valuenow={currentStepIndex + 1}
              aria-label={`Step ${currentStepIndex + 1} of ${totalSteps}`}
              className="flex items-center gap-1.5 mt-3"
            >
              {STEP_ORDER.map((s, i) => {
                const reached = i <= currentStepIndex;
                const current = i === currentStepIndex;
                return (
                  <span
                    key={s}
                    aria-hidden
                    className={[
                      "h-1.5 flex-1 transition-colors duration-300",
                      reached ? "bg-ink" : "bg-cream-deep",
                      current ? "ring-2 ring-offset-1 ring-offset-cream ring-ink" : "",
                    ].join(" ")}
                  />
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-5">
          {step === "location" && (
            <div className="space-y-4">
              <p className="font-serif italic text-ink-soft text-sm leading-relaxed">
                Map a café you&rsquo;re sitting in right now. We&rsquo;ll use your
                location to place it on the transit map, then run a speed test
                and add a photo.
              </p>
              <button
                type="button"
                onClick={getLocation}
                className="w-full py-3 bg-ink text-cream font-mono text-xs tracking-[0.22em] uppercase hover:bg-ink/90 transition-colors"
              >
                Share my location
              </button>
              <p className="font-mono text-[10px] text-ink-faint">
                Your exact coordinates are never stored — only the café&rsquo;s
                position, which you&rsquo;ll confirm on the next step.
              </p>

              <div className="relative pt-4 mt-2 border-t border-cream-deep">
                <p className="stamp mb-2">Don&rsquo;t feel like leaving the house?</p>
                <button
                  type="button"
                  onClick={loadDemoPrefill}
                  className="w-full py-3 border border-ink/40 font-mono text-xs tracking-[0.22em] uppercase text-ink-soft hover:bg-ink hover:text-cream hover:border-ink transition-colors"
                >
                  Try with sample data →
                </button>
                <p className="font-mono text-[10px] text-ink-faint mt-2 leading-snug">
                  Pre-fills a demo café in <span className="text-ink">{CITIES[currentCity]?.name ?? "this city"}</span>.
                  You still run a real speed test from your browser — that&rsquo;s
                  what makes the new café appear on the map.
                </p>
              </div>
            </div>
          )}

          {step === "details" && (
            <div className="space-y-4">
              <Field label="Café name">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="e.g. Artcaffe Westgate"
                  className="w-full px-3 py-2 border border-ink/30 bg-cream text-ink focus:outline-none focus:border-ink"
                />
              </Field>
              <Field label="Neighbourhood">
                <input
                  type="text"
                  value={form.neighbourhood}
                  onChange={(e) => update("neighbourhood", e.target.value)}
                  placeholder="e.g. Westlands"
                  className="w-full px-3 py-2 border border-ink/30 bg-cream text-ink focus:outline-none focus:border-ink"
                />
              </Field>
              <Field label="City">
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => update("city", e.target.value.toLowerCase())}
                  placeholder="e.g. nairobi"
                  className="w-full px-3 py-2 border border-ink/30 bg-cream text-ink focus:outline-none focus:border-ink"
                />
                <p className="font-mono text-[9px] tracking-[0.16em] uppercase text-ink-faint mt-1">
                  pre-filled from the map you opened · edit only to map a new city
                </p>
              </Field>
              <Field label="Vibe (optional)">
                <input
                  type="text"
                  value={form.vibe}
                  onChange={(e) => update("vibe", e.target.value)}
                  placeholder="e.g. quiet workhorse"
                  className="w-full px-3 py-2 border border-ink/30 bg-cream text-ink focus:outline-none focus:border-ink"
                />
              </Field>
              <div className="font-mono text-[10px] text-ink-faint">
                Location: {form.lat?.toFixed(4)}, {form.lng?.toFixed(4)}
              </div>
              <button
                type="button"
                disabled={!form.name.trim() || !form.neighbourhood.trim()}
                onClick={() => setStep("metadata")}
                className="w-full py-3 bg-ink text-cream font-mono text-xs tracking-[0.22em] uppercase disabled:opacity-40 hover:bg-ink/90 transition-colors"
              >
                Continue
              </button>
            </div>
          )}

          {step === "metadata" && (
            <div className="space-y-5">
              <Field label="Price tier">
                <div className="flex gap-2">
                  {PRICE_TIERS.map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => update("priceTier", form.priceTier === tier ? "" : tier)}
                      className={`px-4 py-2 border font-mono text-xs tracking-[0.14em] uppercase transition-colors ${
                        form.priceTier === tier
                          ? "border-ink bg-ink text-cream"
                          : "border-ink/30 text-ink-soft hover:border-ink"
                      }`}
                    >
                      {PRICE_TIER_LABELS[tier]}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Milk options">
                <div className="flex flex-wrap gap-2">
                  {MILK_OPTIONS.map((milk) => (
                    <button
                      key={milk}
                      type="button"
                      onClick={() => toggleMilk(milk)}
                      className={`px-3 py-1.5 border font-mono text-[10px] tracking-[0.14em] uppercase transition-colors ${
                        form.milkOptions.includes(milk)
                          ? "border-ink bg-ink text-cream"
                          : "border-ink/30 text-ink-soft hover:border-ink"
                      }`}
                    >
                      {MILK_LABELS[milk]}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Power outlets">
                <button
                  type="button"
                  onClick={() => update("powerOutlets", !form.powerOutlets)}
                  className={`px-4 py-2 border font-mono text-xs tracking-[0.14em] uppercase transition-colors ${
                    form.powerOutlets
                      ? "border-ink bg-ink text-cream"
                      : "border-ink/30 text-ink-soft hover:border-ink"
                  }`}
                >
                  {form.powerOutlets ? "✓ Outlets available" : "No outlets"}
                </button>
              </Field>

              <Field label="Seating">
                <div className="flex flex-wrap gap-2">
                  {SEATING_TYPES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => update("seating", form.seating === s ? "" : s)}
                      className={`px-3 py-1.5 border font-mono text-[10px] tracking-[0.14em] uppercase transition-colors ${
                        form.seating === s
                          ? "border-ink bg-ink text-cream"
                          : "border-ink/30 text-ink-soft hover:border-ink"
                      }`}
                    >
                      {SEATING_LABELS[s]}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="WiFi network name (optional)">
                <input
                  type="text"
                  value={form.wifiNetwork}
                  onChange={(e) => update("wifiNetwork", e.target.value)}
                  placeholder="e.g. ArtCaffe_Guest"
                  className="w-full px-3 py-2 border border-ink/30 bg-cream text-ink focus:outline-none focus:border-ink"
                />
              </Field>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep("details")}
                  className="flex-1 py-3 border border-ink/30 font-mono text-xs tracking-[0.22em] uppercase text-ink-soft hover:border-ink transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep("speedtest")}
                  className="flex-1 py-3 bg-ink text-cream font-mono text-xs tracking-[0.22em] uppercase hover:bg-ink/90 transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === "speedtest" && (
            <div className="space-y-4">
              <p className="font-serif italic text-ink-soft text-sm leading-relaxed">
                Run a speed test from where you&rsquo;re sitting. This is
                what makes the listing trustworthy — anyone can claim a
                café exists, but a real round-trip to the edge can&rsquo;t
                be faked from a fake IP. The café doesn&rsquo;t appear on
                the map without this reading.
              </p>

              {testState === "idle" && (
                <button
                  type="button"
                  onClick={runTest}
                  className="w-full py-4 bg-express text-cream font-mono text-xs tracking-[0.22em] uppercase hover:opacity-90 transition-opacity"
                >
                  Run speed test
                </button>
              )}

              {testState === "running" && testProgress && (
                <SpeedTestRunning progress={testProgress} />
              )}

              {testState === "done" && form.measurement && (
                <div className="space-y-3">
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <Stat label="DOWN" value={`${Math.round(form.measurement.downMbps)}`} unit="Mbps" />
                    <Stat label="UP" value={`${form.measurement.upMbps.toFixed(1)}`} unit="Mbps" />
                    <Stat label="PING" value={`${Math.round(form.measurement.latencyMs)}`} unit="ms" />
                    <Stat label="JITTER" value={`${form.measurement.jitterMs?.toFixed(1) ?? "—"}`} unit="ms" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep("photo")}
                    className="w-full py-3 bg-ink text-cream font-mono text-xs tracking-[0.22em] uppercase hover:bg-ink/90 transition-colors"
                  >
                    Continue
                  </button>
                </div>
              )}

              {testState === "error" && (
                <div className="space-y-3">
                  <p className="font-mono text-xs text-suspended">{errorMsg}</p>
                  <button
                    type="button"
                    onClick={() => { setTestState("idle"); setErrorMsg(""); }}
                    className="w-full py-3 border border-ink/30 font-mono text-xs tracking-[0.22em] uppercase text-ink-soft hover:border-ink transition-colors"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>
          )}

          {step === "photo" && (
            <div className="space-y-4">
              <p className="font-serif italic text-ink-soft text-sm leading-relaxed">
                Add a café photo — your coffee, the counter, the laptop view.
                It rides at the top of the café&rsquo;s page and gives the
                map a face. The speed test you just ran is the actual trust
                signal; the photo is the&nbsp;personality.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoSelect}
                className="hidden"
              />

              {form.photo ? (
                <div className="space-y-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Base64 preview, not a Next.js image */}
                  <img
                    src={form.photo}
                    alt="Café photo"
                    className="w-full max-h-64 object-cover border border-ink/30"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2 border border-ink/30 font-mono text-xs tracking-[0.22em] uppercase text-ink-soft hover:border-ink transition-colors"
                  >
                    Choose different photo
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-8 border-2 border-dashed border-ink/30 font-mono text-xs tracking-[0.22em] uppercase text-ink-soft hover:border-ink transition-colors"
                >
                  Take or upload a photo
                </button>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep("speedtest")}
                  className="flex-1 py-3 border border-ink/30 font-mono text-xs tracking-[0.22em] uppercase text-ink-soft hover:border-ink transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={!form.photo}
                  onClick={submit}
                  className="flex-1 py-3 bg-ink text-cream font-mono text-xs tracking-[0.22em] uppercase disabled:opacity-40 hover:bg-ink/90 transition-colors"
                >
                  Map this café
                </button>
              </div>
            </div>
          )}

          {step === "submitting" && (
            <div className="py-12 text-center">
              <p className="font-mono text-xs tracking-[0.22em] uppercase text-ink-soft">
                Mapping your café…
              </p>
            </div>
          )}

          {step === "done" && (
            <div className="py-12 text-center space-y-3">
              <p className="font-display font-black text-2xl text-express uppercase">
                Mapped!
              </p>
              <p className="font-serif italic text-ink-soft text-sm">
                {form.name} is now on the transit map. Redirecting…
              </p>
            </div>
          )}

          {step === "error" && (
            <div className="py-8 text-center space-y-4">
              <p className="font-mono text-xs text-suspended">{errorMsg}</p>
              <button
                type="button"
                onClick={() => { setStep("details"); setErrorMsg(""); }}
                className="px-6 py-2 border border-ink/30 font-mono text-xs tracking-[0.22em] uppercase text-ink-soft hover:border-ink transition-colors"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-faint">
        {label}
      </span>
      {children}
    </label>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="border border-ink/15 py-2">
      <div className="font-mono text-[8px] tracking-[0.14em] uppercase text-ink-faint">
        {label}
      </div>
      <div className="font-display font-black text-lg text-ink leading-none mt-1">
        {value}
      </div>
      <div className="font-mono text-[8px] text-ink-faint mt-0.5">
        {unit}
      </div>
    </div>
  );
}

// Speed-test "live" panel — three phase chips (ping / download / upload),
// a real-time numeric readout for the active phase, and skeleton tiles
// for the four result stats so the user sees where the numbers are about
// to land. Replaces the previous bare progress bar.
function SpeedTestRunning({ progress }: { progress: SpeedTestProgress }) {
  const phases: Array<{ id: SpeedTestProgress["phase"]; label: string }> = [
    { id: "ping", label: "Ping" },
    { id: "download", label: "Download" },
    { id: "upload", label: "Upload" },
  ];
  const phaseIndex = phases.findIndex((p) => p.id === progress.phase);
  // `done` falls past the last phase — clamp to 100% in that case.
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
      {/* Phase track */}
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
                <span aria-hidden>
                  {isDone ? "✓" : isActive ? "●" : "○"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live readout */}
      <div className="font-mono text-sm text-ink min-h-[1.25rem] flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block w-2 h-2 rounded-full bg-express animate-pulse"
        />
        {liveLabel}
      </div>

      {/* Animated bar */}
      <div className="h-1 bg-ink/10 overflow-hidden">
        <div
          className="h-full bg-express transition-all duration-500 ease-out"
          style={{ width: `${widthPct}%` }}
        />
      </div>

      {/* Result skeleton — four tiles that the actual numbers slot into. */}
      <div
        aria-hidden
        className="grid grid-cols-4 gap-2 pt-2 opacity-50"
      >
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
