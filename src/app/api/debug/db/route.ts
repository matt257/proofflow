import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const result: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    connected: false,
    database: null,
    tables: { workspace: false, integration: false },
  };

  try {
    // DB fingerprint — safe metadata only, no secrets
    const [info] = await db.$queryRaw<
      { db: string; schema: string; pg_version: string }[]
    >`
      SELECT
        current_database()::text  AS db,
        current_schema()::text    AS schema,
        version()::text           AS pg_version
    `;
    result.connected = true;
    result.database = {
      currentDatabase: info.db,
      currentSchema: info.schema,
      pgVersion: info.pg_version,
    };

    // Check which tables exist
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
