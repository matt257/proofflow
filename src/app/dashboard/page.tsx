import { db } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Integration = { metadata: unknown } | null;

async function getGitHubIntegration(): Promise<
  { integration: Integration; schemaReady: true } | { integration: null; schemaReady: false }
> {
  try {
    const integration = await db.integration.findFirst({
      where: { provider: "github" },
      select: { metadata: true },
    });
    return { integration, schemaReady: true };
  } catch (e: unknown) {
    // Prisma P2021: "The table `public.X` does not exist in the current database."
    const isPrismaTableMissing =
      e != null &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code: string }).code === "P2021";
    if (isPrismaTableMissing) {
      return { integration: null, schemaReady: false };
    }
    throw e;
  }
}

export default async function Dashboard() {
  const { integration, schemaReady } = await getGitHubIntegration();
  const meta = integration?.metadata as Record<string, string> | null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <Link href="/" className="text-sm text-foreground/40 hover:text-foreground/60">
        &larr; Home
      </Link>
      <h1 className="text-3xl font-bold">Dashboard</h1>

      {!schemaReady ? (
        <div className="rounded-lg border border-yellow-400/30 bg-yellow-50 px-6 py-4 text-center dark:bg-yellow-950/20">
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            Database schema is not initialized for this environment yet.
          </p>
          <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
            Run <code className="font-mono">npx prisma db push</code> to set up tables.
          </p>
        </div>
      ) : integration ? (
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
