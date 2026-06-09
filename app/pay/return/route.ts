import { NextRequest, NextResponse } from "next/server";
import { verifyPayIntent } from "@/lib/auth";
import {
  SESSION_COOKIE,
  getSessionById,
  syncUserInfo,
} from "@/lib/session";

/**
 * Payment return URL (a registered redirect_uri). The provider sends the user
 * back with ?intent_id&ref&status&state, but status from the query is NOT
 * trusted — we re-verify server-side and only treat `paid === true` as success.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const home = new URL("/", url.origin);
  const intentId = url.searchParams.get("intent_id");
  const queryStatus = url.searchParams.get("status") ?? "unknown";

  if (!intentId) {
    home.searchParams.set("pay", "error");
    home.searchParams.set("pay_detail", "Missing intent_id on return.");
    return NextResponse.redirect(home);
  }

  try {
    const result = await verifyPayIntent(intentId);
    if (result.paid === true) {
      home.searchParams.set("pay", "paid");
      home.searchParams.set("pay_amount", String(result.amount));
      // Re-sync so the dashboard shows the new credit balance.
      const id = req.cookies.get(SESSION_COOKIE)?.value;
      const session = id ? getSessionById(id) : undefined;
      if (session) {
        try {
          await syncUserInfo(session);
        } catch {
          /* balance will update on next refresh */
        }
      }
    } else {
      home.searchParams.set("pay", result.status || queryStatus);
    }
  } catch (e) {
    home.searchParams.set("pay", "error");
    home.searchParams.set(
      "pay_detail",
      e instanceof Error ? e.message : "Verification failed."
    );
  }
  return NextResponse.redirect(home);
}
