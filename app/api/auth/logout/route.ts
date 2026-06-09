import { NextRequest, NextResponse } from "next/server";
import { revokeToken } from "@/lib/auth";
import {
  SESSION_COOKIE,
  destroySession,
  getSessionById,
} from "@/lib/session";

/** Log out: revoke the refresh token at the provider and drop the local session. */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const id = req.cookies.get(SESSION_COOKIE)?.value;
  if (id) {
    const session = getSessionById(id);
    if (session) {
      await revokeToken(session.tokens.refresh_token);
      destroySession(id);
    }
  }
  const res = NextResponse.redirect(new URL("/", url.origin));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
