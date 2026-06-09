/**
 * GET /login — begin the OAuth 2.0 Authorization Code + PKCE flow.
 *
 * Generates a fresh PKCE pair + state, persists { codeVerifier, state } in the
 * session (httpOnly cookie), then redirects the browser to /oauth/authorize.
 */

import { redirect } from "next/navigation";
import {
  createCodeChallenge,
  createCodeVerifier,
  createState,
} from "@/app/lib/pkce";
import { buildAuthorizeUrl } from "@/app/lib/oauth";
import { setTx } from "@/app/lib/session";

export async function GET() {
  const codeVerifier = createCodeVerifier();
  const codeChallenge = createCodeChallenge(codeVerifier);
  const state = createState();

  // Persist the verifier + state so /callback can replay and verify them.
  await setTx({ codeVerifier, state });

  // redirect() throws, so it must be the last thing we do (outside try/catch).
  redirect(buildAuthorizeUrl({ state, codeChallenge }));
}
