import {
  getControlCoverage,
  type CoverageResult,
  type ControlStatus,
} from "@/lib/control-coverage";
import { getControlGuidance } from "@/lib/control-guidance";

export type AuditReadinessStatus = "pass" | "at_risk" | "fail";

export type FixPlanItem = {
  control: string;
  name: string;
  title: string;
  reason: string;
  action: string;
  type: "automated" | "manual";
  route?: string;
};

export type AuditReadiness = {
  status: AuditReadinessStatus;
  blockingControls: ControlStatus[];
  staleControls: ControlStatus[];
  summary: string;
  fixPlan: FixPlanItem[];
  stepsRemaining: number;
  estimateMinutes: number;
};

/** Compute audit readiness from current control coverage. */
export function computeAuditReadiness(coverage: CoverageResult): AuditReadiness {
  const missing = coverage.controls.filter((c) => c.status === "missing");
  const stale = coverage.controls.filter((c) => c.status === "stale");
  const fixPlan = getFixPlan(missing, stale);

  if (missing.length > 0) {
    return {
      status: "fail",
      blockingControls: missing,
      staleControls: stale,
      summary: `You will likely fail an audit. ${missing.length} control${missing.length > 1 ? "s have" : " has"} no evidence.`,
      fixPlan,
      stepsRemaining: fixPlan.length,
      estimateMinutes: fixPlan.length * 5,
    };
  }

  if (stale.length > 0) {
    return {
      status: "at_risk",
      blockingControls: [],
      staleControls: stale,
      summary: `Your audit readiness is at risk. ${stale.length} control${stale.length > 1 ? "s have" : " has"} out-of-date evidence.`,
      fixPlan,
      stepsRemaining: fixPlan.length,
      estimateMinutes: fixPlan.length * 3,
    };
  }

  return {
    status: "pass",
    blockingControls: [],
    staleControls: [],
    summary: `You are audit-ready. All ${coverage.summary.total} controls have valid evidence.`,
    fixPlan: [],
    stepsRemaining: 0,
    estimateMinutes: 0,
  };
}

/** Fetch coverage and compute readiness in one call. */
export async function getAuditReadiness(): Promise<AuditReadiness> {
  const coverage = await getControlCoverage();
  return computeAuditReadiness(coverage);
}

/** Build a prioritized fix plan: missing+automated first, missing+manual, then stale. */
function getFixPlan(
  missing: ControlStatus[],
  stale: ControlStatus[],
): FixPlanItem[] {
  const items: FixPlanItem[] = [];
  const seenRoutes = new Set<string>();

  // 1. Missing controls with automation
  for (const c of missing) {
    const g = getControlGuidance(c.code);
    if (!g?.proofflowAction) continue;
    if (seenRoutes.has(g.proofflowAction.route)) continue;
    seenRoutes.add(g.proofflowAction.route);
    items.push({
      control: `${c.framework} ${c.code}`,
      name: c.name,
      title: g.proofflowAction.label,
      reason: `No evidence — will cause audit failure`,
      action: g.proofflowAction.label,
      type: "automated",
      route: g.proofflowAction.route,
    });
  }

  // 2. Missing controls without automation
  for (const c of missing) {
    const g = getControlGuidance(c.code);
    if (g?.proofflowAction && seenRoutes.has(g.proofflowAction.route)) continue;
    if (items.some((i) => i.control === `${c.framework} ${c.code}`)) continue;
    items.push({
      control: `${c.framework} ${c.code}`,
      name: c.name,
      title: g ? g.actions[0] : `Provide evidence for ${c.code}`,
      reason: `No evidence — will cause audit failure`,
      action: g ? `${g.actions[0]}. Or upload evidence manually.` : "Upload evidence manually.",
      type: "manual",
    });
  }

  // 3. Stale controls
  for (const c of stale) {
    const g = getControlGuidance(c.code);
    if (g?.proofflowAction && seenRoutes.has(g.proofflowAction.route)) continue;
    if (g?.proofflowAction) seenRoutes.add(g.proofflowAction.route);
    items.push({
      control: `${c.framework} ${c.code}`,
      name: c.name,
      title: g?.proofflowAction ? `Re-run ${g.proofflowAction.label.toLowerCase()}` : `Refresh evidence for ${c.code}`,
      reason: `Evidence is ${c.ageDays}d old — may fail audit`,
      action: g?.proofflowAction ? g.proofflowAction.label : "Upload fresh evidence.",
      type: g?.proofflowAction ? "automated" : "manual",
      route: g?.proofflowAction?.route,
    });
  }

  return items;
}
