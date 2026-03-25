import { db } from "@/lib/db";
import {
  fetchGitHubAccessReview,
  fetchGitHubOrgAccessReview,
} from "@/lib/github-api";
import {
  analyzeOrgAccessReview,
  highestSeverity,
  type Finding,
  type Severity,
} from "@/lib/access-analysis";
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

    return {
      schemaReady: true as const,
      integration,
      latestSnapshot,
      latestOrgSnapshot,
      history,
    };
  } catch (e: unknown) {
    if (isPrismaTableMissing(e)) {
      return {
        schemaReady: false as const,
        integration: null,
        latestSnapshot: null,
        latestOrgSnapshot: null,
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

  const integration = await db.integration.findFirst({
    where: { provider: "github" },
    select: { id: true, workspaceId: true, accessToken: true },
  });

  if (!integration?.accessToken) {
    redirect("/dashboard");
  }

  try {
    const data = await fetchGitHubOrgAccessReview(integration.accessToken);
    await db.evidenceSnapshot.create({
      data: {
        workspaceId: integration.workspaceId,
        integrationId: integration.id,
        type: "github_org_access_review",
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
        type: "github_org_access_review",
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
  const { schemaReady, integration, latestSnapshot, latestOrgSnapshot, history } =
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

          {/* Org-wide access review */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Organization Access Review
              </h2>
              <form action={collectOrgEvidence}>
                <button
                  type="submit"
                  className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
                >
                  Collect Org Members
                </button>
              </form>
            </div>

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
        <div className="flex gap-3">
          <a
            href="/api/evidence/github-org-access-review/export"
            className="rounded-lg border border-foreground/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-foreground/5"
          >
            Download CSV
          </a>
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
