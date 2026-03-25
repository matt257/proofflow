import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildEvidencePackFiles } from "@/lib/evidence-pack";
import JSZip from "jszip";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const exp = await db.export.findUnique({
    where: { id },
    select: { snapshotId: true, fileName: true, status: true },
  });

  if (!exp) {
    return NextResponse.json({ error: "Export not found" }, { status: 404 });
  }

  if (exp.status !== "succeeded" || !exp.snapshotId) {
    return NextResponse.json(
      { error: "Export has no downloadable data" },
      { status: 400 },
    );
  }

  const snapshot = await db.evidenceSnapshot.findUnique({
    where: { id: exp.snapshotId },
    select: { collectedAt: true, data: true },
  });

  if (!snapshot) {
    return NextResponse.json(
      { error: "Linked snapshot no longer exists" },
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
  const fileName =
    exp.fileName ?? `proofflow-evidence-pack.zip`;

  return new Response(buf, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
