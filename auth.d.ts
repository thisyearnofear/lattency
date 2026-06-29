// Module augmentation so session.user.id is typed across the app.
// Auth.js v5 sets the id via the `session` callback in auth.ts.

import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
