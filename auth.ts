// Auth shim — Auth.js (next-auth) was removed when the backend migrated to
// Base44. Base44 auth is browser-based (tokens in localStorage, managed by
// the SDK), so server-side session reads are not available in the same way.
//
// This module keeps the same export surface (`auth`, `signIn`, `signOut`,
// `handlers`, `authConfigured`) so existing imports compile. When Base44 is
// configured, `authConfigured` is true but `auth()` returns null on the
// server (Base44 sessions live client-side). The app runs in anonymous
// contributor mode, which is fine for the competition demo.
//
// Full Base44 auth (client-side login, /me dashboard with user-scoped data)
// is a stretch goal for post-competition.

export interface Session {
  user: {
    id: string;
    email?: string | null;
  };
}

/** True when a real auth backend is wired. Used by TopNav to decide
 *  whether to render the Sign-in link. */
export const authConfigured = false;

/** Server-side session read. Always null — Base44 sessions are
 *  client-side (localStorage tokens). The API routes guard on
 *  `authConfigured && !base44Configured` before calling this, so it
 *  is never reached in the Base44 path. */
export async function auth(): Promise<Session | null> {
  return null;
}

/** Sign-in stub. The signin page calls this as a server action. With
 *  Base44, auth is handled client-side via the SDK. This no-ops. */
export async function signIn(
  provider?: string,
  options?: { email?: string; redirectTo?: string },
): Promise<void> {
  // Base44 auth is client-side. No server action needed.
  void provider;
  void options;
}

/** Sign-out stub. */
export async function signOut(): Promise<void> {
  // Base44 auth is client-side. No server action needed.
}

/** NextAuth-compatible route handler stub. The /api/auth/* catch-all
 *  still imports this; it returns 501 since Auth.js is removed. */
export const handlers = {
  GET: () =>
    Response.json({ error: "Auth.js removed — use Base44 auth" }, { status: 501 }),
  POST: () =>
    Response.json({ error: "Auth.js removed — use Base44 auth" }, { status: 501 }),
};
