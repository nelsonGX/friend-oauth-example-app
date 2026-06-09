/**
 * GET /buy — create a payment intent (server-side) and redirect to its pay URL.
 *
 * The amount is fixed here on the server so the user can never change it. `ref`
 * is a unique idempotency key for this charge; the pay server is idempotent on
 * (client, ref), so retrying with the same ref returns the same intent.
 */

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createPayIntent } from "@/app/lib/oauth";
import { getSession } from "@/app/lib/session";

// What this app sells. In a real app this comes from a product/cart lookup.
const PRODUCT = { amount: 100, description: "Example top-up (100 credits)" };

export async function GET() {
  const session = await getSession();
  if (!session) {
    redirect("/?login=required");
  }

  let url: string;
  try {
    const intent = await createPayIntent({
      amount: PRODUCT.amount,
      ref: randomUUID(), // idempotency key for this charge attempt.
      description: PRODUCT.description,
    });
    url = intent.url;
  } catch (e) {
    // Common cause: FGC_PAY_REDIRECT_URI is not a registered redirect URI.
    console.error("[buy] create intent failed:", e);
    const msg = e instanceof Error ? e.message : "pay_error";
    redirect(`/?pay=error&reason=${encodeURIComponent(msg.slice(0, 200))}`);
  }

  // Hand the user off to the pay server's hosted confirmation page.
  redirect(url);
}
