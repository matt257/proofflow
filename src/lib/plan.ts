import { db } from "@/lib/db";

export type Plan = "free" | "pro";

export type Feature =
  | "pdf_export"
  | "evidence_pack"
  | "auditor_share"
  | "schedules"
  | "notifications"
  | "export_history";

const PRO_FEATURES: Set<Feature> = new Set([
  "pdf_export",
  "evidence_pack",
  "auditor_share",
  "schedules",
  "notifications",
  "export_history",
]);

/** Check if a plan has access to a feature. */
export function hasFeature(plan: Plan, feature: Feature): boolean {
  if (plan === "pro") return true;
  return !PRO_FEATURES.has(feature);
}

/** Get the current workspace plan. Returns "free" if no workspace or Stripe not configured. */
export async function getWorkspacePlan(): Promise<Plan> {
  try {
    const workspace = await db.workspace.findFirst({
      select: { plan: true },
    });
    return (workspace?.plan as Plan) ?? "free";
  } catch {
    return "free";
  }
}
