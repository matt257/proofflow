import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const integration = await db.integration.findFirst({
    where: { provider: "github" },
    select: { metadata: true, createdAt: true, updatedAt: true },
  });

  if (!integration) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({ connected: true, ...integration });
}
