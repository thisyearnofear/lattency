// Structured logging — JSON-line format in production, prettified in dev.
// Each log carries an optional request id so a Vercel log search can
// follow a single contribution flow end-to-end.
//
// Designed as a small wrapper around console rather than pino because the
// JSON cost (one stringify per line) is negligible at our scale and
// avoids pulling another dependency through the bundle.

import type { NextRequest } from "next/server";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  /** Request ID — pulled from x-vercel-id or generated per process. */
  reqId?: string;
  /** Scope tag — feature area, e.g. "contribute", "speedtest", "warmer". */
  scope?: string;
  /** Arbitrary structured fields. */
  [key: string]: unknown;
}

const isProd = process.env.NODE_ENV === "production";

function emit(level: LogLevel, message: string, context: LogContext = {}): void {
  if (isProd) {
    process.stdout.write(
      JSON.stringify({
        ts: new Date().toISOString(),
        level,
        message,
        ...context,
      }) + "\n",
    );
    return;
  }
  // Dev: human-readable, with the JSON context appended only if non-empty.
  const ctxKeys = Object.keys(context);
  const tag = `[lattency${context.scope ? "][" + context.scope : ""}]`;
  if (level === "error") console.error(tag, message, ctxKeys.length ? context : "");
  else if (level === "warn") console.warn(tag, message, ctxKeys.length ? context : "");
  else if (level === "debug") console.debug(tag, message, ctxKeys.length ? context : "");
  else console.log(tag, message, ctxKeys.length ? context : "");
}

export const log = {
  debug: (msg: string, ctx?: LogContext) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: LogContext) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => emit("error", msg, ctx),
};

/** Pulls the Vercel-assigned request id off an incoming request. Vercel
 *  sets `x-vercel-id` on every function invocation; outside Vercel this
 *  returns undefined and the request stays anonymous in the logs. */
export function reqIdFrom(req: NextRequest | Request): string | undefined {
  const fromVercel = req.headers.get("x-vercel-id");
  if (fromVercel) return fromVercel;
  // Fallback: a short random per-request id so dev logs are still
  // correlatable across the lifetime of one request.
  return `local-${Math.random().toString(36).slice(2, 10)}`;
}
