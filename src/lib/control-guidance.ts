export type ProofFlowAction = {
  label: string;
  /** Form POST target, or null if no automated action exists yet. */
  route: string;
};

export type ControlGuidance = {
  description: string;
  actions: string[];
  proofflowAction: ProofFlowAction | null;
};

const GUIDANCE: Record<string, ControlGuidance> = {
  "CC6.1": {
    description: "Implement and verify logical access controls.",
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
    actions: [
      "Enable audit logging for your systems",
      "Collect and store logs regularly",
      "Review logs periodically for anomalies",
    ],
    proofflowAction: null,
  },
  "CC8.1": {
    description:
      "Establish change management processes for infrastructure and code.",
    actions: [
      "Require pull request reviews for code changes",
      "Document change approval workflows",
      "Collect evidence of change reviews",
    ],
    proofflowAction: null,
  },
};

export function getControlGuidance(code: string): ControlGuidance | null {
  return GUIDANCE[code] ?? null;
}

/** Get the top missing controls that have actionable ProofFlow automations. */
export function getNextActions(
  missingCodes: string[],
): Array<{ code: string; label: string; route: string }> {
  const actions: Array<{ code: string; label: string; route: string }> = [];
  const seen = new Set<string>();

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

  // Also include manual-only controls
  for (const code of missingCodes) {
    const g = GUIDANCE[code];
    if (g && !g.proofflowAction && actions.length < 3) {
      actions.push({
        code,
        label: `Set up ${g.description.toLowerCase().replace(/\.$/, "")}`,
        route: "",
      });
    }
  }

  return actions.slice(0, 3);
}
