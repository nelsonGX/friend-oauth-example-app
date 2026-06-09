/**
 * PKCE (RFC 7636) + state helpers. All values are base64url with no padding.
 *
 * Runs on the server (Node crypto). The code_verifier never leaves the server:
 * it lives in an httpOnly session cookie and is only replayed back to the token
 * endpoint in the server-to-server exchange.
 */

import { createHash, randomBytes } from "node:crypto";

/** base64url(N random bytes). */
function randomBase64Url(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

/** code_verifier = base64url(32 random bytes). */
export function createCodeVerifier(): string {
  return randomBase64Url(32);
}

/** code_challenge = base64url(sha256(code_verifier)). */
export function createCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** state = base64url(16 random bytes). */
export function createState(): string {
  return randomBase64Url(16);
}
