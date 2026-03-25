export type ProofFlowAction = {
  label: string;
  /** Form POST target, or null if no automated action exists yet. */
  route: string;
};

export type ControlGuidance = {
  description: string;
  purpose: string;
  evidenceRequirement: string;
  evidenceSource: string;
  actions: string[];
  proofflowAction: ProofFlowAction | null;
};

const GUIDANCE: Record<string, ControlGuidance> = {
  "CC6.1": {
    description: "Implement and verify logical access controls.",
    purpose: "Proves that access to systems is restricted to authorized users.",
    evidenceRequirement:
      "A recent organization access review showing who has access and their privilege levels.",
    evidenceSource: "GitHub organization access review",
    actions: [
      "Run a GitHub organization access review",
      "Verify that admin access is limited to authorized users",
      "Export and store evidence",
    ],
    proofflowAction: {
      label: "Run org access review",
      route: "/api/evidence/github-org-access-review/collect",
    },
  },
  "CC6.2": {
    description: "Review user access regularly across all systems.",
    purpose: "Proves that user access is reviewed regularly.",
    evidenceRequirement:
      "A recent user access review showing who has access and what roles they hold.",
    evidenceSource: "GitHub organization access review",
    actions: [
      "Run a GitHub organization access review",
      "Review the member list and admin roles",
      "Export evidence pack for audit",
    ],
    proofflowAction: {
      label: "Run access review",
      route: "/api/evidence/github-org-access-review/collect",
    },
  },
  "CC6.3": {
    description: "Verify role-based access is properly configured.",
    purpose: "Proves that roles are assigned appropriately based on job function.",
    evidenceRequirement:
      "A recent access review confirming roles match job responsibilities and admin access is limited.",
    evidenceSource: "GitHub organization access review",
    actions: [
      "Run a GitHub organization access review",
      "Confirm roles match job responsibilities",
      "Address any risk findings",
    ],
    proofflowAction: {
      label: "Run org access review",
      route: "/api/evidence/github-org-access-review/collect",
    },
  },
  "CC7.1": {
    description: "Implement monitoring of system activity and access.",
    purpose: "Proves that system activity is being monitored for anomalies.",
    evidenceRequirement:
      "Monitoring or audit log evidence showing system activity is being captured and reviewed.",
    evidenceSource: "AWS CloudTrail",
    actions: [
      "Connect AWS and collect CloudTrail evidence",
      "Verify CloudTrail is enabled and logging",
      "Ensure multi-region logging if applicable",
    ],
    proofflowAction: {
      label: "Collect AWS monitoring evidence",
      route: "/api/evidence/aws-monitoring/collect",
    },
  },
  "CC8.1": {
    description:
      "Establish change management processes for infrastructure and code.",
    purpose: "Proves that changes go through a controlled review and approval process.",
    evidenceRequirement:
      "Evidence of change management, such as pull request reviews, approvals, or documented change workflows.",
    evidenceSource: "GitHub pull request reviews",
    actions: [
      "Run a GitHub organization access review (includes PR data)",
      "Verify pull requests have reviewers assigned",
      "Export evidence pack for audit",
    ],
    proofflowAction: {
      label: "Run org access review",
      route: "/api/evidence/github-org-access-review/collect",
    },
  },
};

export function getControlGuidance(code: string): ControlGuidance | null {
  return GUIDANCE[code] ?? null;
}

/**
 * Get the top actionable items for controls that need attention.
 * `staleCodes` are prioritized with "Re-run" labels; `missingCodes` get setup labels.
 */
export function getNextActions(
  missingCodes: string[],
  staleCodes: string[] = [],
): Array<{ code: string; label: string; route: string }> {
  const actions: Array<{ code: string; label: string; route: string }> = [];
  const seen = new Set<string>();

  // Stale controls with automation get prioritized (re-run)
  for (const code of staleCodes) {
    const g = GUIDANCE[code];
    if (g?.proofflowAction && !seen.has(g.proofflowAction.route)) {
      seen.add(g.proofflowAction.route);
      actions.push({
        code,
        label: `Re-run ${g.proofflowAction.label.toLowerCase()}`,
        route: g.proofflowAction.route,
      });
    }
  }

  // Missing controls with automation
  for (const code of missingCodes) {
    const g = GUIDANCE[code];
    if (g?.proofflowAction && !seen.has(g.proofflowAction.route)) {
      seen.add(g.proofflowAction.route);
      actions.push({
        code,
        label: g.proofflowAction.label,
        route: g.proofflowAction.route,
      });
    }
  }

  // Manual-only controls
  for (const code of [...staleCodes, ...missingCodes]) {
    const g = GUIDANCE[code];
    if (g && !g.proofflowAction && !actions.some((a) => a.code === code) && actions.length < 3) {
      actions.push({
        code,
        label: `Set up ${g.description.toLowerCase().replace(/\.$/, "")}`,
        route: "",
      });
    }
  }

  return actions.slice(0, 3);
}
