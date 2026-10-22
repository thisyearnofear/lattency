"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { EventSubmitSheet } from "./event-submit-sheet";

export function EventSubmitLauncher({
  city,
  cityName,
  venues,
}: {
  city: string;
  cityName: string;
  venues: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <p className="font-serif italic text-ink-soft text-sm max-w-md">
        Running a meetup or a remote-work session here? Submit it and a
        moderator will publish it to the board.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-ink text-cream font-mono text-[11px] tracking-[0.22em] uppercase px-4 py-2.5 hover:bg-ink/90 transition-colors inline-flex items-center gap-1.5"
      >
        Submit an event <span aria-hidden>→</span>
      </button>
      <EventSubmitSheet
        city={city}
        cityName={cityName}
        venues={venues}
        open={open}
        onClose={close}
        onSubmitted={() => router.refresh()}
      />
    </div>
  );
}
