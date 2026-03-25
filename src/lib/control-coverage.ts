import { db } from "@/lib/db";
import { ensureAllControls, CONTROL_CATALOG } from "@/lib/controls";

// ---------------------------------------------------------------------------
// Freshness thresholds (days)
// ---------------------------------------------------------------------------

const FRESHNESS_DAYS: Record<string, number> = {
  "CC6.1": 30,
  "CC6.2": 30,
  "CC6.3": 30,
  "CC7.1": 30,
  "CC8.1": 90,
};

export function getMaxAgeDays(code: string): number {
  return FRESHNESS_DAYS[code] ?? 30;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ControlHealth = "covered" | "stale" | "missing";

export type ControlStatus = {
  framework: string;
  code: string;
  name: string;
  description: string | null;
  status: ControlHealth;
  covered: boolean;
  stale: boolean;
  ageDays: number | null;
  lastCollectedAt: Date | null;
};

export type CoverageSummary = {
  total: number;
  covered: number;
  stale: number;
  missing: number;
  healthy: number;
  coveragePercent: number;
};

export type CoverageResult = {
  controls: ControlStatus[];
  summary: CoverageSummary;
};

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

export async function getControlCoverage(): Promise<CoverageResult> {
  await ensureAllControls();

  const allControls = await db.control.findMany({
    where: {
      framework: "SOC2",
      code: { in: CONTROL_CATALOG.map((c) => c.code) },
    },
    select: {
      id: true,
      framework: true,
      code: true,
      name: true,
      description: true,
      mappings: {
        select: {
          snapshot: {
            select: { collectedAt: true },
          },
        },
        orderBy: { snapshot: { collectedAt: "desc" } },
        take: 1,
      },
    },
    orderBy: { code: "asc" },
  });

  const now = Date.now();

  const controls: ControlStatus[] = allControls.map((c) => {
    const latestMapping = c.mappings[0];

    if (!latestMapping) {
      return {
        framework: c.framework,
        code: c.code,
        name: c.name,
        description: c.description,
        status: "missing" as const,
        covered: false,
        stale: false,
        ageDays: null,
        lastCollectedAt: null,
      };
    }

    const collectedAt = latestMapping.snapshot.collectedAt;
    const ageDays = Math.floor(
      (now - collectedAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    const maxAge = getMaxAgeDays(c.code);
    const isStale = ageDays > maxAge;

    return {
      framework: c.framework,
      code: c.code,
      name: c.name,
      description: c.description,
      status: isStale ? ("stale" as const) : ("covered" as const),
      covered: !isStale,
      stale: isStale,
      ageDays,
      lastCollectedAt: collectedAt,
    };
  });

  const total = controls.length;
  const covered = controls.filter((c) => c.status === "covered").length;
  const stale = controls.filter((c) => c.status === "stale").length;
  const missing = controls.filter((c) => c.status === "missing").length;
  const healthy = covered;
  const coveragePercent =
    total > 0 ? Math.round((covered / total) * 100) : 0;

  return {
    controls,
    summary: { total, covered, stale, missing, healthy, coveragePercent },
  };
}
