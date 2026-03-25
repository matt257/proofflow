import { db } from "@/lib/db";
import { collectOrgAccessReview } from "@/lib/collect-org-review";
import { getControlCoverage } from "@/lib/control-coverage";
import { getControlGuidance } from "@/lib/control-guidance";

const FREQUENCY_MS: Record<string, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

type RunResult = {
  scheduleId: string;
  type: string;
  status: "succeeded" | "failed" | "skipped";
  error?: string;
};

/** Run all due schedules. Returns results for each processed schedule. */
export async function runDueSchedules(): Promise<RunResult[]> {
  const now = new Date();

  const due = await db.schedule.findMany({
    where: { nextRunAt: { lte: now } },
  });

  const results: RunResult[] = [];

  for (const schedule of due) {
    const result: RunResult = {
      scheduleId: schedule.id,
      type: schedule.type,
      status: "succeeded",
    };

    try {
      if (schedule.type === "github_org_access_review") {
        await collectOrgAccessReview();
      } else {
        result.status = "skipped";
        result.error = `Unknown schedule type: ${schedule.type}`;
        results.push(result);
        continue;
      }

      const intervalMs = FREQUENCY_MS[schedule.frequency] ?? FREQUENCY_MS.monthly;
      await db.schedule.update({
        where: { id: schedule.id },
        data: {
          lastRunAt: now,
          nextRunAt: new Date(now.getTime() + intervalMs),
          lastStatus: "succeeded",
          lastError: null,
        },
      });
    } catch (e) {
      result.status = "failed";
      result.error = e instanceof Error ? e.message : "Unknown error";

      // Still advance nextRunAt so we don't retry immediately
      const intervalMs = FREQUENCY_MS[schedule.frequency] ?? FREQUENCY_MS.monthly;
      await db.schedule.update({
        where: { id: schedule.id },
        data: {
          lastRunAt: now,
          nextRunAt: new Date(now.getTime() + intervalMs),
          lastStatus: "failed",
          lastError: result.error.slice(0, 500),
        },
      });
    }

    results.push(result);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Stale control auto-remediation
// ---------------------------------------------------------------------------

const MIN_RERUN_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Map of proofflowAction routes → collection functions. */
const ACTION_RUNNERS: Record<string, () => Promise<unknown>> = {
  "/api/evidence/github-org-access-review/collect": collectOrgAccessReview,
};

export type RemediationResult = {
  controlCode: string;
  action: string;
  status: "succeeded" | "failed" | "skipped";
  error?: string;
};

/**
 * Check for stale controls that have automated actions and re-run them.
 * Skips if the last collection for that action was < 24h ago.
 */
export async function remediateStaleControls(): Promise<RemediationResult[]> {
  let coverage;
  try {
    coverage = await getControlCoverage();
  } catch {
    console.log("[auto-remediate] Could not compute coverage, skipping");
    return [];
  }

  const stale = coverage.controls.filter((c) => c.status === "stale");
  if (stale.length === 0) return [];

  // Deduplicate by action route — multiple controls may share the same action
  const actionsToRun = new Map<
    string,
    { codes: string[]; label: string; lastCollectedAt: Date | null }
  >();

  for (const control of stale) {
    const guidance = getControlGuidance(control.code);
    const route = guidance?.proofflowAction?.route;
    if (!route || !ACTION_RUNNERS[route]) continue;

    const existing = actionsToRun.get(route);
    if (existing) {
      existing.codes.push(control.code);
      // Track the most recent collection across all controls sharing this action
      if (
        control.lastCollectedAt &&
        (!existing.lastCollectedAt ||
          control.lastCollectedAt > existing.lastCollectedAt)
      ) {
        existing.lastCollectedAt = control.lastCollectedAt;
      }
    } else {
      actionsToRun.set(route, {
        codes: [control.code],
        label: guidance!.proofflowAction!.label,
        lastCollectedAt: control.lastCollectedAt,
      });
    }
  }

  const results: RemediationResult[] = [];
  const now = Date.now();

  for (const [route, info] of actionsToRun) {
    const codesStr = info.codes.join(", ");

    // Loop guard: skip if last collection was < 24h ago
    if (
      info.lastCollectedAt &&
      now - info.lastCollectedAt.getTime() < MIN_RERUN_INTERVAL_MS
    ) {
      console.log(
        `[auto-remediate] Skipping ${codesStr} — last collected ${Math.round((now - info.lastCollectedAt.getTime()) / 3600000)}h ago (< 24h)`,
      );
      for (const code of info.codes) {
        results.push({ controlCode: code, action: info.label, status: "skipped" });
      }
      continue;
    }

    console.log(`[auto-remediate] Auto re-running for stale controls: ${codesStr}`);
    const runner = ACTION_RUNNERS[route]!;

    try {
      await runner();
      console.log(`[auto-remediate] Succeeded for ${codesStr}`);
      for (const code of info.codes) {
        results.push({ controlCode: code, action: info.label, status: "succeeded" });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      console.error(`[auto-remediate] Failed for ${codesStr}: ${msg}`);
      for (const code of info.codes) {
        results.push({ controlCode: code, action: info.label, status: "failed", error: msg });
      }
    }
  }

  return results;
}
