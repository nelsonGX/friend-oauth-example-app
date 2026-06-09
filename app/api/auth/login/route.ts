import { NextResponse } from "next/server";
import {
  CLIENT_ID,
  REDIRECT_URI,
  REQUESTED_SCOPES,
  createPkce,
  getDiscovery,
} from "@/lib/auth";
import { PKCE_COOKIE } from "@/lib/session";

/**
 * Begin the Authorization Code + PKCE flow.
 * Generates a fresh verifier/challenge/state, stashes verifier+state in a
 * short-lived httpOnly cookie, and redirects the browser to the provider.
 */
export async function GET() {
  const { authorization_endpoint } = await getDiscovery();
  const { verifier, challenge, state } = createPkce();

  const authorize = new URL(authorization_endpoint);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: REQUESTED_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();

  const res = NextResponse.redirect(authorize.toString());
  res.cookies.set(PKCE_COOKIE, JSON.stringify({ verifier, state }), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
