import { createClient, type Base44Client } from "@base44/sdk";

const appId = process.env.NEXT_PUBLIC_BASE44_APP_ID;

/** True when the Base44 backend is wired (app ID set). Gates the entire
 *  Base44 data path — when false the app falls through to pg / mock. */
export const base44Configured = Boolean(appId);

/** Singleton client, created lazily so module import never throws when the
 *  app ID is unset. Access via `getBase44()`; callers must gate on
 *  `base44Configured` first. */
let _client: Base44Client | null = null;

export function getBase44(): Base44Client {
  if (!_client) {
    if (!appId) {
      throw new Error("NEXT_PUBLIC_BASE44_APP_ID is not set");
    }
    _client = createClient({ appId });
  }
  return _client;
}

// Default export kept for ergonomic imports (`base44.entities...`). Throws
// if used while unconfigured — always check base44Configured first.
const base44 = new Proxy({} as Base44Client, {
  get(_t, prop) {
    return Reflect.get(getBase44(), prop);
  },
});

export default base44;
