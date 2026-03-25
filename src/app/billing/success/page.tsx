import Link from "next/link";

export default function BillingSuccess() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="text-4xl">&#10003;</div>
      <h1 className="text-2xl font-bold">Upgrade successful</h1>
      <p className="text-sm text-foreground/50">
        Your workspace is now on the Pro plan. All premium features are unlocked.
      </p>
      <Link
        href="/dashboard"
        className="rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
      >
        Go to Dashboard
      </Link>
    </main>
  );
}
