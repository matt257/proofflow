import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { controlCode, title, content } = body;

    if (!controlCode || !content) {
      return NextResponse.json(
        { error: "controlCode and content are required" },
        { status: 400 },
      );
    }

    let workspace = await db.workspace.findFirst();
    if (!workspace) {
      workspace = await db.workspace.create({
        data: { name: "Default Workspace" },
      });
    }

    const upload = await db.evidenceUpload.create({
      data: {
        workspaceId: workspace.id,
        controlCode: String(controlCode),
        title: String(title || `Evidence for ${controlCode}`),
        content: String(content),
      },
    });

    return NextResponse.json({ upload });
  } catch (e) {
    console.error("Evidence upload failed:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
