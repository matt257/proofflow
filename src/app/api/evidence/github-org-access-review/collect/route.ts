import { NextResponse } from "next/server";
import { collectOrgAccessReview } from "@/lib/collect-org-review";

export async function POST() {
  try {
    const snapshot = await collectOrgAccessReview();
    return NextResponse.json({ snapshot });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
