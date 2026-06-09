import { NextRequest, NextResponse } from "next/server";
import { fetchUserInfo, refreshTokens } from "@/lib/auth";
import { SESSION_COOKIE, getSessionById } from "@/lib/session";

/**
 * Force a refresh-token rotation and re-fetch userinfo. Demonstrates that the
 * refresh token rotates (old one invalidated) and that `allowed`/roles/credits
 * are re-evaluated live on every call.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const home = new URL("/", url.origin);
  const id = req.cookies.get(SESSION_COOKIE)?.value;
  const session = id ? getSessionById(id) : undefined;
  if (!session) {
    home.searchParams.set("error", "not_logged_in");
    return NextResponse.redirect(home);
  }

  try {
    const next = await refreshTokens(session.tokens.refresh_token);
    session.tokens = next;
    session.accessExpiresAt = Date.now() + next.expires_in * 1000;
    session.user = await fetchUserInfo(next.access_token);
    home.searchParams.set("refreshed", "1");
  } catch (e) {
    home.searchParams.set("error", "refresh_failed");
    home.searchParams.set(
      "error_description",
      e instanceof Error ? e.message : "Refresh failed — please log in again."
    );
  }
  return NextResponse.redirect(home);
}
