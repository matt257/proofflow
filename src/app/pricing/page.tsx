import Link from "next/link";
import { getWorkspacePlan } from "@/lib/plan";

export const dynamic = "force-dynamic";

const FREE_FEATURES = [
  "1 workspace",
  "GitHub integration",
  "Basic compliance dashboard",
  "Compliance coverage tracking",
  "Manual access review collection",
];

const PRO_FEATURES = [
  "Everything in Free",
  "PDF audit reports",
  "Evidence pack ZIP export",
  "Shareable auditor links",
  "Recurring schedules",
  "Email notifications",
  "Export history",
];

export default async function PricingPage() {
  const currentPlan = await getWorkspacePlan();
  const stripeConfigured = !!process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_PRO;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          className="text-sm text-foreground/40 hover:text-foreground/60"
        >
          &larr; Dashboard
        </Link>
        <h1 className="text-2xl font-bold">Pricing</h1>
        <div />
      </div>

      <p className="text-center text-sm text-foreground/50">
        Simple pricing for compliance automation.
      </p>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Free */}
        <div className="rounded-lg border border-foreground/10 p-6">
          <h2 className="text-lg font-bold">Free</h2>
          <p className="mt-1 text-3xl font-bold">$0</p>
          <p className="text-xs text-foreground/40">forever</p>
          <ul className="mt-4 space-y-2 text-sm text-foreground/60">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2">
                <span className="text-green-500">&#10003;</span> {f}
              </li>
            ))}
          </ul>
          <div className="mt-6">
            {currentPlan === "free" ? (
              <span className="block rounded-lg border border-foreground/20 px-4 py-2 text-center text-sm font-medium text-foreground/40">
                Current plan
              </span>
            ) : (
              <Link
                href="/dashboard"
                className="block rounded-lg border border-foreground/20 px-4 py-2 text-center text-sm font-medium transition-colors hover:bg-foreground/5"
              >
                Go to dashboard
              </Link>
            )}
          </div>
        </div>

        {/* Pro */}
        <div className="rounded-lg border-2 border-foreground p-6">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">Pro</h2>
            <span className="rounded-full bg-foreground px-2 py-0.5 text-xs font-medium text-background">
              Recommended
            </span>
          </div>
          <p className="mt-1 text-3xl font-bold">$49</p>
          <p className="text-xs text-foreground/40">per month</p>
          <ul className="mt-4 space-y-2 text-sm text-foreground/60">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2">
                <span className="text-green-500">&#10003;</span> {f}
              </li>
            ))}
          </ul>
          <div className="mt-6">
            {currentPlan === "pro" ? (
              <span className="block rounded-lg border border-foreground/20 px-4 py-2 text-center text-sm font-medium text-foreground/40">
                Current plan
              </span>
            ) : stripeConfigured ? (
              <form action="/api/billing/checkout" method="POST">
                <button
                  type="submit"
                  className="w-full rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
                >
                  Upgrade to Pro
                </button>
              </form>
            ) : (
              <span className="block rounded-lg border border-dashed border-foreground/20 px-4 py-2 text-center text-xs text-foreground/30">
                Stripe not configured
              </span>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
