"use client";

import { useState } from "react";

/**
 * Copy-current-URL button. Used on station pages so a visitor can grab a
 * shareable link to whatever café they're viewing.
 */
export function CopyShareLink() {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      const url = window.location.href;
      await navigator.clipboard.writeText(url);
      setState("copied");
      setTimeout(() => setState("idle"), 1600);
    } catch {
      setState("failed");
      setTimeout(() => setState("idle"), 1600);
    }
  }

  const label =
    state === "copied" ? "Copied ✓" : state === "failed" ? "Copy failed" : "Share link";

  return (
    <button
      type="button"
      onClick={copy}
      className="font-mono text-[10px] tracking-[0.22em] uppercase text-ink-soft hover:text-ink transition-colors inline-flex items-center gap-1.5 px-3 py-1.5 border border-ink/15 hover:border-ink/40"
    >
      <span aria-hidden>{state === "copied" ? "✓" : "⎘"}</span> {label}
    </button>
  );
}
