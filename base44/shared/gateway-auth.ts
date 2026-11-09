/** Constant-time shared-secret check. Returns null when authorized, else a
 *  ready error Response (503 when the secret isn't configured, 401 on a
 *  bad/missing key). `headerName` lets sibling surfaces reuse the same
 *  pattern — e.g. the scan worker key rides on `x-scan-worker-key` while
 *  the server↔Base44 gateway key rides on `x-lattency-server-key`. */
export async function authorizeGateway(
  req: Request,
  secret: string | undefined,
  headerName = "x-lattency-server-key",
): Promise<Response | null> {
  const headers = { "Cache-Control": "no-store" };
  if (!secret || secret.length < 32)
    return Response.json(
      { error: "Contribution gateway unavailable" },
      { status: 503, headers },
    );
  const supplied = req.headers.get(headerName);
  if (!supplied || supplied.length > 1024)
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(secret)),
    crypto.subtle.digest("SHA-256", encoder.encode(supplied)),
  ]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left[i] ^ right[i];
  return mismatch === 0
    ? null
    : Response.json({ error: "Unauthorized" }, { status: 401, headers });
}
