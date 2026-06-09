/**
 * Server-side configuration for the Friend Group Auth integration.
 *
 * This module is imported ONLY by Route Handlers and Server Components, never
 * by Client Components, so none of these values are bundled for the browser.
 * In particular CLIENT_SECRET and SESSION_SECRET must stay server-only — they
 * have no `NEXT_PUBLIC_` prefix, so Next.js will not expose them to the client.
 */

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const config = {
  // Public-ish (these are "mine" per the spec; safe to default).
  authBaseUrl: process.env.AUTH_BASE_URL ?? "http://localhost:3000",
  clientId: process.env.FGC_CLIENT_ID ?? "fgc_gX-ks_JrUNc",

  // The login callback. Must match a registered redirect URI EXACTLY.
  redirectUri:
    process.env.FGC_REDIRECT_URI ?? "http://localhost:3330/callback",

  // The pay return URL. Must also be a registered redirect URI.
  payRedirectUri:
    process.env.FGC_PAY_REDIRECT_URI ?? "http://localhost:3330/pay/callback",

  // Server-to-server secret — NEVER sent to the browser.
  get clientSecret(): string {
    return required("FGC_CLIENT_SECRET");
  },

  // Used to HMAC-sign our own session cookies. NEVER sent to the browser.
  get sessionSecret(): string {
    return required("SESSION_SECRET");
  },
} as const;

/** Endpoints, derived from authBaseUrl so we never hand-type a URL twice. */
export const endpoints = {
  authorize: `${config.authBaseUrl}/oauth/authorize`,
  token: `${config.authBaseUrl}/api/oauth/token`,
  userinfo: `${config.authBaseUrl}/api/oauth/userinfo`,
  revoke: `${config.authBaseUrl}/api/oauth/revoke`,
  payIntent: `${config.authBaseUrl}/api/pay/intent`,
  payVerify: `${config.authBaseUrl}/api/pay/verify`,
} as const;

/** The scopes this app is allowed to request. */
export const SCOPES = "identify roles" as const;
