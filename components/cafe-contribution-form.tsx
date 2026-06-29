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

const initialState: FormState = {
  lat: null,
  lng: null,
  name: "",
  neighbourhood: "",
  city: "",
  vibe: "",
  priceTier: "",
  milkOptions: [],
  powerOutlets: false,
  seating: "",
  wifiNetwork: "",
  measurement: null,
  photo: null,
};

export function CafeContributionForm({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (slug: string) => void;
}) {
  const [step, setStep] = useState<Step>("location");
  const [form, setForm] = useState<FormState>(initialState);
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
      const res = await fetch("/api/cafes", {
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

  const stepLabel = {
    location: "Step 1 of 5 — Location",
    details: "Step 2 of 5 — Café details",
    metadata: "Step 3 of 5 — Coffee details",
    speedtest: "Step 4 of 5 — Speed test",
    photo: "Step 5 of 5 — Photo",
    submitting: "Submitting…",
    done: "Café mapped!",
    error: "Error",
  }[step];

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
        <div className="sticky top-0 bg-cream border-b border-ink/15 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <p className="stamp">Map a new café</p>
            <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-faint mt-1">
              {stepLabel}
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

        <div className="px-6 py-5">
          {step === "location" && (
            <div className="space-y-4">
              <p className="font-serif italic text-ink-soft text-sm leading-relaxed">
                Map a café you&rsquo;re sitting in right now. We&rsquo;ll use your
                location to place it on the transit map, then run a speed test
                and snap a photo for verification.
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
                  onChange={(e) => update("city", e.target.value)}
                  placeholder="e.g. Nairobi (auto-filled from your location)"
                  className="w-full px-3 py-2 border border-ink/30 bg-cream text-ink focus:outline-none focus:border-ink"
                />
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
                Run a speed test from where you&rsquo;re sitting. This is the
                café&rsquo;s first measurement — it won&rsquo;t appear on the
                map without one.
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
                <div className="space-y-2">
                  <div className="font-mono text-sm text-ink">
                    {testProgress.phase === "ping" && "Pinging edge…"}
                    {testProgress.phase === "download" && (testProgress.downMbps !== undefined ? `↓ ${testProgress.downMbps} Mbps` : "Downloading…")}
                    {testProgress.phase === "upload" && (testProgress.upMbps !== undefined ? `↑ ${testProgress.upMbps} Mbps` : "Uploading…")}
                    {testProgress.phase === "done" && "Test complete"}
                  </div>
                  <div className="h-1 bg-ink/10">
                    <div
                      className="h-full bg-express transition-all duration-300"
                      style={{
                        width: `${
                          testProgress.phase === "ping" ? 15 :
                          testProgress.phase === "download" ? 50 :
                          testProgress.phase === "upload" ? 85 : 100
                        }%`,
                      }}
                    />
                  </div>
                </div>
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
                Snap a photo of your coffee, your receipt, or the café counter.
                This is your proof of presence — it makes the contribution
                trustworthy.
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
                    alt="Café proof"
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
