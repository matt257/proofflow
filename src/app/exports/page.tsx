import { db } from "@/lib/db";
import { buildEvidencePackFiles } from "@/lib/evidence-pack";
import {
  analyzeOrgAccessReview,
  highestSeverity,
} from "@/lib/access-analysis";
import { mapSnapshotToControls, controlLabel } from "@/lib/controls";
import { getControlCoverage } from "@/lib/control-coverage";
import { redirect } from "next/navigation";
import Link from "next/link";
import JSZip from "jszip";

export const dynamic = "force-dynamic";

function isPrismaTableMissing(e: unknown): boolean {
  return (
    e != null &&
    typeof e === "object" &&
    "code" in e &&
    (e as { code: string }).code === "P2021"
  );
}

async function getExports() {
  try {
    const exports = await db.export.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        type: true,
        status: true,
        fileName: true,
        createdAt: true,
        completedAt: true,
        metadata: true,
        snapshot: {
          select: { collectedAt: true },
        },
      },
    });
    let coverageSummary = { covered: 0, stale: 0, missing: 0, total: 0, coveragePercent: 0 };
    try {
      const cov = await getControlCoverage();
      coverageSummary = cov.summary;
    } catch {
      // best-effort
    }

    return { schemaReady: true as const, exports, coverageSummary };
  } catch (e) {
    if (isPrismaTableMissing(e)) {
      return {
        schemaReady: false as const,
        exports: [],
        coverageSummary: { covered: 0, total: 0, coveragePercent: 0 },
      };
    }
    throw e;
  }
}

async function generateExport() {
  "use server";

  const snapshot = await db.evidenceSnapshot.findFirst({
    where: { type: "github_org_access_review", status: "succeeded" },
    orderBy: { collectedAt: "desc" },
    select: { id: true, workspaceId: true, collectedAt: true, data: true },
  });

  if (!snapshot) {
    redirect("/exports");
  }

  const data = (snapshot.data ?? {}) as Record<string, unknown>;
  const date = snapshot.collectedAt.toISOString().slice(0, 10);
  const fileName = `proofflow-evidence-pack-${date}.zip`;

  // Verify the pack can be built (validates data shape)
  try {
    const files = buildEvidencePackFiles({
      collectedAt: snapshot.collectedAt,
      data,
    });
    const zip = new JSZip();
    for (const file of files) {
      zip.file(file.name, file.content);
    }
    await zip.generateAsync({ type: "arraybuffer" });
  } catch {
    await db.export.create({
      data: {
        workspaceId: snapshot.workspaceId,
        snapshotId: snapshot.id,
        type: "github_org_access_review_pack",
        status: "failed",
        fileName,
        metadata: { error: "Failed to build evidence pack" },
      },
    });
    redirect("/exports");
  }

  const findings = analyzeOrgAccessReview(data);
  const rawOrgs = Array.isArray(data.orgs) ? data.orgs : [];
  let memberCount = 0;
  let adminCount = 0;
  for (const entry of rawOrgs as Record<string, unknown>[]) {
    const members = Array.isArray(entry.members)
      ? (entry.members as Record<string, unknown>[])
      : [];
    memberCount += members.length;
    adminCount += members.filter(
      (m) => String(m.role) === "admin",
    ).length;
  }

  await db.export.create({
    data: {
      workspaceId: snapshot.workspaceId,
      snapshotId: snapshot.id,
      type: "github_org_access_review_pack",
      status: "succeeded",
      fileName,
      completedAt: new Date(),
      metadata: {
        orgCount: rawOrgs.length,
        memberCount,
        adminCount,
        warningCount: findings.length,
        highestSeverity: highestSeverity(findings),
      },
    },
  });

  // Ensure compliance controls are mapped to the snapshot
  await mapSnapshotToControls(snapshot.id);

  redirect("/exports");
}

export default async function ExportsPage() {
  const { schemaReady, exports, coverageSummary } = await getExports();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          className="text-sm text-foreground/40 hover:text-foreground/60"
        >
          &larr; Dashboard
        </Link>
        <h1 className="text-2xl font-bold">Exports</h1>
        <div />
      </div>

      {!schemaReady ? (
        <div className="rounded-lg border border-yellow-400/30 bg-yellow-50 px-6 py-4 text-center dark:bg-yellow-950/20">
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            Database schema is not initialized for this environment yet.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-foreground/50">
              {exports.length} export{exports.length !== 1 ? "s" : ""}
              <span className="ml-3 text-foreground/30">|</span>
              <span className="ml-3">
                {coverageSummary.coveragePercent}% healthy
                {coverageSummary.stale > 0 && (
                  <> &middot; {coverageSummary.stale} stale</>
                )}
                {coverageSummary.missing > 0 && (
                  <> &middot; {coverageSummary.missing} missing</>
                )}
              </span>
            </p>
            <form action={generateExport}>
              <button
                type="submit"
                className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
              >
                Generate New Evidence Pack
              </button>
            </form>
          </div>

          {exports.length === 0 ? (
            <div className="rounded-lg border border-foreground/10 p-8 text-center text-sm text-foreground/40">
              No exports yet. Generate your first evidence pack above.
            </div>
          ) : (
            <div className="overflow-auto rounded-lg border border-foreground/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-foreground/5 text-left text-xs text-foreground/40">
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium">File</th>
                    <th className="px-4 py-3 font-medium">Snapshot</th>
                    <th className="px-4 py-3 font-medium">Summary</th>
                    <th className="px-4 py-3 font-medium">Controls</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-foreground/5">
                  {exports.map((exp) => {
                    const meta = (exp.metadata ?? {}) as Record<
                      string,
                      unknown
                    >;
                    return (
                      <tr key={exp.id}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {exp.createdAt.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {exp.fileName ?? "\u2014"}
                        </td>
                        <td className="px-4 py-3 text-xs text-foreground/50">
                          {exp.snapshot
                            ? exp.snapshot.collectedAt.toLocaleString()
                            : "\u2014"}
                        </td>
                        <td className="px-4 py-3 text-xs text-foreground/50">
                          {meta.orgCount != null && (
                            <span>
                              {String(meta.orgCount)} orgs,{" "}
                              {String(meta.memberCount ?? 0)} members,{" "}
                              {String(meta.warningCount ?? 0)} warnings
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-foreground/50">
                          {exp.type.includes("org_access_review")
                            ? controlLabel()
                            : "\u2014"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              exp.status === "succeeded"
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            }`}
                          >
                            {exp.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {exp.status === "succeeded" && (
                            <a
                              href={`/api/exports/${exp.id}/download`}
                              className="text-xs font-medium text-foreground/60 hover:text-foreground"
                            >
                              Download
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
