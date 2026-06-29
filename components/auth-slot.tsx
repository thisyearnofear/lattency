"use client";

// Client-side auth indicator for the top nav. Renders nothing on first
// paint, then upgrades to either an avatar+sign-out or a sign-in link
// once the session response lands. Keeps the surrounding pages
// statically prerenderable — `auth()` on the server would force every
// route to opt out of static rendering because it touches the cookie.

import Link from "next/link";
import { useEffect, useState } from "react";

type SessionState =
  | { kind: "loading" }
  | { kind: "anon" }
  | { kind: "user"; email: string | null; id: string };

export function AuthSlot({ current }: { current: string }) {
  const [state, setState] = useState<SessionState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setState({ kind: "anon" });
          return;
        }
        const data = (await res.json()) as
          | null
          | { user?: { id?: string; email?: string | null } | null };
        if (cancelled) return;
        const u = data?.user;
        if (u?.id) setState({ kind: "user", id: u.id, email: u.email ?? null });
        else setState({ kind: "anon" });
      } catch {
        if (!cancelled) setState({ kind: "anon" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") {
    // Reserve some space so the nav doesn't jump on hydration.
    return <span aria-hidden className="w-16 h-4 bg-cream-deep/40 rounded-sm" />;
  }

  if (state.kind === "user") {
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/me"
          className={
            current === "me"
              ? "text-ink inline-flex items-center gap-1.5"
              : "text-ink-soft hover:text-ink transition-colors inline-flex items-center gap-1.5"
          }
          title={state.email ?? "Your account"}
        >
          <span
            aria-hidden
            className="w-6 h-6 rounded-full bg-ink text-cream flex items-center justify-center text-[10px] font-mono"
          >
            {(state.email ?? "?")[0].toUpperCase()}
          </span>
          <span className="hidden sm:inline">You</span>
        </Link>
        <SignOutForm />
      </div>
    );
  }

  return (
    <Link
      href="/auth/signin"
      className={
        current === "auth"
          ? "text-ink"
          : "text-ink-soft hover:text-ink transition-colors"
      }
    >
      Sign in
    </Link>
  );
}

function SignOutForm() {
  return (
    <form
      action="/api/auth/signout"
      method="post"
      onSubmit={(e) => {
        // Submit normally so Auth.js can do its CSRF dance.
        // The redirect target is set via a hidden field.
        e.currentTarget
          .querySelector("input[name=callbackUrl]")
          ?.setAttribute("value", "/");
      }}
    >
      <input type="hidden" name="callbackUrl" value="/" />
      <button
        type="submit"
        className="text-ink-faint hover:text-ink transition-colors hidden md:inline font-mono text-[11px] tracking-[0.22em] uppercase"
      >
        Sign out
      </button>
    </form>
  );
}
