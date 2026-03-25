import { db } from "@/lib/db";
import { ensureAllControls, CONTROL_CATALOG } from "@/lib/controls";

export type ControlStatus = {
  framework: string;
  code: string;
  name: string;
  description: string | null;
  covered: boolean;
  lastCollectedAt: Date | null;
};

export type CoverageSummary = {
  total: number;
  covered: number;
  missing: number;
  coveragePercent: number;
};

export type CoverageResult = {
  controls: ControlStatus[];
  summary: CoverageSummary;
};

export async function getControlCoverage(): Promise<CoverageResult> {
  // Ensure the full catalog is seeded
  await ensureAllControls();

  // Get all controls from DB
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
            select: { collectedAt: true, status: true },
          },
        },
        orderBy: { snapshot: { collectedAt: "desc" } },
        take: 1,
      },
    },
    orderBy: { code: "asc" },
  });

  const controls: ControlStatus[] = allControls.map((c) => {
    const latestMapping = c.mappings[0];
    const covered = !!latestMapping;
    return {
      framework: c.framework,
      code: c.code,
      name: c.name,
      description: c.description,
      covered,
      lastCollectedAt: covered
        ? latestMapping.snapshot.collectedAt
        : null,
    };
  });

  const total = controls.length;
  const covered = controls.filter((c) => c.covered).length;
  const missing = total - covered;
  const coveragePercent = total > 0 ? Math.round((covered / total) * 100) : 0;

  return {
    controls,
    summary: { total, covered, missing, coveragePercent },
  };
}
