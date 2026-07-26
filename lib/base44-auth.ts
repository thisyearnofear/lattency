import { getBase44, base44Configured } from "./base44";

/** Returns the current Base44 user, or null when unauthenticated.
 *  Uses auth.me() which throws when there is no session, so we catch. */
export async function getSession(): Promise<{ user: { id: string; email: string } } | null> {
  if (!base44Configured) return null;
  try {
    const user = await getBase44().auth.me();
    if (!user) return null;
    return { user: { id: user.id, email: user.email } };
  } catch {
    return null;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  if (!base44Configured) return false;
  try {
    return await getBase44().auth.isAuthenticated();
  } catch {
    return false;
  }
}

/** Email/password sign-in. Base44's auth rail is password + OTP, not
 *  magic-link, so this differs from the legacy Auth.js flow. */
export async function signIn(
  email: string,
  password: string,
): Promise<{ user?: { id: string; email: string }; error?: string }> {
  try {
    const { user } = await getBase44().auth.loginViaEmailPassword(email, password);
    return { user: { id: user.id, email: user.email } };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export function signOut(redirectUrl?: string): void {
  if (!base44Configured) return;
  getBase44().auth.logout(redirectUrl);
}
