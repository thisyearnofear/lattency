"use client";

import { useEffect, useState, type FormEvent } from "react";
import { readContributorId } from "@/lib/contributor";

const FIELD =
  "mt-1.5 w-full bg-cream border border-ink/40 px-3 py-2 font-serif text-ink text-base placeholder:text-ink-faint/70 focus:outline-none focus:border-ink";

export function CommunitySubmitSheet({
  city,
  cityName,
  open,
  onClose,
  onSubmitted,
}: {
  city: string;
  cityName: string;
  open: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const [name, setName] = useState("");
  const [focus, setFocus] = useState("");
  const [lead, setLead] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [lumaUrl, setLumaUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function send(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) {
      setError("Give the community a name of at least two characters");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/communities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          focus: focus.trim() || null,
          lead: lead.trim() || null,
          city,
          websiteUrl: websiteUrl.trim() || null,
          lumaUrl: lumaUrl.trim() || null,
          contributorId: readContributorId(),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Registration failed");
        return;
      }
      setDone(true);
      onSubmitted?.();
    } catch {
      setError("Registration failed — try again");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setDone(false);
    setError(null);
    setName("");
    setFocus("");
    setLead("");
    setWebsiteUrl("");
    setLumaUrl("");
  }

  function close() {
    onClose();
    setTimeout(reset, 300);
  }

  return (
    <div
      aria-hidden={!open}
      inert={!open}
      className={`fixed inset-0 z-[60] ${open ? "" : "pointer-events-none"}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Register a community in ${cityName}`}
    >
      <div
        className={`absolute inset-0 bg-ink/40 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={close}
        aria-hidden
      />
      <div
        className={`absolute right-0 top-0 flex h-full w-full max-w-[460px] flex-col border-l border-ink/80 bg-cream shadow-[-12px_0_40px_rgba(26,22,18,0.25)] transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-ink/15 px-5 py-4">
          <div>
            <p className="stamp">{done ? "Communities · registered" : "Communities · register"}</p>
            <p className="font-display font-black uppercase leading-none tracking-[-0.01em] text-ink text-xl mt-0.5">
              {done ? "Sent for approval" : "Register a community"}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-soft transition-colors hover:text-ink"
          >
            Close ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {done ? (
            <div className="space-y-4">
              <div className="celebration-stamp inline-block border-2 border-express px-3 py-1 font-display font-black uppercase text-express text-lg">
                Registered
              </div>
              <p className="font-serif italic text-ink-soft">
                Thanks. A moderator reviews every community before it reaches the
                board for {cityName}.
              </p>
              <button
                type="button"
                onClick={close}
                className="w-full bg-ink text-cream font-mono text-[11px] tracking-[0.22em] uppercase px-3 py-2.5 hover:bg-ink/90 transition-colors"
              >
                Back to the board
              </button>
            </div>
          ) : (
            <form onSubmit={send} className="space-y-4">
              <p className="font-serif italic text-ink-soft text-sm">
                Put your group on the map. Nothing goes live until it is approved.
              </p>
              <label className="block">
                <span className="stamp">Community name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Shoreditch Remote Club"
                  maxLength={60}
                  className={FIELD}
                />
              </label>
              <label className="block">
                <span className="stamp">Focus (optional)</span>
                <input
                  type="text"
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                  placeholder="Remote workers and freelancers"
                  maxLength={120}
                  className={FIELD}
                />
              </label>
              <label className="block">
                <span className="stamp">Lead (optional)</span>
                <input
                  type="text"
                  value={lead}
                  onChange={(e) => setLead(e.target.value)}
                  placeholder="Your name"
                  maxLength={40}
                  className={FIELD}
                />
              </label>
              <label className="block">
                <span className="stamp">Website (optional)</span>
                <input
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://…"
                  maxLength={500}
                  className={FIELD}
                />
              </label>
              <label className="block">
                <span className="stamp">Luma (optional)</span>
                <input
                  type="url"
                  value={lumaUrl}
                  onChange={(e) => setLumaUrl(e.target.value)}
                  placeholder="https://luma.com/…"
                  maxLength={500}
                  className={FIELD}
                />
              </label>
              {error && (
                <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-suspended">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="w-full bg-ink text-cream font-mono text-[11px] tracking-[0.22em] uppercase px-3 py-2.5 hover:bg-ink/90 transition-colors disabled:opacity-50"
              >
                {busy ? "Registering…" : "Register community"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}