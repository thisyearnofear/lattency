import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { signIn, auth, authConfigured } from "@/auth";

export const metadata: Metadata = {
  title: "Sign in · Lattency",
  description:
    "Sign in to Lattency — magic link by email. No passwords, no social tokens.",
};

interface SearchParams {
  callbackUrl?: string;
  error?: string;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  // Already signed in? Bounce to /me (or the original callbackUrl).
  const session = await auth();
  if (session?.user) redirect(sp.callbackUrl ?? "/me");

  return (
    <>
      <TopNav current="app" />

      <main className="mx-auto max-w-[680px] px-6 md:px-12 pt-10 pb-24">
        <p className="stamp mb-2">Sign in</p>
        <h1
          className="font-display font-black uppercase text-ink leading-[0.92] tracking-[-0.02em]"
          style={{ fontSize: "clamp(40px, 7vw, 80px)" }}
        >
          Save your line.
        </h1>
        <p className="font-serif italic text-ink-soft text-xl mt-4 max-w-xl">
          Magic link by email — no passwords, no social tokens, no
          third-party login modals. We&rsquo;ll email you a one-time link
          that signs you in for 30 days.
        </p>

        <form
          action={async (formData) => {
            "use server";
            const email = String(formData.get("email") ?? "").trim().toLowerCase();
            if (!email) return;
            await signIn("resend", {
              email,
              redirectTo: sp.callbackUrl ?? "/me",
            });
          }}
          className="mt-10 border border-ink/15 bg-cream-edge/40 p-6 md:p-8 space-y-4"
        >
          <label className="block">
            <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-ink-faint">
              Email address
            </span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="mt-2 w-full px-3 py-3 border border-ink/30 bg-cream text-ink focus:outline-none focus:border-ink"
            />
          </label>

          <button
            type="submit"
            className="w-full py-3 bg-ink text-cream font-mono text-xs tracking-[0.22em] uppercase hover:bg-ink/90 transition-colors"
          >
            Send me a magic link
          </button>

          {!authConfigured && (
            <p className="font-mono text-[10px] text-ink-faint leading-snug">
              Email isn&rsquo;t wired in this environment — your magic
              link will be logged to the server console instead of sent.
              Useful in local dev; for production, set{" "}
              <code className="text-ink">AUTH_RESEND_KEY</code> in Vercel.
            </p>
          )}

          {sp.error && (
            <p className="font-mono text-[11px] text-suspended">
              {sp.error === "Verification"
                ? "That magic link has expired or already been used. Send a fresh one above."
                : `Sign-in error: ${sp.error}`}
            </p>
          )}
        </form>

        <p className="font-serif italic text-ink-soft text-base mt-8">
          Signing in lets you keep a private record of your contributions,
          claim coffee bounties when your readings get verified, and pick
          up where you left off across devices.{" "}
          <Link
            href="/partners"
            className="underline underline-offset-4 hover:text-ink"
          >
            How the bounty mechanic pays out →
          </Link>
        </p>
      </main>
    </>
  );
}
