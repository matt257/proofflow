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
  const s = (v: unknown) => (v != null ? String(v) : "");

  const headers = [
    "collected_at",
    "github_user_login",
    "github_user_name",
    "github_user_id",
    "github_user_email",
    "github_user_type",
    "org_login",
    "org_id",
    "org_description",
    "org_url",
    "org_role",
    "org_membership_state",
    "team_name",
    "team_slug",
    "team_id",
    "team_privacy",
    "parent_team",
  ];

  const collectedAt = snapshot.collectedAt.toISOString();
  const user = (data.user ?? {}) as Record<string, unknown>;
  const userFields = [
    collectedAt,
    s(user.login),
    s(user.name),
    s(user.id),
    s(user.email),
    s(user.type),
  ];

  const rows: string[][] = [];

  // v2 format: orgs is an array of { org, membership, teams }
  // v1 format: orgs is a flat array of org objects
  const rawOrgs = Array.isArray(data.orgs) ? data.orgs : [];
  const isV2 =
    rawOrgs.length > 0 &&
    typeof rawOrgs[0] === "object" &&
    rawOrgs[0] !== null &&
    "org" in (rawOrgs[0] as Record<string, unknown>);

  if (isV2) {
    for (const entry of rawOrgs as Record<string, unknown>[]) {
      const org = (entry.org ?? {}) as Record<string, unknown>;
      const membership = (entry.membership ?? {}) as Record<string, unknown>;
      const teams = Array.isArray(entry.teams)
        ? (entry.teams as Record<string, unknown>[])
        : [];

      const orgFields = [
        s(org.login),
        s(org.id),
        s(org.description),
        org.login ? `https://github.com/${String(org.login)}` : "",
        s(membership.role),
        s(membership.state),
      ];

      if (teams.length === 0) {
        rows.push([...userFields, ...orgFields, "", "", "", "", ""]);
      } else {
        for (const team of teams) {
          const parent = team.parent as Record<string, unknown> | null;
          rows.push([
            ...userFields,
            ...orgFields,
            s(team.name),
            s(team.slug),
            s(team.id),
            s(team.privacy),
            parent ? s(parent.slug) : "",
          ]);
        }
      }
    }
  } else {
    // v1 fallback: flat org objects, no teams
    for (const org of rawOrgs as Record<string, unknown>[]) {
      rows.push([
        ...userFields,
        s(org.login),
        s(org.id),
        s(org.description),
        org.login ? `https://github.com/${String(org.login)}` : "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]);
    }
  }

  // If no orgs at all, still emit one row with the user
  if (rows.length === 0) {
    rows.push([...userFields, "", "", "", "", "", "", "", "", "", "", ""]);
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
