// Auth.js v5 route handler — exposes /api/auth/* (signin, signout,
// callback, session, verify-request, csrf, providers). Delegates to the
// shared config in auth.ts so server components can also call
// `auth()` for the current session.

import { handlers } from "@/auth";

export const { GET, POST } = handlers;

// We don't statically prerender any auth endpoint.
export const dynamic = "force-dynamic";
