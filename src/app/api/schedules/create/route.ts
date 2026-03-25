import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST() {
  try {
    let workspace = await db.workspace.findFirst();
    if (!workspace) {
      workspace = await db.workspace.create({
        data: { name: "Default Workspace" },
      });
    }

    const type = "github_org_access_review";
    const frequency = "monthly";
    const nextRunAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const schedule = await db.schedule.upsert({
      where: {
        workspaceId_type: { workspaceId: workspace.id, type },
      },
      create: {
        workspaceId: workspace.id,
        type,
        frequency,
        nextRunAt,
      },
      update: {
        frequency,
        nextRunAt,
      },
    });

    return NextResponse.json({ schedule });
  } catch (e) {
    console.error("schedule create failed:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
