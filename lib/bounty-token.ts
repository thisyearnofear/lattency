/** Generate an opaque lease token. Uses the global Web Crypto API so the
 *  module stays runtime-agnostic. */
export function generateLeaseToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID. Use getRandomValues
  // where available for cryptographic-quality tokens.
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const webCrypto = crypto as Crypto;
    const bytes = new Uint8Array(16);
    webCrypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
}
