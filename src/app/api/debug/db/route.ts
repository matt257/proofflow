import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const result: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    connected: false,
    tables: { workspace: false, integration: false },
  };

  try {
    // Basic connectivity check
    const rows = await db.$queryRaw<{ v: number }[]>`SELECT 1 as v`;
    result.connected = rows.length > 0;

    // Check which tables exist (cast to text to avoid Prisma name-type deserialization error)
    const tables = await db.$queryRaw<{ tbl: string }[]>`
      SELECT table_name::text AS tbl
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('Workspace', 'Integration')
    `;
    const tableNames = tables.map((t) => t.tbl);
    result.tables = {
      workspace: tableNames.includes("Workspace"),
      integration: tableNames.includes("Integration"),
    };
  } catch (e) {
    result.error = e instanceof Error ? e.message : "Unknown error";
  }

  return NextResponse.json(result);
}
