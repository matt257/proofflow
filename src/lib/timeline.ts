import { db } from "@/lib/db";

export type TimelineEvent = {
  id: string;
  kind: "snapshot" | "export" | "schedule";
  timestamp: Date;
  title: string;
  status?: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

const SNAPSHOT_TITLES: Record<string, string> = {
  github_access_review: "GitHub access review collected",
  github_org_access_review: "GitHub org access review collected",
};

const EXPORT_TITLES: Record<string, string> = {
  github_access_review_csv: "Access review CSV exported",
  github_org_access_review_csv: "Org access review CSV exported",
  evidence_pack: "Evidence pack exported",
};

/** Build a reverse-chronological timeline from existing data. */
export async function getWorkspaceTimeline(): Promise<TimelineEvent[]> {
  const [snapshots, exports, schedules] = await Promise.all([
    db.evidenceSnapshot.findMany({
      orderBy: { collectedAt: "desc" },
      take: 50,
      select: {
        id: true,
        type: true,
        status: true,
        collectedAt: true,
        controls: {
          select: {
            control: { select: { framework: true, code: true } },
          },
        },
      },
    }),
    db.export.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        type: true,
        status: true,
        fileName: true,
        createdAt: true,
      },
    }),
    db.schedule.findMany({
      where: { lastRunAt: { not: null } },
      select: {
        id: true,
        type: true,
        lastRunAt: true,
        lastStatus: true,
        lastError: true,
      },
    }),
  ]);

  const events: TimelineEvent[] = [];

  for (const s of snapshots) {
    const controls = s.controls.map(
      (c) => `${c.control.framework} ${c.control.code}`,
    );
    events.push({
      id: `snapshot-${s.id}`,
      kind: "snapshot",
      timestamp: s.collectedAt,
      title: SNAPSHOT_TITLES[s.type] ?? `${s.type} collected`,
      status: s.status,
      description: controls.length
        ? `Supports: ${controls.join(", ")}`
        : undefined,
    });
  }

  for (const e of exports) {
    events.push({
      id: `export-${e.id}`,
      kind: "export",
      timestamp: e.createdAt,
      title: EXPORT_TITLES[e.type] ?? `${e.type} exported`,
      status: e.status,
      description: e.fileName ?? undefined,
    });
  }

  for (const s of schedules) {
    if (!s.lastRunAt) continue;
    events.push({
      id: `schedule-${s.id}`,
      kind: "schedule",
      timestamp: s.lastRunAt,
      title: "Scheduled collection ran",
      status: s.lastStatus ?? undefined,
      description: s.lastError ?? undefined,
      metadata: { type: s.type },
    });
  }

  events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return events;
}

/** Compute lightweight summary stats for the timeline header. */
export async function getTimelineSummary() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [snapshotCount, exportCount, lastSchedule] = await Promise.all([
    db.evidenceSnapshot.count({
      where: { collectedAt: { gte: thirtyDaysAgo } },
    }),
    db.export.count({
      where: { createdAt: { gte: thirtyDaysAgo } },
    }),
    db.schedule.findFirst({
      where: { lastRunAt: { not: null }, lastStatus: "succeeded" },
      orderBy: { lastRunAt: "desc" },
      select: { lastRunAt: true },
    }),
  ]);

  return {
    recentSnapshots: snapshotCount,
    recentExports: exportCount,
    lastSuccessfulRun: lastSchedule?.lastRunAt ?? null,
  };
}
