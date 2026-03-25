import { NextResponse } from "next/server";
import { collectAWSMonitoringEvidence } from "@/lib/aws-collector";

export async function POST() {
  try {
    const snapshot = await collectAWSMonitoringEvidence();
    return NextResponse.json({ snapshot });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
