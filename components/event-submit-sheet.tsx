"use client";

// Two-step organiser submission. Step 1 collects the details; step 2 shows the
// event as it will read on the board, so the organiser checks it before it is
// sent. Submissions still land pending — the board only shows approved rows.

import { useEffect, useState, type FormEvent } from "react";
import { readContributorId } from "@/lib/contributor";
import { formatEventStart } from "@/lib/event-time";

const FIELD =
  "mt-1.5 w-full bg-cream border border-ink/40 px-3 py-2 font-serif text-ink text-base placeholder:text-ink-faint/70 focus:outline-none focus:border-ink";

// Next few evenings and a lunchtime. datetime-local values are wall-clock in
// the *browser's* timezone, so they are built from local components — a UTC
// string here would land an hour off once the browser parses it back.
function quickTimes(): Array<{ label: string; value: string }> {
  const pad = (n: number) => String(n).padStart(2, "0");
  const at = (daysAhead: number, hour: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    d.setHours(hour, 0, 0, 0);
    const value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
    return { label: "", value };
  };
  return [
    { ...at(0, 18), label: "Tonight 18:00" },
    { ...at(1, 12), label: "Tomorrow 12:00" },
    { ...at(1, 18), label: "Tomorrow 18:00" },
    { ...at(7, 18), label: "Next week 18:00" },
  ];
}

export function EventSubmitSheet({
  city,
  cityName,
  venues,
  open,
  onClose,
  onSubmitted,
}: {
  city: string;
  cityName: string;
  venues: Array<{ id: string; name: string }>;
  open: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [venueId, setVenueId] = useState(venues[0]?.id ?? "");
  const [communityName, setCommunityName] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const venueName = venues.find((v) => v.id === venueId)?.name ?? "Venue pending";

  function next(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (title.trim().length < 4) {
      setError("Give the event a title of at least four characters");
      return;
    }
    if (!startsAt) {
      setError("Pick a date and time");
      return;
    }
    if (!venueId) {
      setError("Choose the venue it happens at");
      return;
    }
    setStep(2);
  }

  async function send() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          startsAt: new Date(startsAt).toISOString(),
          venueId,
          communityName: communityName.trim() || null,
          link: link.trim() || null,
          city,
          contributorId: readContributorId(),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Submission failed");
        return;
      }
      setDone(true);
      onSubmitted?.();
    } catch {
      setError("Submission failed — try again");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep(1);
    setDone(false);
    setError(null);
    setTitle("");
    setStartsAt("");
    setCommunityName("");
    setLink("");
  }

  function close() {
    onClose();
    // Let the drawer finish its slide-out before clearing it.
    setTimeout(reset, 300);
  }

  return (
    <div
      aria-hidden={!open}
      inert={!open}
      className={`fixed inset-0 z-[60] ${open ? "" : "pointer-events-none"}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Submit an event in ${cityName}`}
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
            <p className="stamp">
              {done ? "Organisers · submitted" : `Organisers · step ${step} of 2`}
            </p>
            <p className="font-display font-black uppercase leading-none tracking-[-0.01em] text-ink text-xl mt-0.5">
              {done ? "Sent for approval" : "Submit an event"}
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
                Submitted
              </div>
              <p className="font-serif italic text-ink-soft">
                Thanks. A moderator reviews every event before it reaches the
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
          ) : step === 1 ? (
            <form onSubmit={next} className="space-y-4">
              <p className="font-serif italic text-ink-soft text-sm">
                Sketch it like a ticket. The card fills in as you go.
              </p>
              <div className="border border-ink/80 bg-cream shadow-[3px_4px_0_0_var(--color-ink)] px-4 py-3 transition-colors">
                <p className="font-mono text-[12px] tracking-[0.12em] uppercase text-express">
                  {startsAt ? formatEventStart(new Date(startsAt).toISOString()) : "Pick a time"}
                </p>
                <p className="font-display font-black uppercase text-lg leading-tight text-ink mt-0.5">
                  {title.trim() || "Your event title"}
                </p>
                <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-soft mt-0.5">
                  {venueName}
                </p>
              </div>
              <label className="block">
                <span className="stamp">Event title</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Thursday founders social"
                  className={FIELD}
                />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="stamp">When</span>
                  <input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className={FIELD}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                {quickTimes().map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => setStartsAt(t.value)}
                    className="border border-ink/60 px-2.5 py-1 font-mono text-[10px] tracking-[0.18em] uppercase text-ink hover:bg-ink hover:text-cream transition-colors"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <fieldset>
                <legend className="stamp">Venue</legend>
                {venues.length === 0 ? (
                  <p className="mt-1.5 font-serif italic text-ink-soft text-sm">
                    No venues mapped yet — add a café first.
                  </p>
                ) : (
                  <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {venues.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        aria-pressed={venueId === v.id}
                        onClick={() => setVenueId(v.id)}
                        className={`px-3 py-2 text-left font-serif text-sm border transition-colors ${
                          venueId === v.id
                            ? "border-ink bg-ink text-cream"
                            : "border-ink/40 text-ink hover:border-ink"
                        }`}
                      >
                        {v.name}
                      </button>
                    ))}
                  </div>
                )}
              </fieldset>
              <label className="block">
                <span className="stamp">Community (optional)</span>
                <input
                  type="text"
                  value={communityName}
                  onChange={(e) => setCommunityName(e.target.value)}
                  placeholder="Shoreditch Remote Club"
                  className={FIELD}
                />
              </label>
              <label className="block">
                <span className="stamp">RSVP link (optional)</span>
                <input
                  type="url"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://luma.com/…"
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
                className="w-full bg-ink text-cream font-mono text-[11px] tracking-[0.22em] uppercase px-3 py-2.5 hover:bg-ink/90 transition-colors inline-flex items-center justify-center gap-1.5"
              >
                Preview <span aria-hidden>→</span>
              </button>
            </form>
          ) : (
            <div className="space-y-5">
              <p className="stamp">As it will appear on the board</p>
              <div className="border border-ink/80 bg-cream shadow-[3px_4px_0_0_var(--color-ink)] px-4 py-3.5">
                <p className="font-mono text-[13px] tracking-[0.12em] uppercase text-express">
                  {startsAt ? formatEventStart(new Date(startsAt).toISOString()) : "—"}
                  <span className="text-ink-faint"> UTC</span>
                </p>
                <p className="font-display font-black uppercase text-lg leading-tight text-ink mt-1">
                  {title.trim()}
                </p>
                <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-soft mt-1">
                  {venueName}
                  {communityName.trim() ? ` · ${communityName.trim()}` : ""}
                </p>
              </div>
              <p className="font-serif italic text-ink-soft text-sm">
                Times show in UTC. Nothing goes live until it is approved.
              </p>
              {error && (
                <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-suspended">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={busy}
                  className="flex-1 border border-ink px-3 py-2.5 font-mono text-[11px] tracking-[0.22em] uppercase hover:bg-ink hover:text-cream transition-colors disabled:opacity-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={send}
                  disabled={busy}
                  className="flex-[2] bg-ink text-cream font-mono text-[11px] tracking-[0.22em] uppercase px-3 py-2.5 hover:bg-ink/90 transition-colors disabled:opacity-50"
                >
                  {busy ? "Sending…" : "Submit for approval"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
