import { NextRequest, NextResponse } from "next/server";
import { createPayIntent } from "@/lib/auth";
import { SESSION_COOKIE, getSessionById } from "@/lib/session";

/**
 * Create a payment intent for a fixed showcase amount and redirect the user to
 * the provider's confirmation page. The `ref` is our idempotency key.
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
    // Fresh ref per attempt so a changed amount never collides (same ref +
    // different amount → 409). Encodes who/what for our own bookkeeping.
    const ref = `showcase-${session.sub}-${session.tokens.access_token.slice(-6)}-${amount}-${session.createdAt}`;
    const intent = await createPayIntent({
      amount,
      ref,
      description: `Showcase top-up of ${amount} credits`,
    });
    return NextResponse.redirect(intent.url);
  } catch (e) {
    home.searchParams.set("error", "pay_intent_failed");
    home.searchParams.set(
      "error_description",
      e instanceof Error ? e.message : "Could not create payment intent."
    );
    return NextResponse.redirect(home);
  }
}
