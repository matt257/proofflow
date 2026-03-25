import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toCsv } from "@/lib/csv";

export async function GET() {
  const snapshot = await db.evidenceSnapshot.findFirst({
    where: { type: "github_access_review", status: "succeeded" },
    orderBy: { collectedAt: "desc" },
    select: { collectedAt: true, data: true },
  });

  if (!snapshot) {
    return NextResponse.json(
      { error: "No succeeded github_access_review snapshot found." },
      { status: 404 },
    );
  }

  const data = (snapshot.data ?? {}) as Record<string, unknown>;
  const user = (data.user ?? {}) as Record<string, unknown>;
  const orgs = Array.isArray(data.orgs)
    ? (data.orgs as Record<string, unknown>[])
    : [];

  const collectedAt = snapshot.collectedAt.toISOString();
  const s = (v: unknown) => (v != null ? String(v) : "");

  const headers = [
    "collected_at",
    "github_user_login",
    "github_user_name",
    "github_user_id",
    "github_user_email",
    "org_login",
    "org_id",
    "org_description",
    "org_url",
  ];

  const userFields = [
    collectedAt,
    s(user.login),
    s(user.name),
    s(user.id),
    s(user.email),
  ];

  let rows: string[][];
  if (orgs.length === 0) {
    // Single row with blank org fields
    rows = [[...userFields, "", "", "", ""]];
  } else {
    rows = orgs.map((org) => [
      ...userFields,
      s(org.login),
      s(org.id),
      s(org.description),
      org.login ? `https://github.com/${String(org.login)}` : "",
    ]);
  }

  const csv = toCsv(headers, rows);
  const date = snapshot.collectedAt.toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="github-access-review-${date}.csv"`,
    },
  });
}
