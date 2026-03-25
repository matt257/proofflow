import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accessKeyId, secretAccessKey, region } = body;

    if (!accessKeyId || !secretAccessKey || !region) {
      return NextResponse.json(
        { error: "accessKeyId, secretAccessKey, and region are required" },
        { status: 400 },
      );
    }

    let workspace = await db.workspace.findFirst();
    if (!workspace) {
      workspace = await db.workspace.create({
        data: { name: "Default Workspace" },
      });
    }

    await db.integration.upsert({
      where: {
        workspaceId_provider: { workspaceId: workspace.id, provider: "aws" },
      },
      create: {
        workspaceId: workspace.id,
        provider: "aws",
        metadata: { accessKeyId, secretAccessKey, region },
      },
      update: {
        metadata: { accessKeyId, secretAccessKey, region },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("AWS connect failed:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
