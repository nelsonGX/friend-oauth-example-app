import crypto from "node:crypto";

/**
 * Friend Group Auth integration helpers (server-side only).
 *
 * Endpoints are auto-discovered from the RFC 8414 metadata document so this
 * file never hardcodes paths beyond the discovery URL. Credentials come from
 * env (written by the device-flow registration); the client secret never
 * leaves the server.
 */

export const AUTH_BASE_URL = process.env.AUTH_BASE_URL ?? "http://localhost:3000";
export const CLIENT_ID = process.env.AUTH_CLIENT_ID ?? "";
export const CLIENT_SECRET = process.env.AUTH_CLIENT_SECRET ?? "";
export const REDIRECT_URI =
  process.env.AUTH_REDIRECT_URI ?? "http://localhost:3330/api/auth/callback";
export const PAY_RETURN_URI =
  process.env.AUTH_PAY_RETURN_URI ?? "http://localhost:3330/pay/return";

/**
 * Scopes to request on login. Must be exactly what the app was granted at
 * registration — the provider rejects unknown scopes with `invalid_scope`
 * (no silent down-scoping), so this is set from the registration response.
 */
export const REQUESTED_SCOPES =
  process.env.AUTH_SCOPES ?? "identify roles credits";

// ---------------------------------------------------------------------------
// Discovery (RFC 8414) — fetched once per process and cached.
// ---------------------------------------------------------------------------

export type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  revocation_endpoint: string;
  scopes_supported: string[];
  code_challenge_methods_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  payment_intent_endpoint?: string;
  payment_confirmation_endpoint?: string;
  payment_verify_endpoint?: string;
  [k: string]: unknown;
};

let discoveryCache: Discovery | null = null;

export async function getDiscovery(): Promise<Discovery> {
  if (discoveryCache) return discoveryCache;
  const res = await fetch(
    `${AUTH_BASE_URL}/.well-known/oauth-authorization-server`,
    { cache: "no-store" }
  );
  if (!res.ok) {
    throw new Error(`Discovery failed: ${res.status} ${await res.text()}`);
  }
  discoveryCache = (await res.json()) as Discovery;
  return discoveryCache;
}

// ---------------------------------------------------------------------------
// PKCE + state
// ---------------------------------------------------------------------------

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function createPkce() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(
    crypto.createHash("sha256").update(verifier).digest()
  );
  const state = base64url(crypto.randomBytes(16));
  return { verifier, challenge, state };
}

// ---------------------------------------------------------------------------
// Token + userinfo shapes
// ---------------------------------------------------------------------------

export type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
};

export type UserInfo = {
  sub: string;
  id: string;
  username?: string;
  global_name?: string | null;
  avatar?: string | null;
  discord_id?: string;
  roles?: string[];
  allowed?: boolean;
  in_guild?: boolean;
  credits?: number;
};

function clientAuthBody() {
  return { client_id: CLIENT_ID, client_secret: CLIENT_SECRET };
}

/** Exchange an authorization code for tokens (form-encoded, client_secret_post). */
export async function exchangeCode(
  code: string,
  verifier: string
): Promise<TokenResponse> {
  const { token_endpoint } = await getDiscovery();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
    ...clientAuthBody(),
  });
  const res = await fetch(token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`token exchange ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as TokenResponse;
}

/** Rotate tokens with a refresh token. The new refresh_token replaces the old. */
export async function refreshTokens(
  refreshToken: string
): Promise<TokenResponse> {
  const { token_endpoint } = await getDiscovery();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    ...clientAuthBody(),
  });
  const res = await fetch(token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`refresh ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function fetchUserInfo(accessToken: string): Promise<UserInfo> {
  const { userinfo_endpoint } = await getDiscovery();
  const res = await fetch(userinfo_endpoint, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`userinfo ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as UserInfo;
}

export async function revokeToken(token: string): Promise<void> {
  const { revocation_endpoint } = await getDiscovery();
  const body = new URLSearchParams({ token, ...clientAuthBody() });
  await fetch(revocation_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  }).catch(() => {
    /* best-effort */
  });
}

// ---------------------------------------------------------------------------
// Payments (credits)
// ---------------------------------------------------------------------------

export type PayIntent = {
  intent_id: string;
  url: string;
  amount: number;
  status: string;
  expires_at: string;
};

export type PayVerify = {
  intent_id: string;
  status: string;
  amount: number;
  ref: string;
  description?: string;
  user_id: string;
  paid: boolean;
};

export async function createPayIntent(opts: {
  amount: number;
  ref: string;
  description?: string;
  state?: string;
}): Promise<PayIntent> {
  const { payment_intent_endpoint } = await getDiscovery();
  if (!payment_intent_endpoint) throw new Error("payments not supported");
  const body = new URLSearchParams({
    ...clientAuthBody(),
    amount: String(opts.amount),
    ref: opts.ref,
    redirect_uri: PAY_RETURN_URI,
  });
  if (opts.description) body.set("description", opts.description);
  if (opts.state) body.set("state", opts.state);
  const res = await fetch(payment_intent_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`pay intent ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as PayIntent;
}

export async function verifyPayIntent(intentId: string): Promise<PayVerify> {
  const { payment_verify_endpoint } = await getDiscovery();
  if (!payment_verify_endpoint) throw new Error("payments not supported");
  const body = new URLSearchParams({
    ...clientAuthBody(),
    intent_id: intentId,
  });
  const res = await fetch(payment_verify_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`pay verify ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as PayVerify;
}
