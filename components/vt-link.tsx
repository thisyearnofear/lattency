"use client";

// VTLink — a Next <Link> whose navigation runs inside the browser's View
// Transitions API, so route changes crossfade (or morph named elements)
// instead of hard-cutting. Falls back to a plain navigation when the API
// is unsupported; the reduced-motion block zeroes the durations.

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, MouseEvent } from "react";

type VTLinkProps = ComponentProps<typeof Link>;

export function VTLink({ onClick, href, ...rest }: VTLinkProps) {
  const router = useRouter();

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    // Let modifier-clicks, downloads and already-handled events behave
    // natively (new tab, save-as, etc.).
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    ) {
      return;
    }
    e.preventDefault();
    const path = typeof href === "string" ? href : href.pathname ?? "/";
    if (typeof document.startViewTransition === "function") {
      document.startViewTransition(async () => {
        router.push(path);
        // push() returns void; give React two frames so the new route's DOM
        // commits before the browser snapshots the after-state. Pages are
        // pre-rendered + prefetched, so this lands well within budget.
        await new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        );
      });
    } else {
      router.push(path);
    }
  }

  return <Link href={href} onClick={handleClick} {...rest} />;
}
