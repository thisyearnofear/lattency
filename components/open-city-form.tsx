"use client";

// Lets anyone open a city board that isn't in the curated three.
// Landing on /{slug}?contribute=1 puts them on an empty map with the
// contribution form primed — first reading draws the line.

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { cityPath, slugifyCityName } from "@/lib/cities";

export function OpenCityForm({
  onOpened,
  compact = false,
}: {
  onOpened?: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const slug = slugifyCityName(value);
    if (!slug || slug.length < 2) {
      setError("Name a city — e.g. Berlin, Lagos, Accra");
      return;
    }
    setError(null);
    onOpened?.();
    router.push(`${cityPath(slug)}?contribute=1`);
  }

  return (
    <form onSubmit={submit} className={compact ? "space-y-2" : "space-y-3"}>
      <label className="block">
        <span className="stamp">Open any city</span>
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Berlin, Lagos, Accra…"
          autoComplete="address-level2"
          className="mt-1.5 w-full bg-cream border border-ink/40 px-3 py-2 font-serif text-ink text-base placeholder:text-ink-faint/70 focus:outline-none focus:border-ink"
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
        Open board <span aria-hidden>→</span>
      </button>
    </form>
  );
}
