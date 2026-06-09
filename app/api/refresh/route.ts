/**
 * POST /api/refresh — rotate the access/refresh tokens.
 *
 * Refreshing rotates the refresh token: the old one becomes invalid, so we
 * persist the new pair into the session. Also re-reads userinfo so allowed /
 * credits stay current; if access was revoked (allowed===false) we log out.
 */

import { NextResponse } from "next/server";
import { getUserInfo, refreshTokens } from "@/app/lib/oauth";
import { clearSession, getSession, setSession } from "@/app/lib/session";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  try {
    const tokens = await refreshTokens(session.refreshToken);
    const user = await getUserInfo(tokens.access_token);

    if (user.allowed !== true) {
      await clearSession();
      return NextResponse.json({ error: "access_revoked" }, { status: 403 });
    }

    await setSession({
      ...session,
      roles: user.roles,
      allowed: user.allowed,
      inGuild: user.in_guild,
      credits: user.credits,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token, // rotated — keep the new one.
      expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
    });

    return NextResponse.json({ ok: true, expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in });
  } catch {
    // A failed refresh usually means the refresh token is dead — force re-login.
    await clearSession();
    return NextResponse.json({ error: "refresh_failed" }, { status: 401 });
  }
}
