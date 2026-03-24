import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const count = await db.workspace.count();
    return NextResponse.json({ status: "ok", workspaces: count });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ status: "error", message }, { status: 500 });
  }
}
