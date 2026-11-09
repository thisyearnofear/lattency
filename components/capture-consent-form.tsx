"use client";

// The capture-run flow for the venue-capture pilot — three steps run as a
// mission: BRIEF (the capture-day checklist), ATTEST (three required
// consent attestations), ARM (the printable patron notice). There is still
// no upload behind it: arming the run surfaces the notice and the
// pipeline-status line, nothing more.

import { useState } from "react";

const RUN_STEPS = ["BRIEF", "ATTEST", "ARM"] as const;

// The capture-day checklist from docs/venue-capture-patron-notice.md.
const CAPTURE_DAY_CHECKLIST = [
  "Confirm the venue's signed consent is on file — the \u201cvenue has opted in\u201d state.",
  "Place the entrance notice where people walk in.",
  "Film during the agreed off-peak window only — a near-empty room makes a better model and has fewer faces to blur.",
  "Walk a slow loop covering every public area. Skip restrooms, staff-only areas, and anything the venue flagged.",
  "If anyone asks you to stop — stop. Tell them about the blur/removal option.",
  "No audio needed — we strip it on upload anyway.",
  "Upload within 24 hours. Raw footage is deleted from our side within 72 hours.",
];

// Trimmed entrance notice from docs/venue-capture-patron-notice.md — the
// pilot prints or pastes this at the door during capture.
const PATRON_NOTICE = `3D SCANNING IN PROGRESS

This venue is being filmed to create a 3D model for Lattency, a workspace map.
A Lattency contributor is filming the room between __:__ and __:__.

Faces and personal items are blurred automatically before the model is made.
The raw video is deleted within 72 hours.

Don't want to appear? Tell the person filming and we'll stop, or ask the
venue staff.

Questions: hello@lattency.app`;

function Attestation({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-[var(--color-ink)]"
      />
      <span className="font-serif text-[14px] leading-snug text-ink">
        {children}
      </span>
    </label>
  );
}

