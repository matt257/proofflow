import { NextRequest, NextResponse } from "next/server";
import { runDueSchedules, remediateStaleControls } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // 1. Run due schedules
  console.log("[cron] Running due schedules…");
  const results = await runDueSchedules();
  const failed = results.filter((r) => r.status === "failed");

  console.log(`[cron] Ran ${results.length} schedule(s), ${failed.length} failed`);
  for (const f of failed) {
    console.error(`[cron] Schedule ${f.scheduleId} (${f.type}) failed: ${f.error}`);
  }

  // 2. Auto-remediate stale controls
  console.log("[cron] Checking for stale controls…");
  const remediation = await remediateStaleControls();
  if (remediation.length > 0) {
    const succeeded = remediation.filter((r) => r.status === "succeeded").length;
    const rFailed = remediation.filter((r) => r.status === "failed").length;
    const skipped = remediation.filter((r) => r.status === "skipped").length;
    console.log(
      `[cron] Auto-remediation: ${succeeded} succeeded, ${rFailed} failed, ${skipped} skipped`,
    );
  } else {
    console.log("[cron] No stale controls need remediation");
  }

  return NextResponse.json({
    ran: results.length,
    results,
    remediation,
  });
}
