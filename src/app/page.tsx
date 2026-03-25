import Link from "next/link";

const TRUST_ITEMS = [
  "GitHub evidence collection",
  "Auditor-ready exports",
  "Shareable auditor view",
  "Automated compliance reminders",
];

const STEPS = [
  {
    number: "1",
    title: "Connect GitHub",
    description: "Link your GitHub organization in one click. ProofFlow reads access data — nothing is modified.",
  },
  {
    number: "2",
    title: "Collect and monitor evidence",
    description: "Automatically collect access reviews, track control coverage, and detect when evidence goes stale.",
  },
  {
    number: "3",
    title: "Export and share with auditors",
    description: "Generate PDF reports, evidence packs, and secure read-only links your auditors can review directly.",
  },
];

const FEATURES = [
  {
    title: "Audit readiness at a glance",
    description: "See whether you are ready, at risk, or blocked — with specific controls and next steps.",
  },
  {
    title: "Compliance coverage tracking",
    description: "Track SOC 2 controls with freshness thresholds. Know what is covered, stale, or missing.",
  },
  {
    title: "Evidence packs and PDF reports",
    description: "Download ZIP evidence packs or generate clean PDF audit reports for your auditors.",
  },
  {
    title: "Automated recurring reviews",
    description: "Schedule evidence collection so controls stay fresh without manual effort.",
  },
  {
    title: "Shareable auditor portal",
    description: "Generate secure, read-only links that let auditors review compliance status without logging in.",
  },
  {
    title: "Email notifications",
    description: "Get alerted when controls go stale or evidence is automatically refreshed.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-6">
        <span className="text-lg font-bold">ProofFlow</span>
        <div className="flex items-center gap-4">
          <Link href="/pricing" className="text-sm text-foreground/50 hover:text-foreground/70">
            Pricing
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
          >
            Dashboard
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center px-8 py-20 text-center">
        <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Stay audit-ready without chasing evidence by hand.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-foreground/60">
          ProofFlow automatically collects access review evidence, tracks control
          coverage, and generates auditor-ready reports for fast-moving teams.
        </p>
        <div className="mt-8 flex gap-4">
          <Link
            href="/dashboard"
            className="rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
          >
            Get started free
          </Link>
          <Link
            href="/pricing"
            className="rounded-lg border border-foreground/20 px-6 py-3 text-sm font-medium transition-colors hover:bg-foreground/5"
          >
            See pricing
          </Link>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-y border-foreground/5 px-8 py-6">
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm text-foreground/40">
          {TRUST_ITEMS.map((item) => (
            <div key={item} className="flex items-center gap-2">
              <span className="text-green-500">&#10003;</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="px-8 py-16">
        <h2 className="text-center text-2xl font-bold">How it works</h2>
        <div className="mt-10 grid gap-8 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.number} className="text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background">
                {step.number}
              </div>
              <h3 className="mt-4 text-sm font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-foreground/50">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What you get */}
      <section className="px-8 py-16">
        <h2 className="text-center text-2xl font-bold">What you get</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-lg border border-foreground/10 p-5"
            >
              <h3 className="text-sm font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-foreground/50">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Free vs Pro */}
      <section className="px-8 py-16">
        <h2 className="text-center text-2xl font-bold">Free vs Pro</h2>
        <p className="mt-2 text-center text-sm text-foreground/50">
          Start free. Upgrade when you need automation and auditor-facing features.
        </p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <div className="rounded-lg border border-foreground/10 p-6">
            <h3 className="font-bold">Free</h3>
            <p className="mt-1 text-xs text-foreground/40">Visibility and manual collection</p>
            <ul className="mt-4 space-y-2 text-sm text-foreground/60">
              <li className="flex items-center gap-2"><span className="text-green-500">&#10003;</span> GitHub integration</li>
              <li className="flex items-center gap-2"><span className="text-green-500">&#10003;</span> Compliance dashboard</li>
              <li className="flex items-center gap-2"><span className="text-green-500">&#10003;</span> Control coverage tracking</li>
              <li className="flex items-center gap-2"><span className="text-green-500">&#10003;</span> Manual evidence collection</li>
              <li className="flex items-center gap-2"><span className="text-green-500">&#10003;</span> Audit readiness status</li>
            </ul>
          </div>
          <div className="rounded-lg border-2 border-foreground p-6">
            <div className="flex items-center gap-2">
              <h3 className="font-bold">Pro</h3>
              <span className="rounded-full bg-foreground px-2 py-0.5 text-xs font-medium text-background">$49/mo</span>
            </div>
            <p className="mt-1 text-xs text-foreground/40">Automation, sharing, and exports</p>
            <ul className="mt-4 space-y-2 text-sm text-foreground/60">
              <li className="flex items-center gap-2"><span className="text-green-500">&#10003;</span> Everything in Free</li>
              <li className="flex items-center gap-2"><span className="text-green-500">&#10003;</span> Recurring evidence schedules</li>
              <li className="flex items-center gap-2"><span className="text-green-500">&#10003;</span> PDF audit reports</li>
              <li className="flex items-center gap-2"><span className="text-green-500">&#10003;</span> Evidence pack ZIP export</li>
              <li className="flex items-center gap-2"><span className="text-green-500">&#10003;</span> Shareable auditor links</li>
              <li className="flex items-center gap-2"><span className="text-green-500">&#10003;</span> Email notifications</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="flex flex-col items-center px-8 py-20 text-center">
        <h2 className="text-2xl font-bold">Ready to stop chasing evidence?</h2>
        <p className="mt-3 text-sm text-foreground/50">
          Start free. Upgrade when you need automation.
        </p>
        <div className="mt-6 flex gap-4">
          <Link
            href="/dashboard"
            className="rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
          >
            Get started free
          </Link>
          <Link
            href="/pricing"
            className="rounded-lg border border-foreground/20 px-6 py-3 text-sm font-medium transition-colors hover:bg-foreground/5"
          >
            See pricing
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-foreground/5 px-8 py-6 text-center text-xs text-foreground/30">
        ProofFlow — Compliance automation for fast-moving teams.
      </footer>
    </main>
  );
}
