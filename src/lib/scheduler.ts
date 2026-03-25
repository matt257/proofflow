import { db } from "@/lib/db";
import { collectOrgAccessReview } from "@/lib/collect-org-review";

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
