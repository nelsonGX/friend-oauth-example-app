/**
 * POST /logout — revoke tokens server-side, then clear the local session.
 *
 * POST (not GET) so a stray link/prefetch can't log the user out; the home page
 * submits this via a small form.
 */

import { redirect } from "next/navigation";
import { revokeToken } from "@/app/lib/oauth";
import { clearSession, getSession } from "@/app/lib/session";

export async function POST() {
  const session = await getSession();

  if (session) {
    // Best-effort revoke of both tokens (server-to-server, with client_secret).
    await Promise.all([
      revokeToken(session.accessToken),
      revokeToken(session.refreshToken),
    ]);
  }

  await clearSession();
  redirect("/?login=logged_out");
}
