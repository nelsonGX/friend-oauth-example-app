/**
 * GET /pay/callback — pay return URL (must be a registered redirect URI).
 *
 * The redirect carries ?intent_id&ref&status&state, but we DO NOT trust it.
 * We always re-verify server-side and grant value only when paid===true.
 */

import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { getUserInfo, verifyPayment } from "@/app/lib/oauth";
import { getSession, setSession } from "@/app/lib/session";

export async function GET(request: NextRequest) {
  const intentId = request.nextUrl.searchParams.get("intent_id");

  let target = "/?pay=error";

  try {
    if (!intentId) {
      target = "/?pay=error";
      throw new Done();
    }

    // Source of truth: verify with the pay server (never the redirect params).
    const result = await verifyPayment(intentId);

    if (result.paid === true) {
      // Grant value here. This example has no DB, so we just refresh the
      // user's credit balance into the session and show success.
      const session = await getSession();
      if (session) {
        try {
          const user = await getUserInfo(session.accessToken);
          await setSession({ ...session, credits: user.credits });
        } catch {
          /* non-fatal: payment is confirmed even if the balance refresh fails */
        }
      }
      target = `/?pay=completed&amount=${result.amount}`;
    } else {
      // status ∈ { cancelled, insufficient_funds, access_denied } (or pending).
      target = `/?pay=${encodeURIComponent(result.status)}`;
    }
  } catch (e) {
    if (!(e instanceof Done)) {
      console.error("[pay/callback] verify failed:", e);
      const msg = e instanceof Error ? e.message : "pay_error";
      target = `/?pay=error&reason=${encodeURIComponent(msg.slice(0, 200))}`;
    }
  }

  redirect(target);
}

class Done extends Error {}
