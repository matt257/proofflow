import { NextRequest, NextResponse } from "next/server";
import { runDueSchedules } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  console.log("[cron] Running due schedules…");
  const results = await runDueSchedules();
  const failed = results.filter((r) => r.status === "failed");

  console.log(`[cron] Ran ${results.length} schedule(s), ${failed.length} failed`);
  for (const f of failed) {
    console.error(`[cron] Schedule ${f.scheduleId} (${f.type}) failed: ${f.error}`);
  }

  return NextResponse.json({
    ran: results.length,
    results,
  });
}
