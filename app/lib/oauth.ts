/**
 * Server-to-server calls to the Friend Group Auth server.
 *
 * Everything here runs on the server. CLIENT_SECRET is attached only to these
 * POST bodies and is never returned to the browser. All token/pay POSTs are
 * `application/x-www-form-urlencoded`, exactly as the spec requires.
 */

import { config, endpoints, SCOPES } from "./config";

// ---------------------------------------------------------------------------
// Wire types (what the auth server returns)
// ---------------------------------------------------------------------------

export type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number; // seconds; access = 3600
  refresh_token: string;
  scope: string;
};

export type UserInfo = {
  sub: string;
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
  discord_id: string;
  roles: string[];
  allowed: boolean;
  in_guild: boolean;
  credits?: number;
};

export type PayIntent = {
  intent_id: string;
  url: string;
  amount: number;
  status: "pending";
  expires_at: string;
};

export type PayVerification = {
  intent_id: string;
  status: "completed" | "cancelled" | "insufficient_funds" | "access_denied";
  amount: number;
  ref: string;
  description?: string;
  user_id: string;
  paid: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function postForm<T>(url: string, body: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`POST ${url} failed: ${res.status} ${res.statusText} ${detail}`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Authorization URL
// ---------------------------------------------------------------------------

/** Build the /oauth/authorize URL for the PKCE authorization request. */
export function buildAuthorizeUrl(params: {
  state: string;
  codeChallenge: string;
}): string {
  const qs = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: SCOPES,
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
  });
  // Match the spec literally (scope=identify%20roles). URLSearchParams encodes
  // a space as "+"; rewrite it to %20. No other value contains a "+" (state and
  // the challenge are base64url, the rest are unreserved), so this is safe.
  return `${endpoints.authorize}?${qs.toString().replace(/\+/g, "%20")}`;
}

// ---------------------------------------------------------------------------
// Token endpoint
// ---------------------------------------------------------------------------

/** Exchange an authorization code for tokens (PKCE: includes code_verifier). */
export function exchangeCode(params: {
  code: string;
  codeVerifier: string;
}): Promise<TokenResponse> {
  return postForm<TokenResponse>(endpoints.token, {
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: config.redirectUri,
    code_verifier: params.codeVerifier,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
}

/**
 * Refresh tokens. The refresh token rotates: the old one becomes invalid and
 * the response carries a new refresh_token that callers must persist.
 */
export function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  return postForm<TokenResponse>(endpoints.token, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
}

/** Revoke a token (used on logout). Best-effort: ignore the response body. */
export async function revokeToken(token: string): Promise<void> {
  await fetch(endpoints.revoke, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      token,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }).toString(),
    cache: "no-store",
  }).catch(() => {
    /* logout should succeed locally even if revoke is unreachable */
  });
}

// ---------------------------------------------------------------------------
// Userinfo
// ---------------------------------------------------------------------------

export async function getUserInfo(accessToken: string): Promise<UserInfo> {
  const res = await fetch(endpoints.userinfo, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`userinfo failed: ${res.status} ${res.statusText} ${detail}`);
  }
  return (await res.json()) as UserInfo;
}

// ---------------------------------------------------------------------------
// Pay
// ---------------------------------------------------------------------------

/**
 * Create a payment intent server-side. The amount is decided here so the user
 * cannot tamper with it. Idempotent on (client, ref).
 */
export function createPayIntent(params: {
  amount: number;
  ref: string;
  description?: string;
  state?: string;
}): Promise<PayIntent> {
  const body: Record<string, string> = {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    amount: String(params.amount),
    ref: params.ref,
    redirect_uri: config.payRedirectUri,
  };
  if (params.description) body.description = params.description;
  if (params.state) body.state = params.state;
  return postForm<PayIntent>(endpoints.payIntent, body);
}

/** Verify a payment server-side. Grant value only when `paid === true`. */
export function verifyPayment(intentId: string): Promise<PayVerification> {
  return postForm<PayVerification>(endpoints.payVerify, {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    intent_id: intentId,
  });
}
