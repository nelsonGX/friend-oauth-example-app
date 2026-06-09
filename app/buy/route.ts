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
  } catch {
    redirect("/?pay=error");
  }

  // Hand the user off to the pay server's hosted confirmation page.
  redirect(url);
}
