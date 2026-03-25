import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildEvidencePackFiles } from "@/lib/evidence-pack";
import {
  analyzeOrgAccessReview,
  highestSeverity,
} from "@/lib/access-analysis";
import JSZip from "jszip";

export async function GET() {
  const snapshot = await db.evidenceSnapshot.findFirst({
    where: { type: "github_org_access_review", status: "succeeded" },
    orderBy: { collectedAt: "desc" },
    select: { id: true, workspaceId: true, collectedAt: true, data: true },
  });

  if (!snapshot) {
    return NextResponse.json(
      { error: "No succeeded github_org_access_review snapshot found." },
      { status: 404 },
    );
  }

  const data = (snapshot.data ?? {}) as Record<string, unknown>;
  const files = buildEvidencePackFiles({
    collectedAt: snapshot.collectedAt,
    data,
  });

  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.name, file.content);
  }

  const buf = await zip.generateAsync({ type: "arraybuffer" });
  const date = snapshot.collectedAt.toISOString().slice(0, 10);
  const fileName = `proofflow-evidence-pack-${date}.zip`;

  // Compute summary metrics for the export record
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

  return new Response(buf, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