export function CaptureRun({ venueName }: { venueName: string }) {
  const [step, setStep] = useState(0);
  const [venuePermission, setVenuePermission] = useState(false);
  const [patronNotice, setPatronNotice] = useState(false);
  const [patronSafety, setPatronSafety] = useState(false);
  const [copied, setCopied] = useState(false);

  const attested = venuePermission && patronNotice && patronSafety;

  const copyNotice = async () => {
    try {
      await navigator.clipboard.writeText(PATRON_NOTICE);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the notice text stays selectable */
    }
  };

  return (
    <div className="border border-ink/40 bg-cream-edge/40 shadow-[3px_4px_0_0_var(--color-ink)]">
      {/* Run progress — BRIEF → ATTEST → ARM */}
      <div className="flex items-center gap-2 border-b border-ink/15 px-6 py-3 font-mono text-[10px] tracking-[0.22em] uppercase">
        {RUN_STEPS.map((label, i) => (
          <span key={label} className="flex items-center gap-2">
            <span
              className={
                i === step
                  ? "bg-ink text-cream px-1.5 py-0.5"
                  : i < step
                    ? "text-ink-soft"
                    : "text-ink-faint"
              }
            >
              {String(i + 1).padStart(2, "0")} {label}
            </span>
            {i < RUN_STEPS.length - 1 && (
              <span className="text-ink-faint" aria-hidden>
                →
              </span>
            )}
          </span>
        ))}
      </div>

      <div className="p-6">
        {step === 0 && (
          <div>
            <p className="stamp mb-3">Step 01 — Brief</p>
            <p className="font-serif italic text-ink-soft text-[15px] leading-snug">
              One slow lap of{" "}
              <span className="text-ink not-italic">{venueName}</span>, filmed
              on your phone, becomes the 3D tour. Run the checklist before you
              press record.
            </p>

            {/* The capture-day checklist as a numbered transit line. */}
            <ol className="mt-5">
              {CAPTURE_DAY_CHECKLIST.map((item, i) => (
                <li key={i} className="relative flex gap-4 pb-4 last:pb-0">
                  {i < CAPTURE_DAY_CHECKLIST.length - 1 && (
                    <span
                      aria-hidden
                      className="absolute left-[11px] top-6 bottom-0 w-px bg-ink/30"
                    />
                  )}
                  <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center bg-ink font-display text-[11px] font-black text-cream">
                    {i + 1}
                  </span>
                  <span className="pt-0.5 font-serif text-[14px] leading-snug text-ink">
                    {item}
                  </span>
                </li>
              ))}
            </ol>

            <p className="mt-5 border-t border-ink/15 pt-4 font-serif italic text-ink-soft text-[13px] leading-snug">
              Film during the agreed quiet window — a near-empty room makes a
              better model.
            </p>

            <button
              type="button"
              onClick={() => setStep(1)}
              className="mt-4 w-full bg-ink py-2.5 font-mono text-[11px] tracking-[0.22em] uppercase text-cream transition-colors hover:bg-ink/90"
            >
              Proceed to attestations →
            </button>
          </div>
        )}

        {step === 1 && (
          <div>
            <p className="stamp mb-4">Step 02 — Attest</p>

            <Attestation checked={venuePermission} onChange={setVenuePermission}>
              I have permission from this venue to film its interior — granted
              directly by the owner, manager, or an authorized staff member.
            </Attestation>

            <Attestation checked={patronNotice} onChange={setPatronNotice}>
              Patrons have been notified that capture is happening, or the
              walkthrough is planned so no identifiable person is filmed. Every
              scan is still blurred before anything is published.
            </Attestation>

            <Attestation checked={patronSafety} onChange={setPatronSafety}>
              I won&rsquo;t film minors, and I&rsquo;ll stop filming immediately
              if anyone — patron or staff — asks me to stop.
            </Attestation>

            <div className="mt-4 flex items-center gap-4">
              <button
                type="button"
                onClick={() => setStep(0)}
                className="font-mono text-[10px] tracking-[0.22em] uppercase text-ink-faint transition-colors hover:text-ink"
              >
                ← Brief
              </button>
              <button
                type="button"
                disabled={!attested}
                onClick={() => setStep(2)}
                className={`flex-1 py-2.5 font-mono text-[11px] tracking-[0.22em] uppercase transition-colors ${
                  attested
                    ? "bg-ink text-cream hover:bg-ink/90"
                    : "bg-ink/20 text-ink-faint cursor-not-allowed"
                }`}
              >
                Arm the run →
              </button>
            </div>
          </div>
        )}

        {step === 2 && attested && (
          <div>
            <p className="stamp mb-3">Step 03 — Arm</p>
            <p className="font-display text-lg font-black uppercase tracking-[-0.01em] text-ink">
              Run armed — {venueName}
            </p>
            <p className="mt-1 font-serif italic text-ink-soft text-[13px] leading-snug">
              Print or paste this notice at the entrance before you film.
            </p>

            <div className="mt-4 border-2 border-ink/80 bg-cream p-4 shadow-[3px_4px_0_0_var(--color-ink)]">
              <p className="mb-2 font-mono text-[10px] tracking-[0.22em] uppercase text-ink-faint">
                Entrance notice — A6 card
              </p>
              <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-ink">
                {PATRON_NOTICE}
              </pre>
            </div>

            <button
              type="button"
              onClick={copyNotice}
              className="mt-4 w-full border border-ink/80 bg-cream py-2.5 font-mono text-[11px] tracking-[0.22em] uppercase text-ink shadow-[2px_2px_0_0_var(--color-ink)] transition-colors hover:bg-ink hover:text-cream"
            >
              {copied ? "Copied ✓" : "Copy notice text"}
            </button>

            <p className="mt-4 border-t border-ink/15 pt-4 font-serif italic text-ink-soft text-[13px] leading-snug">
              Upload opens when your venue&rsquo;s scan slot is confirmed.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
