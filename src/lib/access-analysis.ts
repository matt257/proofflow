export type Severity = "low" | "medium" | "high";

export type Finding = {
  orgLogin: string;
  severity: Severity;
  message: string;
  details?: Record<string, unknown>;
};

type Member = {
  login?: unknown;
  id?: unknown;
  type?: unknown;
  role?: unknown;
};

type OrgEntry = {
  org?: Record<string, unknown>;
  members?: Member[];
  errors?: string[];
};

/**
 * Analyze a v3 org access review snapshot and return risk findings.
 * Pure function — no side effects, no DB access.
 */
export function analyzeOrgAccessReview(
  data: Record<string, unknown>,
): Finding[] {
  const rawOrgs = Array.isArray(data.orgs) ? data.orgs : [];
  const findings: Finding[] = [];

  for (const raw of rawOrgs) {
    const entry = (raw ?? {}) as OrgEntry;
    const org = (entry.org ?? {}) as Record<string, unknown>;
    const orgLogin = String(org.login ?? "unknown");
    const members = Array.isArray(entry.members) ? entry.members : [];

    if (members.length === 0) continue;

    const admins = members.filter((m) => String(m.role) === "admin");
    const adminCount = admins.length;
    const totalCount = members.length;
    const adminPct = totalCount > 0 ? (adminCount / totalCount) * 100 : 0;

    // Rule: single admin
    if (adminCount === 1) {
      findings.push({
        orgLogin,
        severity: "medium",
        message: "Only one admin \u2014 potential availability risk",
        details: { adminLogin: String(admins[0]?.login ?? "unknown") },
      });
    }

    // Rule: too many admins
    if (adminCount > 3 || (totalCount >= 5 && adminPct > 20)) {
      findings.push({
        orgLogin,
        severity: "high",
        message: "High number of admins",
        details: {
          adminCount,
          totalMembers: totalCount,
          adminPercentage: Math.round(adminPct),
        },
      });
    }

    // Rule: bot with admin
    for (const m of admins) {
      if (String(m.type) === "Bot") {
        findings.push({
          orgLogin,
          severity: "high",
          message: "Bot account has admin access",
          details: { login: String(m.login ?? "unknown") },
        });
      }
    }
  }

  return findings;
}

/** Return the highest severity found, or null if no findings. */
export function highestSeverity(findings: Finding[]): Severity | null {
  if (findings.length === 0) return null;
  if (findings.some((f) => f.severity === "high")) return "high";
  if (findings.some((f) => f.severity === "medium")) return "medium";
  return "low";
}
