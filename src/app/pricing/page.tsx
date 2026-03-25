import Link from "next/link";
import { getWorkspacePlan } from "@/lib/plan";

export const dynamic = "force-dynamic";

const FREE_FEATURES = [
  "1 workspace",
  "GitHub integration",
  "Compliance dashboard and audit readiness",
  "Control coverage tracking with freshness",
  "Manual access review collection",
];

const PRO_FEATURES = [
  "Everything in Free",
  "PDF audit reports",
  "Evidence pack ZIP export",
  "Shareable auditor links",
  "Recurring automated schedules",
  "Email notifications for stale controls",
  "Full export history",
];

const FAQ = [
  {
    q: "Do I need to pay to try ProofFlow?",
    a: "No. The Free plan gives you full access to the compliance dashboard, control coverage, and manual evidence collection. No credit card required.",
  },
  {
    q: "What happens if I stay on Free?",
    a: "You keep visibility into your compliance posture and can collect evidence manually. Pro features like automation, PDF reports, and auditor sharing stay locked.",
  },
  {
    q: "Can I upgrade later?",
    a: "Yes. Upgrade anytime from the dashboard or this page. Your existing data carries over — nothing is lost.",
  },
  {
    q: "What features are only in Pro?",
    a: "PDF audit reports, evidence pack exports, shareable auditor links, recurring schedules, email notifications, and export history are all Pro-only.",
  },
];

export default async function PricingPage() {
  const currentPlan = await getWorkspacePlan();
  const stripeConfigured = !!process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_PRO;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-12 p-8">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="text-sm text-foreground/40 hover:text-foreground/60"
        >
          &larr; Home
        </Link>
        <h1 className="text-2xl font-bold">Pricing</h1>
        <Link
          href="/dashboard"
          className="text-sm text-foreground/40 hover:text-foreground/60"
        >
          Dashboard &rarr;
        </Link>
      </div>

      <div className="text-center">
        <h2 className="text-lg font-semibold">Simple, transparent pricing.</h2>
        <p className="mt-1 text-sm text-foreground/50">
          Start free and upgrade when you need automation and auditor-facing features.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Free */}
        <div className="rounded-lg border border-foreground/10 p-6">
          <h2 className="text-lg font-bold">Free</h2>
          <p className="mt-1 text-3xl font-bold">$0</p>
          <p className="text-xs text-foreground/40">forever — no credit card</p>
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
              <Link
                href="/dashboard"
                className="block rounded-lg border border-dashed border-foreground/20 px-4 py-2 text-center text-xs text-foreground/30"
              >
                Stripe not configured — use dashboard
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* FAQ */}
      <section>
        <h2 className="text-center text-lg font-semibold">Frequently asked questions</h2>
        <div className="mt-6 divide-y divide-foreground/10">
          {FAQ.map((item) => (
            <div key={item.q} className="py-4">
              <h3 className="text-sm font-semibold">{item.q}</h3>
              <p className="mt-1 text-sm text-foreground/50">{item.a}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
