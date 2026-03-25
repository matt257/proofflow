import { db } from "@/lib/db";
import { fetchGitHubAccessReview } from "@/lib/github-api";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Integration = { id: string; workspaceId: string; accessToken: string | null; metadata: unknown } | null;
type Snapshot = { id: string; status: string; type: string; collectedAt: Date; data: unknown } | null;

function isPrismaTableMissing(e: unknown): boolean {
  return (
    e != null &&
    typeof e === "object" &&
    "code" in e &&
    (e as { code: string }).code === "P2021"
  );
}

async function getDashboardData(): Promise<
  | { schemaReady: false; integration: null; latestSnapshot: null }
  | { schemaReady: true; integration: Integration; latestSnapshot: Snapshot }
> {
  try {
    const integration = await db.integration.findFirst({
      where: { provider: "github" },
      select: { id: true, workspaceId: true, accessToken: true, metadata: true },
    });

    let latestSnapshot: Snapshot = null;
    if (integration) {
      try {
        latestSnapshot = await db.evidenceSnapshot.findFirst({
          where: { integrationId: integration.id, type: "github_access_review" },
          orderBy: { collectedAt: "desc" },
          select: { id: true, status: true, type: true, collectedAt: true, data: true },
        });
      } catch (e) {
        if (!isPrismaTableMissing(e)) throw e;
      }
    }

    return { schemaReady: true, integration, latestSnapshot };
  } catch (e: unknown) {
    if (isPrismaTableMissing(e)) {
      return { schemaReady: false, integration: null, latestSnapshot: null };
    }
    throw e;
  }
}

async function collectEvidence() {
  "use server";

  const integration = await db.integration.findFirst({
    where: { provider: "github" },
    select: { id: true, workspaceId: true, accessToken: true },
  });

  if (!integration?.accessToken) {
    redirect("/dashboard");
  }

  try {
    const { user, orgs } = await fetchGitHubAccessReview(integration.accessToken);
    await db.evidenceSnapshot.create({
      data: {
        workspaceId: integration.workspaceId,
        integrationId: integration.id,
        type: "github_access_review",
        status: "succeeded",
        data: { user, orgs },
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    await db.evidenceSnapshot.create({
      data: {
        workspaceId: integration.workspaceId,
        integrationId: integration.id,
        type: "github_access_review",
        status: "failed",
        data: { error: message },
      },
    });
  }

  redirect("/dashboard");
}

export default async function Dashboard() {
  const { schemaReady, integration, latestSnapshot } = await getDashboardData();
  const meta = integration?.metadata as Record<string, string> | null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
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
      ) : !integration ? (
        <a
          href="/api/github/connect"
          className="rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
        >
          Connect GitHub
        </a>
      ) : (
        <>
          {/* GitHub connection status */}
          <div className="flex flex-col items-center gap-2 rounded-lg border border-foreground/10 p-6">
            <p className="text-sm font-medium text-green-600">GitHub connected</p>
            {meta?.githubLogin && (
              <p className="text-foreground/60">@{meta.githubLogin}</p>
            )}
            <a
              href="/api/github/connect"
              className="mt-1 text-xs text-foreground/40 hover:text-foreground/60"
            >
              Reconnect
            </a>
          </div>

          {/* Evidence collection */}
          <div className="flex flex-col items-center gap-4 rounded-lg border border-foreground/10 p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold">Evidence Collection</h2>

            <form action={collectEvidence}>
              <button
                type="submit"
                className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
              >
                Collect GitHub Access Review
              </button>
            </form>

            {latestSnapshot ? (
              <SnapshotCard snapshot={latestSnapshot} />
            ) : (
              <p className="text-sm text-foreground/40">
                No snapshots collected yet.
              </p>
            )}
          </div>
        </>
      )}
    </main>
  );
}

function SnapshotCard({ snapshot }: { snapshot: NonNullable<Snapshot> }) {
  const data = snapshot.data as Record<string, unknown>;
  const user = data.user as Record<string, unknown> | undefined;
  const orgs = data.orgs as Array<Record<string, unknown>> | undefined;

  return (
    <div className="w-full rounded border border-foreground/10 p-4 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">{snapshot.type}</span>
        <span
          className={
            snapshot.status === "succeeded"
              ? "text-green-600"
              : "text-red-500"
          }
        >
          {snapshot.status}
        </span>
      </div>
      <p className="mt-1 text-xs text-foreground/40">
        {snapshot.collectedAt.toLocaleString()}
      </p>
      {snapshot.status === "succeeded" && user && (
        <div className="mt-3 space-y-1 text-xs text-foreground/60">
          <p>User: {String(user.login)}</p>
          {orgs && orgs.length > 0 && (
            <p>Orgs: {orgs.map((o) => String(o.login)).join(", ")}</p>
          )}
        </div>
      )}
      {snapshot.status === "failed" && "error" in data && (
        <p className="mt-2 text-xs text-red-400">{String(data.error)}</p>
      )}
    </div>
  );
}
