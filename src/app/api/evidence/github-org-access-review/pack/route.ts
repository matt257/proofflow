import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildEvidencePackFiles } from "@/lib/evidence-pack";
import JSZip from "jszip";

export async function GET() {
  const snapshot = await db.evidenceSnapshot.findFirst({
    where: { type: "github_org_access_review", status: "succeeded" },
    orderBy: { collectedAt: "desc" },
    select: { collectedAt: true, data: true },
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

  return new Response(buf, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="proofflow-evidence-pack-${date}.zip"`,
    },
  });
}
