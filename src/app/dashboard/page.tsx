import { db } from "@/lib/db";
import { fetchGitHubAccessReview } from "@/lib/github-api";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Integration = {
  id: string;
  workspaceId: string;
  accessToken: string | null;
  metadata: unknown;
} | null;

type Snapshot = {
  id: string;
  status: string;
  type: string;
  collectedAt: Date;
  data: unknown;
} | null;

type SnapshotSummary = {
  id: string;
  status: string;
  collectedAt: Date;
};

function isPrismaTableMissing(e: unknown): boolean {
  return (
    e != null &&
    typeof e === "object" &&
    "code" in e &&
    (e as { code: string }).code === "P2021"
  );
}

async function getDashboardData() {
  try {
    const integration = await db.integration.findFirst({
      where: { provider: "github" },
      select: {
        id: true,
        workspaceId: true,
        accessToken: true,
        metadata: true,
      },
    });

    let latestSnapshot: Snapshot = null;
    let history: SnapshotSummary[] = [];

    if (integration) {
      try {
        latestSnapshot = await db.evidenceSnapshot.findFirst({
          where: {
            integrationId: integration.id,
            type: "github_access_review",
          },
          orderBy: { collectedAt: "desc" },
          select: {
            id: true,
            status: true,
            type: true,
            collectedAt: true,
            data: true,
          },
        });

        history = await db.evidenceSnapshot.findMany({
          where: {
            integrationId: integration.id,
            type: "github_access_review",
          },
          orderBy: { collectedAt: "desc" },
          take: 10,
          select: { id: true, status: true, collectedAt: true },
        });
      } catch (e) {
        if (!isPrismaTableMissing(e)) throw e;
      }
    }

    return {
      schemaReady: true as const,
      integration,
      latestSnapshot,
      history,
    };
  } catch (e: unknown) {
    if (isPrismaTableMissing(e)) {
      return {
        schemaReady: false as const,
        integration: null,
        latestSnapshot: null,
        history: [],
      };
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
    const { user, orgs } = await fetchGitHubAccessReview(
      integration.accessToken,
    );
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function Dashboard() {
  const { schemaReady, integration, latestSnapshot, history } =
    await getDashboardData();
  const meta = integration?.metadata as Record<string, string> | null;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="text-sm text-foreground/40 hover:text-foreground/60"
        >
          &larr; Home
        </Link>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div />
      </div>

      {!schemaReady ? (
        <SchemaNotReady />
      ) : !integration ? (
        <ConnectGitHub />
      ) : (
        <>
          <GitHubStatus meta={meta} />

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                GitHub Access Review Evidence
              </h2>
              <form action={collectEvidence}>
                <button
                  type="submit"
                  className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
                >
                  Collect Now
                </button>
              </form>
            </div>

            {latestSnapshot ? (
              <EvidenceCard snapshot={latestSnapshot} />
            ) : (
              <div className="rounded-lg border border-foreground/10 p-6 text-center text-sm text-foreground/40">
                No evidence collected yet. Click &ldquo;Collect Now&rdquo; to
                take your first snapshot.
              </div>
            )}
          </section>

          {history.length > 1 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground/60">
                Collection History
              </h3>
              <div className="divide-y divide-foreground/5 rounded-lg border border-foreground/10">
                {history.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between px-4 py-2.5 text-sm"
                  >
                    <time className="text-foreground/50">
                      {s.collectedAt.toLocaleString()}
                    </time>
                    <StatusBadge status={s.status} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function SchemaNotReady() {
  return (
    <div className="rounded-lg border border-yellow-400/30 bg-yellow-50 px-6 py-4 text-center dark:bg-yellow-950/20">
      <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
        Database schema is not initialized for this environment yet.
      </p>
      <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
        Run <code className="font-mono">npx prisma db push</code> to set up
        tables.
      </p>
    </div>
  );
}

function ConnectGitHub() {
  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <p className="text-sm text-foreground/50">
        Connect a GitHub account to start collecting evidence.
      </p>
      <a
        href="/api/github/connect"
        className="rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
      >
        Connect GitHub
      </a>
    </div>
  );
}

function GitHubStatus({ meta }: { meta: Record<string, string> | null }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-foreground/10 px-5 py-3">
      <div className="flex items-center gap-3">
        <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
        <span className="text-sm font-medium">GitHub connected</span>
        {meta?.githubLogin && (
          <span className="text-sm text-foreground/50">
            @{meta.githubLogin}
          </span>
        )}
      </div>
      <a
        href="/api/github/connect"
        className="text-xs text-foreground/40 hover:text-foreground/60"
      >
        Reconnect
      </a>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "succeeded"
      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
      : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {status}
    </span>
  );
}

function EvidenceCard({ snapshot }: { snapshot: NonNullable<Snapshot> }) {
  const data = (snapshot.data ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-4 rounded-lg border border-foreground/10 p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Latest Access Review</h3>
          <time className="text-xs text-foreground/40">
            Collected {snapshot.collectedAt.toLocaleString()}
          </time>
        </div>
        <StatusBadge status={snapshot.status} />
      </div>

      {snapshot.status === "succeeded" ? (
        <SucceededEvidence data={data} />
      ) : (
        <FailedEvidence data={data} />
      )}

      {/* Raw JSON toggle */}
      <details className="group">
        <summary className="cursor-pointer text-xs text-foreground/40 hover:text-foreground/60">
          Show raw JSON
        </summary>
        <pre className="mt-2 max-h-64 overflow-auto rounded bg-foreground/5 p-3 text-xs leading-relaxed">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function SucceededEvidence({ data }: { data: Record<string, unknown> }) {
  const user = (data.user ?? {}) as Record<string, unknown>;
  const orgs = Array.isArray(data.orgs)
    ? (data.orgs as Record<string, unknown>[])
    : [];

  return (
    <>
      {/* GitHub account */}
      <div className="space-y-1.5">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/40">
          GitHub Account
        </h4>
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <Field label="Login" value={user.login} />
          <Field label="Name" value={user.name} />
          <Field label="GitHub ID" value={user.id} />
          <Field label="Email" value={user.email} />
        </div>
      </div>

      {/* Organizations */}
      <div className="space-y-1.5">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/40">
          Organization Memberships
        </h4>
        {orgs.length === 0 ? (
          <p className="text-sm text-foreground/40">
            No organizations found for this GitHub account.
          </p>
        ) : (
          <div className="divide-y divide-foreground/5 rounded border border-foreground/10">
            {orgs.map((org, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div>
                  <span className="font-medium">
                    {str(org.login) || "\u2014"}
                  </span>
                  {"description" in org && org.description != null && (
                    <span className="ml-2 text-foreground/40">
                      {str(org.description)}
                    </span>
                  )}
                </div>
                <span className="text-xs text-foreground/30">
                  ID {str(org.id) || "\u2014"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function FailedEvidence({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="rounded bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
      {"error" in data ? String(data.error) : "Collection failed."}
    </div>
  );
}

function Field({ label, value }: { label: string; value: unknown }) {
  const display = str(value);
  if (!display) return null;
  return (
    <>
      <span className="text-foreground/40">{label}</span>
      <span>{display}</span>
    </>
  );
}

/** Safely stringify a value for display, returning null for empty/null/undefined. */
function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v);
  return s === "null" || s === "undefined" || s === "" ? null : s;
}
