import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { randomBytes } from "crypto";

export async function POST() {
  try {
    let workspace = await db.workspace.findFirst();
    if (!workspace) {
      workspace = await db.workspace.create({
        data: { name: "Default Workspace" },
      });
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const link = await db.shareLink.create({
      data: {
        workspaceId: workspace.id,
        token,
        expiresAt,
      },
    });

    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const url = `${appUrl}/share/${token}`;

    return NextResponse.json({ url, expiresAt: link.expiresAt });
  } catch (e) {
    console.error("share create failed:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
