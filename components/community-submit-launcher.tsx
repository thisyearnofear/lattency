"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CommunitySubmitSheet } from "./community-submit-sheet";

export function CommunitySubmitLauncher({
  city,
  cityName,
}: {
  city: string;
  cityName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 border border-ink/80 bg-cream px-3 py-2 font-mono text-[11px] tracking-[0.22em] uppercase text-ink hover:bg-ink hover:text-cream transition-colors shadow-[2px_2px_0_0_var(--color-ink)]"
      >
        Register a community <span aria-hidden>→</span>
      </button>
      <CommunitySubmitSheet
        city={city}
        cityName={cityName}
        open={open}
        onClose={() => setOpen(false)}
        onSubmitted={() => router.refresh()}
      />
    </>
  );
}