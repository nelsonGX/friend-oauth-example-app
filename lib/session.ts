import crypto from "node:crypto";
import { cookies } from "next/headers";
import {
  fetchUserInfo,
  refreshTokens,
  type TokenResponse,
  type UserInfo,
} from "./auth";

/**
 * Minimal server-side session store. For a local showcase we keep sessions in
 * a process-memory Map keyed by a random id held in an httpOnly cookie. This is
 * NOT production-grade (it does not survive a dev-server restart and won't work
 * across multiple instances) — swap in Redis/db for real use.
 */

export const SESSION_COOKIE = "fgc_session";
export const PKCE_COOKIE = "fgc_pkce";

export type Session = {
  id: string;
  sub: string;
  user: UserInfo;
  tokens: TokenResponse;
  /** epoch ms when the access token expires */
  accessExpiresAt: number;
  createdAt: number;
};

// Survive HMR in dev by stashing the Map on globalThis.
const g = globalThis as unknown as { __fgcSessions?: Map<string, Session> };
const store: Map<string, Session> = (g.__fgcSessions ??= new Map());

export function createSession(
  sub: string,
  user: UserInfo,
  tokens: TokenResponse
): Session {
  const id = crypto.randomBytes(24).toString("base64url");
  const session: Session = {
    id,
    sub,
    user,
    tokens,
    accessExpiresAt: Date.now() + tokens.expires_in * 1000,
    createdAt: Date.now(),
  };
  store.set(id, session);
  return session;
}

export function getSessionById(id: string): Session | undefined {
  return store.get(id);
}

export function destroySession(id: string): void {
  store.delete(id);
}

/** Read the current session from the request cookies, if any. */
export async function getCurrentSession(): Promise<Session | undefined> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  return id ? store.get(id) : undefined;
}

/**
 * Return a valid access token for the session, transparently refreshing (and
 * rotating the refresh token) if the current one is within 60s of expiry.
 */
export async function getFreshAccessToken(session: Session): Promise<string> {
  if (Date.now() < session.accessExpiresAt - 60_000) {
    return session.tokens.access_token;
  }
  const next = await refreshTokens(session.tokens.refresh_token);
  session.tokens = next;
  session.accessExpiresAt = Date.now() + next.expires_in * 1000;
  return next.access_token;
}

/** Refresh userinfo from the provider (re-checks `allowed`, role/credit changes). */
export async function syncUserInfo(session: Session): Promise<UserInfo> {
  const token = await getFreshAccessToken(session);
  const user = await fetchUserInfo(token);
  session.user = user;
  return user;
}
