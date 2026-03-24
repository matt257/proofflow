import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-5xl font-bold tracking-tight">ProofFlow</h1>
      <p className="mt-4 text-lg text-foreground/60">
        Automatically collect your audit evidence
      </p>
      <Link
        href="/dashboard"
        className="mt-8 rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
      >
        Go to Dashboard
      </Link>
    </main>
  );
}
