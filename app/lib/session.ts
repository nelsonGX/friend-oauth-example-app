/**
 * Minimal stateless session, stored in HMAC-signed httpOnly cookies.
 *
 * Two cookies are used:
 *   - `fgc_tx`      : the in-flight OAuth transaction { codeVerifier, state }.
 *                     Short-lived; exists only between /login and /callback.
 *   - `fgc_session` : the authenticated session (user + tokens).
 *
 * Both are httpOnly, so browser JavaScript can never read them — the tokens
 * (and the code_verifier) stay on the server side of the wire. The cookies are
 * signed (not encrypted), so they are tamper-evident; the access/refresh tokens
 * inside are opaque bearer strings the browser already cannot use against our
 * protected routes, and CLIENT_SECRET is never placed in them.
 *
 * For a real app with sensitive data you would encrypt the payload or keep it
 * in a server-side store keyed by an opaque cookie. This is an example app.
 */

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config";

const TX_COOKIE = "fgc_tx";
const SESSION_COOKIE = "fgc_session";

const TX_MAX_AGE = 60 * 10; // 10 minutes — only needs to outlive the redirect.
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days (matches refresh token life).

// Use Secure cookies whenever we are deployed over HTTPS.
const SECURE = config.redirectUri.startsWith("https://");

export type OAuthTx = {
  codeVerifier: string;
  state: string;
};

export type Session = {
  // identify
  discordId: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  // roles
  roles: string[];
  allowed: boolean;
  inGuild: boolean;
  // credits (optional — only present if the credits scope was granted)
  credits?: number;
  // tokens (server-side only)
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch seconds
};

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

function sign(payload: string): string {
  return createHmac("sha256", config.sessionSecret)
    .update(payload)
    .digest("base64url");
}

function seal(data: unknown): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function unseal<T>(token: string | undefined): T | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;

  const payload = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  const expected = sign(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// OAuth transaction (code_verifier + state)
// ---------------------------------------------------------------------------

export async function setTx(tx: OAuthTx): Promise<void> {
  (await cookies()).set(TX_COOKIE, seal(tx), {
    httpOnly: true,
    secure: SECURE,
    sameSite: "lax", // sent on the top-level GET redirect back from the IdP.
    path: "/",
    maxAge: TX_MAX_AGE,
  });
}

export async function getTx(): Promise<OAuthTx | null> {
  return unseal<OAuthTx>((await cookies()).get(TX_COOKIE)?.value);
}

export async function clearTx(): Promise<void> {
  (await cookies()).delete(TX_COOKIE);
}

// ---------------------------------------------------------------------------
// Authenticated session
// ---------------------------------------------------------------------------

export async function setSession(session: Session): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, seal(session), {
    httpOnly: true,
    secure: SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function getSession(): Promise<Session | null> {
  return unseal<Session>((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
