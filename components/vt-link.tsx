"use client";

// VTLink — a Next <Link> whose navigation runs inside the browser's View
// Transitions API, so route changes crossfade (or morph named elements)
// instead of hard-cutting. Falls back to a plain navigation when the API
// is unsupported; the reduced-motion block zeroes the durations.

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, MouseEvent } from "react";

type VTLinkProps = ComponentProps<typeof Link>;

// The app router pushes history state only when the new route's DOM commits,
// so polling location.pathname is the reliable "navigation done" signal —
// router.push() itself returns before anything renders. Polling MUST use
// timers, not requestAnimationFrame: while a view transition's update
// callback is pending the browser freezes rendering, so rAF callbacks never
// fire and the transition would deadlock until the engine aborts it. The
// timeout keeps a slow / failed fetch from freezing the page for long; on
// timeout the browser just crossfades whatever is on screen, which is the
// old behaviour.
function waitForCommit(targetPath: string, timeoutMs = 1000): Promise<void> {
  return new Promise((resolve) => {
    const started = performance.now();
    const tick = () => {
      if (
        window.location.pathname === targetPath ||
        performance.now() - started > timeoutMs
      ) {
        resolve();
      } else {
        setTimeout(tick, 32);
      }
    };
    setTimeout(tick, 32);
  });
}

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
      document.startViewTransition(() => {
        router.push(path);
        return waitForCommit(path.split(/[?#]/)[0]);
      });
    } else {
      router.push(path);
    }
  }

  return <Link href={href} onClick={handleClick} {...rest} />;
}
