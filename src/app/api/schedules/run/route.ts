import { NextResponse } from "next/server";
import { runDueSchedules } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

export async function GET() {
  const results = await runDueSchedules();
  return NextResponse.json({
    ran: results.length,
    results,
  });
}
