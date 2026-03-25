import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toCsv } from "@/lib/csv";

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
  const s = (v: unknown) => (v != null ? String(v) : "");

  const headers = [
    "collected_at",
    "org_login",
    "org_id",
    "user_login",
    "user_id",
    "user_type",
    "role",
  ];

  const collectedAt = snapshot.collectedAt.toISOString();
  const rawOrgs = Array.isArray(data.orgs) ? data.orgs : [];
  const rows: string[][] = [];

  for (const entry of rawOrgs as Record<string, unknown>[]) {
    const org = (entry.org ?? {}) as Record<string, unknown>;
    const members = Array.isArray(entry.members)
      ? (entry.members as Record<string, unknown>[])
      : [];

    if (members.length === 0) {
      rows.push([collectedAt, s(org.login), s(org.id), "", "", "", ""]);
    } else {
      for (const m of members) {
        rows.push([
          collectedAt,
          s(org.login),
          s(org.id),
          s(m.login),
          s(m.id),
          s(m.type),
          s(m.role),
        ]);
      }
    }
  }

  if (rows.length === 0) {
    rows.push([collectedAt, "", "", "", "", "", ""]);
  }

  const csv = toCsv(headers, rows);
  const date = snapshot.collectedAt.toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="github-org-access-review-${date}.csv"`,
    },
  });
}
