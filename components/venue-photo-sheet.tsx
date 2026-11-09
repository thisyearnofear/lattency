"use client";

// VenuePhotoSheet — rung 3 of the contribution ladder as a standalone ask
// (docs/adaptive-ux-principles.md). Pick a photo → confirm no identifiable
// people → send. The client-side 800px JPEG resize is shared with the
// café form (lib/photo-resize.ts), so the payload lands well under the
// API's data-url cap. Three interactions, one stamp.

import { useEffect, useRef, useState } from "react";
import type { CafeStation } from "@/lib/types";
import { readContributorId } from "@/lib/contributor";
import { postWithRetry } from "@/lib/fetch-retry";
import { resizePhotoToDataUrl } from "@/lib/photo-resize";
import { haptic } from "@/lib/haptics";

type Phase = "pick" | "ready" | "sending" | "done";

export function VenuePhotoSheet({
  cafe,
  open,
  onClose,
  onLanded,
}: {
  cafe: CafeStation;
  open: boolean;
  onClose: () => void;
  onLanded?: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("pick");
  const [photo, setPhoto] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the flow each time the sheet opens. Deferred so the open
  // transition and the reset don't cascade in the same render.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setPhase("pick");
      setPhoto(null);
      setConsent(false);
      setError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      setPhoto(await resizePhotoToDataUrl(file));
      setPhase("ready");
    } catch {
      setError("That file isn't an image — pick a photo");
    }
  }

  async function send() {
    if (!photo || !consent) return;
    setPhase("sending");
    setError(null);
    try {
      const res = await postWithRetry(
        `/api/venues/${encodeURIComponent(cafe.id)}/photos`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            photo,
            consentPeople: true,
            contributorId: readContributorId(),
          }),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "Couldn't send — try again");
        setPhase("ready");
        return;
      }
      haptic(18);
      setPhase("done");
      onLanded?.();
    } catch {
      setError("Couldn't send — try again");
      setPhase("ready");
    }
  }

  return (
    <div
      aria-hidden={!open}
      inert={!open}
      className={`fixed inset-0 z-[60] ${open ? "" : "pointer-events-none"}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Add a photo of ${cafe.name}`}
    >
      <div
        className={`absolute inset-0 bg-ink/40 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
        aria-hidden
      />
      <div
        className={`absolute bottom-0 left-0 right-0 mx-auto flex w-full max-w-[520px] max-h-[85vh] flex-col border-x border-t border-ink/80 bg-cream shadow-[0_-12px_40px_rgba(26,22,18,0.25)] transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-ink/15 px-5 py-4">
          <div>
            <p className="stamp">One photo · this station</p>
            <p className="font-display font-black uppercase leading-none tracking-[-0.01em] text-ink text-xl mt-0.5">
              Give it a face
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-soft transition-colors hover:text-ink"
          >
            Close ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {phase === "done" ? (
            <div className="space-y-4 py-4">
              <div className="celebration-stamp inline-block border-2 border-express px-3 py-1 font-display font-black uppercase text-express text-lg">
                Photo landed
              </div>
              <p className="font-serif italic text-ink-soft text-sm leading-snug">
                Your photo is now the face of {cafe.name}. Community-reported —
                it rides until the next one lands.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="w-full bg-ink text-cream font-mono text-[11px] tracking-[0.22em] uppercase px-3 py-2.5 hover:bg-ink/90 transition-colors"
              >
                Back to the map
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="font-serif italic text-ink-soft text-sm leading-snug">
                Your coffee, the counter, the laptop view — the shot that
                belongs at the top of {cafe.name}&rsquo;s card.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onFile}
                className="hidden"
              />

              {photo ? (
                <div className="space-y-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Base64 preview, not a Next.js image */}
                  <img
                    src={photo}
                    alt="Your venue photo"
                    className="w-full max-h-64 object-cover border border-ink/30"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2 border border-ink/30 font-mono text-xs tracking-[0.22em] uppercase text-ink-soft hover:border-ink transition-colors"
                  >
                    Choose a different shot
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-10 border-2 border-dashed border-ink/30 font-mono text-xs tracking-[0.22em] uppercase text-ink-soft hover:border-ink transition-colors"
                >
                  Take or upload a photo
                </button>
              )}

              <label className="flex items-start gap-2.5 border border-ink/40 bg-cream-edge/60 px-3 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 accent-[var(--color-ink)]"
                />
                <span className="font-serif italic text-ink-soft text-sm leading-snug">
                  No identifiable people are in this shot.
                </span>
              </label>

              {error && (
                <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-suspended">
                  {error}
                </p>
              )}

              <button
                type="button"
                disabled={!photo || !consent || phase === "sending"}
                onClick={send}
                className="w-full bg-ink text-cream font-mono text-[11px] tracking-[0.22em] uppercase px-3 py-2.5 hover:bg-ink/90 transition-colors disabled:opacity-40"
              >
                {phase === "sending" ? "Sending…" : "Give it this face"}
              </button>

              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-ink-faint">
                Community-reported · newest photo wins
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
