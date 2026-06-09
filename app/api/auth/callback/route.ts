import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, fetchUserInfo } from "@/lib/auth";
import { PKCE_COOKIE, SESSION_COOKIE, createSession } from "@/lib/session";

/**
 * OAuth callback. Verifies state against the cookie, exchanges the code for
 * tokens, fetches userinfo, and only creates a local session when the provider
 * reports `allowed === true`.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const params = url.searchParams;
  const home = new URL("/", url.origin);

  // Provider-reported error (e.g. user denied consent).
  const providerError = params.get("error");
  if (providerError) {
    home.searchParams.set("error", providerError);
    const desc = params.get("error_description");
    if (desc) home.searchParams.set("error_description", desc);
    return clearPkceAndRedirect(home);
  }

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) {
    home.searchParams.set("error", "invalid_request");
    home.searchParams.set("error_description", "Missing code or state.");
    return clearPkceAndRedirect(home);
  }

  // Verify state + recover the PKCE verifier from the cookie.
  const raw = req.cookies.get(PKCE_COOKIE)?.value;
  let stored: { verifier: string; state: string } | null = null;
  try {
    stored = raw ? JSON.parse(raw) : null;
  } catch {
    stored = null;
  }
  if (!stored || stored.state !== state) {
    home.searchParams.set("error", "state_mismatch");
    home.searchParams.set(
      "error_description",
      "State did not match — possible CSRF or an expired login attempt."
    );
    return clearPkceAndRedirect(home);
  }

  try {
    const tokens = await exchangeCode(code, stored.verifier);
    const user = await fetchUserInfo(tokens.access_token);

    if (user.allowed !== true) {
      home.searchParams.set("error", "access_denied");
      home.searchParams.set(
        "error_description",
        "Your account is authenticated but not allowed (not in the guild or missing the required role)."
      );
      return clearPkceAndRedirect(home);
    }

    const session = createSession(user.sub, user, tokens);
    const res = NextResponse.redirect(home);
    res.cookies.delete(PKCE_COOKIE);
    res.cookies.set(SESSION_COOKIE, session.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30d, matches refresh-token lifetime
    });
    return res;
  } catch (e) {
    home.searchParams.set("error", "exchange_failed");
    home.searchParams.set(
      "error_description",
      e instanceof Error ? e.message : "Token exchange failed."
    );
    return clearPkceAndRedirect(home);
  }
}

function clearPkceAndRedirect(to: URL): NextResponse {
  const res = NextResponse.redirect(to);
  res.cookies.delete(PKCE_COOKIE);
  return res;
}
