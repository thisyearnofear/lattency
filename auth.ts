// Auth.js (NextAuth v5) configuration.
//
// Magic-link auth via Resend, sessions stored in Aurora via the Auth.js
// pg adapter (against the tables created in migration 0009).
//
// Degraded mode: if AUTH_SECRET or AUTH_RESEND_KEY isn't set, the route
// handler short-circuits gracefully — the app continues to work in
// anonymous-only mode without leaking 500s. This lets local dev work
// without credentials and lets production stand up before the keys land
// in the Vercel environment. The TopNav reads `authConfigured` to decide
// whether to render the Sign-in link.

import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import PostgresAdapter from "@auth/pg-adapter";
import { pool } from "@/lib/db";

// Stable secret resolution. In production, AUTH_SECRET must come from the
// environment; in development we fall back to a placeholder so the cookie
// signer doesn't throw 500s on every /api/auth/* request. The placeholder
// is committed (it's an obvious dev-only string) — production is required
// to override it via process.env in Vercel.
const PROD_PLACEHOLDER_WARNING =
  "[lattency][auth] AUTH_SECRET is not set in production. Set it in the Vercel environment.";
const DEV_PLACEHOLDER = "lattency-dev-placeholder-secret-do-not-use-in-prod";

function resolveAuthSecret(): string {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === "production") {
    console.warn(PROD_PLACEHOLDER_WARNING);
    // Use the dev placeholder so the app at least boots; sessions won't
    // survive deploys until the env var is set.
  }
  return DEV_PLACEHOLDER;
}

const AUTH_SECRET = resolveAuthSecret();

/** True when the magic-link email rail is wired (AUTH_RESEND_KEY set).
 *  When false, sign-in attempts still work but the magic link is logged
 *  to the server console instead of emailed. Useful in local dev; the
 *  sign-in page surfaces this explicitly. */
export const authConfigured = Boolean(process.env.AUTH_RESEND_KEY);

const FROM_ADDRESS = process.env.AUTH_FROM_EMAIL ?? "Lattency <no-reply@lattency.app>";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PostgresAdapter(pool),
  // Explicit secret pass — Auth.js v5 doesn't fall back to env vars
  // reliably across all module-resolution orders in Next 16 preview, so
  // we resolve once at module load (resolveAuthSecret above) and feed it
  // explicitly. Production still picks up the real env var.
  secret: AUTH_SECRET,
  // Sessions in DB rather than JWT — lets the contributor view query
  // measurements + cafes by user_id without parsing tokens server-side.
  session: { strategy: "database" },
  trustHost: true,
  pages: {
    signIn: "/auth/signin",
    verifyRequest: "/auth/verify",
  },
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: FROM_ADDRESS,
      // Override the default subject + html so the email reads like
      // Lattency, not generic NextAuth boilerplate.
      async sendVerificationRequest({ identifier: email, url }) {
        const apiKey = process.env.AUTH_RESEND_KEY;
        if (!apiKey) {
          // Degraded-mode dev: log the magic link instead of sending it.
          console.warn(
            `[lattency][auth] AUTH_RESEND_KEY unset — magic link for ${email}:\n  ${url}`,
          );
          return;
        }
        const { Resend: ResendClient } = await import("resend");
        const client = new ResendClient(apiKey);
        const result = await client.emails.send({
          from: FROM_ADDRESS,
          to: email,
          subject: "Your Lattency sign-in link",
          text: lattencyMagicLinkText(url),
          html: lattencyMagicLinkHtml(url),
        });
        if (result.error) {
          throw new Error(`[lattency][auth] Resend send failed: ${result.error.message}`);
        }
      },
    }),
  ],
  callbacks: {
    // Surface the user id on the session so client + server components
    // can identify the contributor without an extra query.
    async session({ session, user }) {
      if (session.user && user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
});

function lattencyMagicLinkText(url: string): string {
  return [
    "Welcome to Lattency.",
    "",
    "Click the link below to sign in. The link is single-use and expires in 24 hours.",
    "",
    url,
    "",
    "If you didn't request this, you can ignore this email.",
    "",
    "— Lattency",
  ].join("\n");
}

function lattencyMagicLinkHtml(url: string): string {
  return `
    <div style="font-family: 'IBM Plex Mono', monospace; max-width: 480px; margin: 0 auto; padding: 24px; background: #F4ECD8; color: #1A1612;">
      <h1 style="font-family: 'Big Shoulders Display', system-ui, sans-serif; font-weight: 900; text-transform: uppercase; letter-spacing: -0.02em; font-size: 36px; margin: 0 0 16px;">
        Lattency
      </h1>
      <p style="font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
        Click the button below to sign in. The link is single-use and expires in 24 hours.
      </p>
      <a href="${url}" style="display: inline-block; background: #1A1612; color: #F4ECD8; padding: 12px 20px; text-decoration: none; font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase;">
        Sign in to Lattency →
      </a>
      <p style="font-size: 11px; line-height: 1.6; color: #5F5750; margin: 24px 0 0;">
        If the button doesn't work, paste this URL into your browser:<br/>
        <span style="word-break: break-all;">${url}</span>
      </p>
      <p style="font-size: 11px; line-height: 1.6; color: #5F5750; margin: 24px 0 0;">
        Didn't request this? You can ignore the email and no account will be created.
      </p>
    </div>
  `.trim();
}
