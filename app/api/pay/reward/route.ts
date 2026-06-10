import { NextRequest, NextResponse } from "next/server";
import { reversePay } from "@/lib/auth";
import { SESSION_COOKIE, getSessionById, syncUserInfo } from "@/lib/session";

/**
 * Reward the logged-in user with credits paid FROM this app's balance, via the
 * provider's reverse-pay endpoint. This is the inverse of /api/pay/start: there
 * the user pays the app, here the app pays the user.
 *
 * Idempotent on `ref` — an accidental double-submit is de-duped by the provider
 * (returns duplicate: true) rather than paying twice. The app's balance must be
 * funded (dashboard → Manage → Funding) or the provider returns 402
 * insufficient_funds.
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

  const form = await req.formData();
  const amount = Math.max(1, parseInt(String(form.get("amount") ?? "5"), 10) || 5);

  try {
    // Stable ref per (user, amount, session) so re-submitting the same reward
    // is de-duped instead of paying twice. Use a fresh session to pay again.
    const ref = `reward-${session.sub}-${amount}-${session.createdAt}`;
    const payout = await reversePay({
      userId: session.sub,
      amount,
      ref,
      description: `Showcase reward of ${amount} credits`,
    });
    home.searchParams.set("reward", payout.duplicate ? "duplicate" : "paid");
    home.searchParams.set("reward_amount", String(payout.amount));
    home.searchParams.set("reward_balance", String(payout.app_balance));
    // Re-sync so the dashboard reflects the user's new credit balance.
    try {
      await syncUserInfo(session);
    } catch {
      /* balance will update on next refresh */
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Reward failed.";
    home.searchParams.set(
      "reward",
      msg.includes("insufficient_funds") ? "insufficient_funds" : "error"
    );
    home.searchParams.set("reward_detail", msg);
  }
  return NextResponse.redirect(home);
}
