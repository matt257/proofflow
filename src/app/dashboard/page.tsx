import { db } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const integration = await db.integration.findFirst({
    where: { provider: "github" },
    select: { metadata: true },
  });

  const meta = integration?.metadata as Record<string, string> | null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <Link href="/" className="text-sm text-foreground/40 hover:text-foreground/60">
        &larr; Home
      </Link>
      <h1 className="text-3xl font-bold">Dashboard</h1>

      {integration ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-foreground/10 p-6">
          <p className="text-sm font-medium text-green-600">
            GitHub connected
          </p>
          {meta?.githubLogin && (
            <p className="text-foreground/60">@{meta.githubLogin}</p>
          )}
          <a
            href="/api/github/connect"
            className="mt-2 text-xs text-foreground/40 hover:text-foreground/60"
          >
            Reconnect
          </a>
        </div>
      ) : (
        <a
          href="/api/github/connect"
          className="rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
        >
          Connect GitHub
        </a>
      )}
    </main>
  );
}
