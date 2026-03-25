import {
  getControlCoverage,
  type CoverageResult,
  type ControlStatus,
} from "@/lib/control-coverage";
import { getControlGuidance } from "@/lib/control-guidance";

export type AuditReadinessStatus = "ready" | "at_risk" | "not_ready";

export type AuditReadiness = {
  status: AuditReadinessStatus;
  blockingControls: ControlStatus[];
  staleControls: ControlStatus[];
  summary: string;
  nextSteps: string[];
};

/** Compute audit readiness from current control coverage. */
export function computeAuditReadiness(coverage: CoverageResult): AuditReadiness {
  const missing = coverage.controls.filter((c) => c.status === "missing");
  const stale = coverage.controls.filter((c) => c.status === "stale");

  if (missing.length > 0) {
    const codes = missing.map((c) => `${c.framework} ${c.code}`).join(", ");
    const steps = getStepsForControls(missing);
    return {
      status: "not_ready",
      blockingControls: missing,
      staleControls: stale,
      summary: `Not audit-ready. ${missing.length} control${missing.length > 1 ? "s have" : " has"} no evidence: ${codes}.`,
      nextSteps: steps,
    };
  }

  if (stale.length > 0) {
    const codes = stale.map((c) => `${c.framework} ${c.code}`).join(", ");
    const steps = getStepsForControls(stale);
    return {
      status: "at_risk",
      blockingControls: [],
      staleControls: stale,
      summary: `At risk. ${stale.length} control${stale.length > 1 ? "s have" : " has"} stale evidence: ${codes}.`,
      nextSteps: steps,
    };
  }

  return {
    status: "ready",
    blockingControls: [],
    staleControls: [],
    summary: `Audit-ready. All ${coverage.summary.total} controls have current evidence.`,
    nextSteps: [],
  };
}

/** Fetch coverage and compute readiness in one call. */
export async function getAuditReadiness(): Promise<AuditReadiness> {
  const coverage = await getControlCoverage();
  return computeAuditReadiness(coverage);
}

function getStepsForControls(controls: ControlStatus[]): string[] {
  const seen = new Set<string>();
  const steps: string[] = [];

  for (const c of controls) {
    const guidance = getControlGuidance(c.code);
    if (!guidance) continue;
    const step = guidance.proofflowAction
      ? guidance.proofflowAction.label
      : guidance.actions[0];
    if (step && !seen.has(step)) {
      seen.add(step);
      steps.push(step);
    }
  }

  return steps;
}
