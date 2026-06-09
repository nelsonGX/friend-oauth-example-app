/**
 * GET /callback — OAuth redirect target (REDIRECT_URI).
 *
 * Verifies state, exchanges the code (server-side, with client_secret +
 * code_verifier), calls userinfo, enforces allowed===true, and creates a local
 * session. On any failure we redirect home with ?login=<reason> so the page can
 * show what happened.
 */

import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { exchangeCode, getUserInfo } from "@/app/lib/oauth";
import {
  clearSession,
  clearTx,
  getTx,
  setSession,
  type Session,
} from "@/app/lib/session";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  // Resolve where to send the browser, then redirect once at the very end
  // (redirect() throws, so it must live outside any try/catch).
  let target = "/?login=success";

  try {
    const tx = await getTx();
    await clearTx(); // single-use: drop the transaction regardless of outcome.

    // The IdP may report an error instead of a code.
    const error = params.get("error");
    if (error) {
      const desc = params.get("error_description") ?? "";
      target = `/?login=error&reason=${encodeURIComponent(`${error}: ${desc}`.trim())}`;
      throw new RedirectSignal();
    }

    const code = params.get("code");
    const state = params.get("state");

    // CSRF: the returned state must match the one we stored.
    if (!tx || !state || state !== tx.state) {
      target = "/?login=error&reason=state_mismatch";
      throw new RedirectSignal();
    }
    if (!code) {
      target = "/?login=error&reason=missing_code";
      throw new RedirectSignal();
    }

    // Server-to-server: exchange the code (PKCE verifier proves it's us).
    const tokens = await exchangeCode({ code, codeVerifier: tx.codeVerifier });

    // Who is this?
    const user = await getUserInfo(tokens.access_token);

    // Gate: only members with the required role are allowed in.
    if (user.allowed !== true) {
      await clearSession();
      target = "/?login=denied";
      throw new RedirectSignal();
    }

    const session: Session = {
      discordId: user.discord_id,
      username: user.username,
      globalName: user.global_name,
      avatar: user.avatar,
      roles: user.roles,
      allowed: user.allowed,
      inGuild: user.in_guild,
      credits: user.credits,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
    };
    await setSession(session);
  } catch (e) {
    // RedirectSignal is our own control-flow marker; anything else is a real
    // failure (network, bad token response, etc.).
    if (!(e instanceof RedirectSignal)) {
      // Surface the upstream reason in the server log to make debugging easy.
      // A 401 here almost always means FGC_CLIENT_SECRET is wrong/unset.
      console.error("[callback] login failed:", e);
      const msg = e instanceof Error ? e.message : "exchange_failed";
      target = `/?login=error&reason=${encodeURIComponent(msg.slice(0, 200))}`;
    }
  }

  redirect(target);
}

/** Internal marker to break out of the try block toward a chosen redirect. */
class RedirectSignal extends Error {}
