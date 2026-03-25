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
  source?: "snapshot" | "upload";
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

  // Fetch latest manual upload per control code
  let uploads: { controlCode: string; createdAt: Date }[] = [];
  try {
    uploads = await db.evidenceUpload.findMany({
      orderBy: { createdAt: "desc" },
      select: { controlCode: true, createdAt: true },
    });
  } catch {
    // table may not exist yet
  }
  const latestUploadByCode = new Map<string, Date>();
  for (const u of uploads) {
    if (!latestUploadByCode.has(u.controlCode)) {
      latestUploadByCode.set(u.controlCode, u.createdAt);
    }
  }

  const now = Date.now();

  const controls: ControlStatus[] = allControls.map((c) => {
    const latestMapping = c.mappings[0];
    const snapshotDate = latestMapping?.snapshot.collectedAt ?? null;
    const uploadDate = latestUploadByCode.get(c.code) ?? null;

    // Pick the most recent evidence date
    let collectedAt: Date | null = null;
    let source: "snapshot" | "upload" | undefined;
    if (snapshotDate && uploadDate) {
      if (snapshotDate >= uploadDate) {
        collectedAt = snapshotDate;
        source = "snapshot";
      } else {
        collectedAt = uploadDate;
        source = "upload";
      }
    } else if (snapshotDate) {
      collectedAt = snapshotDate;
      source = "snapshot";
    } else if (uploadDate) {
      collectedAt = uploadDate;
      source = "upload";
    }

    if (!collectedAt) {
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
      source,
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
