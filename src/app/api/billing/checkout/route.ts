import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

export async function POST() {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const priceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_PRO;
  if (!priceId) {
    return NextResponse.json({ error: "Price ID not configured" }, { status: 500 });
  }

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  try {
    let workspace = await db.workspace.findFirst();
    if (!workspace) {
      workspace = await db.workspace.create({
        data: { name: "Default Workspace" },
      });
    }

    // Reuse existing Stripe customer if present
    let customerId = workspace.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { workspaceId: workspace.id },
      });
      customerId = customer.id;
      await db.workspace.update({
        where: { id: workspace.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/billing/success`,
      cancel_url: `${appUrl}/pricing`,
      metadata: { workspaceId: workspace.id },
    });

    return NextResponse.redirect(session.url!, 303);
  } catch (e) {
    console.error("Checkout creation failed:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
