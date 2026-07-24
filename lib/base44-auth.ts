import base44 from "./base44";

export const authConfigured = Boolean(process.env.NEXT_PUBLIC_BASE44_APP_ID);

export async function getSession(): Promise<{ user: { id: string; email: string } } | null> {
  try {
    const session = await base44.auth.getSession();
    if (!session?.user) return null;
    return {
      user: { id: session.user.id, email: session.user.email ?? "" },
    };
  } catch {
    return null;
  }
}

export async function signIn(email: string): Promise<{ url?: string; error?: string }> {
  try {
    return await base44.auth.signIn({ email });
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function signOut(): Promise<void> {
  await base44.auth.signOut();
}
