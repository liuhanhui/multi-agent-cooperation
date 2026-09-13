import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify GitHub X-Hub-Signature-256 against the raw request body.
 * @param rawBody - Exact bytes GitHub signed
 * @param signatureHeader - Header value (`sha256=…`)
 * @param secret - MAC_GITHUB_WEBHOOK_SECRET (never logged)
 * @returns true when signature matches
 */
export function verifyGithubSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!secret.trim()) return false;
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(provided, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Sign a raw body the same way GitHub does (tests / local simulate).
 * @param rawBody - Body bytes
 * @param secret - Shared secret
 * @returns `sha256=…` header value
 */
export function signGithubPayload(rawBody: Buffer, secret: string): string {
  const hex = createHmac("sha256", secret).update(rawBody).digest("hex");
  return `sha256=${hex}`;
}
