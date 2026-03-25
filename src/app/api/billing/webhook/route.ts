import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import type Stripe from "stripe";

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const body = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (e) {
    console.error("Webhook signature verification failed:", e);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const workspaceId = session.metadata?.workspaceId;
        if (workspaceId && session.subscription) {
          await db.workspace.update({
            where: { id: workspaceId },
            data: {
              plan: "pro",
              stripeCustomerId: session.customer as string,
              stripeSubscriptionId: session.subscription as string,
              subscriptionStatus: "active",
            },
          });
          console.log(`[billing] Workspace ${workspaceId} upgraded to pro`);
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const workspace = await db.workspace.findFirst({
          where: { stripeSubscriptionId: sub.id },
        });
        if (workspace) {
          const active = sub.status === "active" || sub.status === "trialing";
          await db.workspace.update({
            where: { id: workspace.id },
            data: {
              plan: active ? "pro" : "free",
              subscriptionStatus: sub.status,
            },
          });
          console.log(`[billing] Subscription ${sub.id} status: ${sub.status}`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const workspace = await db.workspace.findFirst({
          where: { stripeSubscriptionId: sub.id },
        });
        if (workspace) {
          await db.workspace.update({
            where: { id: workspace.id },
            data: {
              plan: "free",
              subscriptionStatus: "canceled",
            },
          });
          console.log(`[billing] Workspace ${workspace.id} downgraded to free`);
        }
        break;
      }
    }
  } catch (e) {
    console.error("Webhook handler error:", e);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
