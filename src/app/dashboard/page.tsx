import { db } from "@/lib/db";
import {
  fetchGitHubAccessReview,
} from "@/lib/github-api";
import { collectOrgAccessReview } from "@/lib/collect-org-review";
import {
  analyzeOrgAccessReview,
  highestSeverity,
  type Finding,
  type Severity,
} from "@/lib/access-analysis";
import { mapSnapshotToControls, controlLabel } from "@/lib/controls";
import {
  getControlCoverage,
  type CoverageResult,
} from "@/lib/control-coverage";
import {
  getControlGuidance,
  getNextActions,
} from "@/lib/control-guidance";
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
    let latestOrgSnapshot: Snapshot = null;

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

        latestOrgSnapshot = await db.evidenceSnapshot.findFirst({
          where: {
            integrationId: integration.id,
            type: "github_org_access_review",
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
            type: { in: ["github_access_review", "github_org_access_review"] },
          },
          orderBy: { collectedAt: "desc" },
          take: 10,
          select: { id: true, status: true, collectedAt: true },
        });
      } catch (e) {
        if (!isPrismaTableMissing(e)) throw e;
      }
    }

    let coverage: CoverageResult | null = null;
    try {
      coverage = await getControlCoverage();
    } catch {
      // coverage computation is best-effort
    }

    type ScheduleInfo = { frequency: string; nextRunAt: Date; lastRunAt: Date | null } | null;
    let schedule: ScheduleInfo = null;
    try {
      schedule = await db.schedule.findFirst({
        where: { type: "github_org_access_review" },
        select: { frequency: true, nextRunAt: true, lastRunAt: true },
      });
    } catch {
      // best-effort
    }

    return {
      schemaReady: true as const,
      integration,
      latestSnapshot,
      latestOrgSnapshot,
      history,
      coverage,
      schedule,
    };
  } catch (e: unknown) {
    if (isPrismaTableMissing(e)) {
      return {
        schemaReady: false as const,
        integration: null,
        latestSnapshot: null,
        latestOrgSnapshot: null,
        history: [],
        coverage: null,
        schedule: null,
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
    const data = await fetchGitHubAccessReview(integration.accessToken);
    await db.evidenceSnapshot.create({
      data: {
        workspaceId: integration.workspaceId,
        integrationId: integration.id,
        type: "github_access_review",
        status: "succeeded",
        data: JSON.parse(JSON.stringify(data)),
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

async function collectOrgEvidence() {
  "use server";

  try {
    await collectOrgAccessReview();
  } catch {
    // error already persisted as a failed snapshot
  }

  redirect("/dashboard");
}

async function enableSchedule() {
  "use server";

  let workspace = await db.workspace.findFirst();
  if (!workspace) {
    workspace = await db.workspace.create({
      data: { name: "Default Workspace" },
    });
  }

  const type = "github_org_access_review";
  await db.schedule.upsert({
    where: { workspaceId_type: { workspaceId: workspace.id, type } },
    create: {
      workspaceId: workspace.id,
      type,
      frequency: "monthly",
      nextRunAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    update: {},
  });

  redirect("/dashboard");
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function Dashboard() {
  const {
    schemaReady,
    integration,
    latestSnapshot,
    latestOrgSnapshot,
    history,
    coverage,
    schedule,
  } = await getDashboardData();
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

          {coverage && <CoverageSection coverage={coverage} />}

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

          {/* Org-wide access review */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">
                  Organization Access Review
                </h2>
                <p className="text-xs text-foreground/40">
                  Supports: {controlLabel()}
                </p>
              </div>
              <form action={collectOrgEvidence}>
                <button
                  type="submit"
                  className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
                >
                  Collect Org Members
                </button>
              </form>
            </div>

            {/* Schedule status */}
            {schedule ? (
              <div className="flex items-center justify-between rounded-lg border border-foreground/10 px-4 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                  <span className="text-foreground/60">
                    Monthly access review enabled
                  </span>
                </div>
                <span className="text-xs text-foreground/40">
                  Next run: {schedule.nextRunAt.toLocaleDateString()}
                  {schedule.lastRunAt && (
                    <> &middot; Last: {schedule.lastRunAt.toLocaleDateString()}</>
                  )}
                </span>
              </div>
            ) : (
              <form action={enableSchedule}>
                <button
                  type="submit"
                  className="w-full rounded-lg border border-dashed border-foreground/20 px-4 py-3 text-sm text-foreground/50 transition-colors hover:border-foreground/40 hover:text-foreground/70"
                >
                  Enable monthly access reviews
                </button>
              </form>
            )}

            {latestOrgSnapshot ? (
              <OrgReviewCard snapshot={latestOrgSnapshot} />
            ) : (
              <div className="rounded-lg border border-foreground/10 p-6 text-center text-sm text-foreground/40">
                No organization member data collected yet.
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
// Shared helpers
// ---------------------------------------------------------------------------

/** Safely stringify a value for display, returning null for empty/null/undefined. */
function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v);
  return s === "null" || s === "undefined" || s === "" ? null : s;
}

/** Normalize snapshot data into a consistent shape for rendering (handles v1 + v2). */
function normalizeSnapshotData(data: Record<string, unknown>) {
  const user = (data.user ?? {}) as Record<string, unknown>;
  const rawOrgs = Array.isArray(data.orgs) ? data.orgs : [];

  // Detect v2 format
  const isV2 =
    rawOrgs.length > 0 &&
    typeof rawOrgs[0] === "object" &&
    rawOrgs[0] !== null &&
    "org" in (rawOrgs[0] as Record<string, unknown>);

  type OrgEntry = {
    org: Record<string, unknown>;
    membership: Record<string, unknown> | null;
    teams: Record<string, unknown>[];
    errors: string[];
  };

  let orgs: OrgEntry[];
  if (isV2) {
    orgs = (rawOrgs as Record<string, unknown>[]).map((entry) => ({
      org: (entry.org ?? {}) as Record<string, unknown>,
      membership: entry.membership
        ? (entry.membership as Record<string, unknown>)
        : null,
      teams: Array.isArray(entry.teams)
        ? (entry.teams as Record<string, unknown>[])
        : [],
      errors: Array.isArray(entry.errors) ? (entry.errors as string[]) : [],
    }));
  } else {
    // v1: flat org objects
    orgs = (rawOrgs as Record<string, unknown>[]).map((org) => ({
      org,
      membership: null,
      teams: [],
      errors: [],
    }));
  }

  return { user, orgs };
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

function CoverageSection({ coverage }: { coverage: CoverageResult }) {
  const { summary, controls } = coverage;
  const covered = controls.filter((c) => c.status === "covered");
  const stale = controls.filter((c) => c.status === "stale");
  const missing = controls.filter((c) => c.status === "missing");
  const nextActions = getNextActions(
    missing.map((c) => c.code),
    stale.map((c) => c.code),
  );

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Compliance Coverage</h2>

      {/* Health summary */}
      <div className="rounded-lg border border-foreground/10 p-5">
        <div className="flex items-center gap-6">
          <div className="text-4xl font-bold">
            {summary.coveragePercent}%
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex gap-4 text-foreground/60">
              <span className="text-green-600">{summary.covered} healthy</span>
              {summary.stale > 0 && (
                <span className="text-yellow-600">{summary.stale} stale</span>
              )}
              {summary.missing > 0 && (
                <span className="text-red-500">{summary.missing} missing</span>
              )}
            </div>
            <div className="h-2 w-48 overflow-hidden rounded-full bg-foreground/10">
              <div className="flex h-full">
                <div
                  className="h-full bg-green-500 transition-all"
                  style={{
                    width: `${(summary.covered / summary.total) * 100}%`,
                  }}
                />
                <div
                  className="h-full bg-yellow-400 transition-all"
                  style={{
                    width: `${(summary.stale / summary.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Next Actions */}
      {nextActions.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/30 dark:bg-blue-900/10">
          <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300">
            Next Actions
          </h3>
          <div className="mt-2 space-y-2">
            {nextActions.map((a) => (
              <div
                key={a.code}
                className="flex items-center justify-between"
              >
                <span className="text-sm text-blue-700 dark:text-blue-400">
                  {a.label}{" "}
                  <span className="text-blue-400 dark:text-blue-500">
                    ({a.code})
                  </span>
                </span>
                {a.route && (
                  <form action={a.route} method="POST">
                    <button
                      type="submit"
                      className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-700"
                    >
                      {a.label}
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Control lists */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Covered */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-green-600">
            Covered ({covered.length})
          </h3>
          {covered.length === 0 ? (
            <p className="text-sm text-foreground/40">None yet</p>
          ) : (
            <div className="space-y-1.5">
              {covered.map((c) => (
                <div
                  key={c.code}
                  className="flex items-start gap-2 rounded border border-green-200 bg-green-50 px-3 py-2 dark:border-green-900/30 dark:bg-green-900/10"
                >
                  <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-green-500" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {c.framework} {c.code}
                    </p>
                    <p className="text-xs text-foreground/50">{c.name}</p>
                    {c.ageDays != null && (
                      <p className="text-xs text-foreground/30">
                        {c.ageDays === 0 ? "Collected today" : `${c.ageDays}d ago`}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* Stale */}
          {stale.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-yellow-600">
                Stale ({stale.length})
              </h3>
              <div className="space-y-1.5">
                {stale.map((c) => {
                  const guidance = getControlGuidance(c.code);
                  return (
                    <div
                      key={c.code}
                      className="rounded border border-yellow-300 bg-yellow-50 px-3 py-2 dark:border-yellow-900/30 dark:bg-yellow-900/10"
                    >
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-yellow-500" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {c.framework} {c.code}
                          </p>
                          <p className="text-xs text-foreground/50">{c.name}</p>
                          <p className="text-xs text-yellow-600 dark:text-yellow-400">
                            Last collected {c.ageDays}d ago &mdash; evidence is out of date
                          </p>
                        </div>
                      </div>
                      {guidance?.proofflowAction && (
                        <form
                          action={guidance.proofflowAction.route}
                          method="POST"
                          className="mt-2 ml-4"
                        >
                          <button
                            type="submit"
                            className="rounded bg-yellow-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-yellow-700"
                          >
                            Re-run {guidance.proofflowAction.label.toLowerCase()}
                          </button>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Missing */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-red-500">
              Missing ({missing.length})
            </h3>
            {missing.length === 0 && stale.length === 0 ? (
              <p className="text-sm text-green-600">All controls covered</p>
            ) : missing.length === 0 ? null : (
              <div className="space-y-1.5">
                {missing.map((c) => {
                  const guidance = getControlGuidance(c.code);
                  return (
                    <div
                      key={c.code}
                      className="rounded border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900/30 dark:bg-red-900/10"
                    >
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-red-400" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {c.framework} {c.code}
                          </p>
                          <p className="text-xs text-foreground/50">
                            {c.name}
                          </p>
                        </div>
                      </div>
                      {guidance && (
                        <div className="mt-2 ml-4 space-y-1.5">
                          <p className="text-xs font-medium text-foreground/40">
                            Next steps:
                          </p>
                          <ul className="list-disc pl-4 text-xs text-foreground/50 space-y-0.5">
                            {guidance.actions.map((a, i) => (
                              <li key={i}>{a}</li>
                            ))}
                          </ul>
                          {guidance.proofflowAction && (
                            <form
                              action={guidance.proofflowAction.route}
                              method="POST"
                              className="pt-1"
                            >
                              <button
                                type="submit"
                                className="rounded bg-foreground px-3 py-1 text-xs font-medium text-background transition-colors hover:bg-foreground/90"
                              >
                                {guidance.proofflowAction.label}
                              </button>
                            </form>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
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
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}
    >
      {status}
    </span>
  );
}

function EvidenceCard({ snapshot }: { snapshot: NonNullable<Snapshot> }) {
  const data = (snapshot.data ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-5 rounded-lg border border-foreground/10 p-5">
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

      {/* Actions */}
      {snapshot.status === "succeeded" && (
        <div className="flex gap-3">
          <a
            href="/api/evidence/github-access-review/export"
            className="rounded-lg border border-foreground/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-foreground/5"
          >
            Download CSV
          </a>
        </div>
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
  const { user, orgs } = normalizeSnapshotData(data);

  return (
    <div className="space-y-5">
      {/* GitHub account */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/40">
          GitHub Account
        </h4>
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <Field label="Login" value={user.login} />
          <Field label="Name" value={user.name} />
          <Field label="GitHub ID" value={user.id} />
          <Field label="Email" value={user.email} />
          <Field label="Profile" value={user.html_url} />
          <Field label="Account Type" value={user.type} />
        </div>
      </div>

      {/* Organizations */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/40">
          Organization Access ({orgs.length})
        </h4>
        {orgs.length === 0 ? (
          <p className="text-sm text-foreground/40">
            No organizations found for this GitHub account.
          </p>
        ) : (
          <div className="space-y-3">
            {orgs.map((entry, i) => (
              <OrgCard key={i} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OrgCard({
  entry,
}: {
  entry: {
    org: Record<string, unknown>;
    membership: Record<string, unknown> | null;
    teams: Record<string, unknown>[];
    errors: string[];
  };
}) {
  const { org, membership, teams, errors } = entry;

  return (
    <div className="rounded-lg border border-foreground/10">
      {/* Org header */}
      <div className="flex items-center justify-between border-b border-foreground/5 px-4 py-3">
        <div>
          <span className="font-medium text-sm">
            {str(org.login) ?? "\u2014"}
          </span>
          {str(org.description) && (
            <span className="ml-2 text-xs text-foreground/40">
              {str(org.description)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {membership && str(membership.role) && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              {str(membership.role)}
            </span>
          )}
          {membership && str(membership.state) && (
            <span className="text-xs text-foreground/40">
              {str(membership.state)}
            </span>
          )}
          <span className="text-xs text-foreground/30">
            ID {str(org.id) ?? "\u2014"}
          </span>
        </div>
      </div>

      {/* Teams */}
      <div className="px-4 py-3">
        {teams.length === 0 ? (
          <p className="text-xs text-foreground/30">
            No team memberships found.
          </p>
        ) : (
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground/40 mb-1.5">
              Teams ({teams.length})
            </p>
            {teams.map((team, j) => {
              const parent = team.parent as Record<string, unknown> | null;
              return (
                <div
                  key={j}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span>{str(team.name) ?? "\u2014"}</span>
                    {str(team.privacy) && (
                      <span className="text-xs text-foreground/30">
                        {str(team.privacy)}
                      </span>
                    )}
                    {parent && str(parent.slug) && (
                      <span className="text-xs text-foreground/30">
                        (parent: {str(parent.slug)})
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-foreground/20">
                    {str(team.slug)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Scope errors */}
      {errors.length > 0 && (
        <div className="border-t border-foreground/5 px-4 py-2">
          {errors.map((err, k) => (
            <p key={k} className="text-xs text-yellow-600 dark:text-yellow-400">
              {err}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function OrgReviewCard({ snapshot }: { snapshot: NonNullable<Snapshot> }) {
  const data = (snapshot.data ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-5 rounded-lg border border-foreground/10 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">
            Latest Org Member Inventory
          </h3>
          <time className="text-xs text-foreground/40">
            Collected {snapshot.collectedAt.toLocaleString()}
          </time>
        </div>
        <StatusBadge status={snapshot.status} />
      </div>

      {snapshot.status === "succeeded" ? (
        (() => {
          const findings = analyzeOrgAccessReview(data);
          return (
            <>
              <AnalysisSummary data={data} findings={findings} />
              <OrgReviewEvidence data={data} findings={findings} />
            </>
          );
        })()
      ) : (
        <FailedEvidence data={data} />
      )}

      {snapshot.status === "succeeded" && (
        <div className="flex items-center gap-3">
          <a
            href="/api/evidence/github-org-access-review/pack"
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
          >
            Download Evidence Pack
          </a>
          <a
            href="/api/evidence/github-org-access-review/export"
            className="rounded-lg border border-foreground/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-foreground/5"
          >
            Download CSV
          </a>
          <Link
            href="/exports"
            className="text-xs text-foreground/40 hover:text-foreground/60"
          >
            View export history &rarr;
          </Link>
        </div>
      )}

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

function AnalysisSummary({
  data,
  findings,
}: {
  data: Record<string, unknown>;
  findings: Finding[];
}) {
  const rawOrgs = Array.isArray(data.orgs) ? data.orgs : [];
  const totalOrgs = rawOrgs.length;
  const worst = highestSeverity(findings);

  if (totalOrgs === 0) return null;

  return (
    <div className="flex items-center justify-between rounded-lg border border-foreground/10 px-4 py-3 text-sm">
      <div className="flex gap-4 text-foreground/50">
        <span>{totalOrgs} org{totalOrgs !== 1 ? "s" : ""} analyzed</span>
        <span>{findings.length} warning{findings.length !== 1 ? "s" : ""}</span>
      </div>
      {worst ? (
        <SeverityBadge severity={worst} label={`Highest: ${worst}`} />
      ) : (
        <span className="text-xs text-green-600">No risks detected</span>
      )}
    </div>
  );
}

function SeverityBadge({
  severity,
  label,
}: {
  severity: Severity;
  label?: string;
}) {
  const colors: Record<Severity, string> = {
    high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    medium:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    low: "bg-foreground/5 text-foreground/50",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[severity]}`}
    >
      {label ?? severity}
    </span>
  );
}

function OrgReviewEvidence({
  data,
  findings,
}: {
  data: Record<string, unknown>;
  findings: Finding[];
}) {
  const rawOrgs = Array.isArray(data.orgs) ? data.orgs : [];

  if (rawOrgs.length === 0) {
    return (
      <p className="text-sm text-foreground/40">No organizations found.</p>
    );
  }

  return (
    <div className="space-y-4">
      {(rawOrgs as Record<string, unknown>[]).map((entry, i) => {
        const org = (entry.org ?? {}) as Record<string, unknown>;
        const members = Array.isArray(entry.members)
          ? (entry.members as Record<string, unknown>[])
          : [];
        const errors = Array.isArray(entry.errors)
          ? (entry.errors as string[])
          : [];
        const admins = members.filter((m) => m.role === "admin");
        const orgLogin = String(org.login ?? "");
        const orgFindings = findings.filter((f) => f.orgLogin === orgLogin);
        const adminPct =
          members.length > 0
            ? Math.round((admins.length / members.length) * 100)
            : 0;

        return (
          <div key={i} className="rounded-lg border border-foreground/10">
            {/* Org header */}
            <div className="flex items-center justify-between border-b border-foreground/5 px-4 py-3">
              <span className="text-sm font-medium">
                {str(org.login) ?? "\u2014"}
              </span>
              <div className="flex gap-3 text-xs text-foreground/40">
                <span>{members.length} members</span>
                <span>
                  {admins.length} admins ({adminPct}%)
                </span>
              </div>
            </div>

            {/* Risk signals */}
            {orgFindings.length > 0 ? (
              <div className="border-b border-foreground/5 px-4 py-2.5 space-y-1">
                {orgFindings.map((f, fi) => (
                  <div key={fi} className="flex items-center gap-2">
                    <SeverityBadge severity={f.severity} />
                    <span className="text-xs">{f.message}</span>
                  </div>
                ))}
              </div>
            ) : members.length > 0 ? (
              <div className="border-b border-foreground/5 px-4 py-2.5">
                <span className="text-xs text-green-600">
                  No obvious access risks detected
                </span>
              </div>
            ) : null}

            {/* Members table */}
            {members.length > 0 && (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-foreground/5 text-left text-xs text-foreground/40">
                      <th className="px-4 py-2 font-medium">Login</th>
                      <th className="px-4 py-2 font-medium">Role</th>
                      <th className="px-4 py-2 font-medium">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-foreground/5">
                    {members.map((m, j) => (
                      <tr key={j}>
                        <td className="px-4 py-1.5">
                          {str(m.login) ?? "\u2014"}
                        </td>
                        <td className="px-4 py-1.5">
                          <span
                            className={
                              m.role === "admin"
                                ? "rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                : "text-foreground/50"
                            }
                          >
                            {str(m.role) ?? "\u2014"}
                          </span>
                        </td>
                        <td className="px-4 py-1.5 text-foreground/40">
                          {str(m.type) ?? "\u2014"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {members.length === 0 && errors.length === 0 && (
              <div className="px-4 py-3 text-xs text-foreground/30">
                No members returned.
              </div>
            )}

            {errors.length > 0 && (
              <div className="border-t border-foreground/5 px-4 py-2">
                {errors.map((err, k) => (
                  <p
                    key={k}
                    className="text-xs text-yellow-600 dark:text-yellow-400"
                  >
                    {err}
                  </p>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
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
