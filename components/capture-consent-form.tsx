"use client";

// Consent checkpoint for the venue-capture stub. The two attestations gate
// a "continue" control — but there is no upload behind it yet: the capture
// pipeline (upload → blur verification → reconstruction) is Phase 1 infra.
// The button unlocks only to confirm the contributor understood; pressing
// it surfaces the opt-in notice, nothing more.

import { useState } from "react";

export function CaptureConsentForm() {
  const [venuePermission, setVenuePermission] = useState(false);
  const [patronNotice, setPatronNotice] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const ready = venuePermission && patronNotice;

  return (
    <div className="border border-ink/40 bg-cream-edge/40 p-6">
      <p className="stamp mb-4">Consent checkpoint</p>

      <label className="flex items-start gap-3 cursor-pointer py-2">
        <input
          type="checkbox"
          checked={venuePermission}
          onChange={(e) => {
            setVenuePermission(e.target.checked);
            setAcknowledged(false);
          }}
          className="mt-0.5 h-4 w-4 accent-[var(--color-ink)]"
        />
        <span className="font-serif text-[14px] leading-snug text-ink">
          I have permission from this venue to film its interior — granted
          directly by the owner, manager, or an authorized staff member.
        </span>
      </label>

      <label className="flex items-start gap-3 cursor-pointer py-2">
        <input
          type="checkbox"
          checked={patronNotice}
          onChange={(e) => {
            setPatronNotice(e.target.checked);
            setAcknowledged(false);
          }}
          className="mt-0.5 h-4 w-4 accent-[var(--color-ink)]"
        />
        <span className="font-serif text-[14px] leading-snug text-ink">
          Patrons have been notified that capture is happening, or the
          walkthrough is planned so no identifiable person is filmed. Every
          scan is still blurred before anything is published.
        </span>
      </label>

      <button
        type="button"
        disabled={!ready}
        onClick={() => setAcknowledged(true)}
        className={`mt-4 w-full py-2.5 font-mono text-[11px] tracking-[0.22em] uppercase transition-colors ${
          ready
            ? "bg-ink text-cream hover:bg-ink/90"
            : "bg-ink/20 text-ink-faint cursor-not-allowed"
        }`}
      >
        Continue to capture
      </button>

      {acknowledged && (
        <p className="font-serif italic text-ink-soft text-[13px] leading-snug mt-4 border-t border-ink/15 pt-4">
          Capture upload opens once this venue has opted in — the walkthrough
          recorder, face-blur pipeline, and 3D reconstruction are still being
          built. Your attestations on this page aren&rsquo;t recorded yet.
        </p>
      )}
    </div>
  );
}
