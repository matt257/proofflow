import { db } from "@/lib/db";
import {
  getControlCoverage,
  getMaxAgeDays,
  type CoverageResult,
  type ControlStatus,
} from "@/lib/control-coverage";
import {
  getControlGuidance,
} from "@/lib/control-guidance";
import {
  computeAuditReadiness,
  type AuditReadiness,
} from "@/lib/audit-readiness";
import {
  getWorkspaceTimeline,
  type TimelineEvent,
} from "@/lib/timeline";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

async function validateToken(token: string) {
  const link = await db.shareLink.findUnique({ where: { token } });
  if (!link) return null;
  if (link.expiresAt && link.expiresAt < new Date()) return null;
  return link;
}

async function getShareData() {
  let coverage: CoverageResult | null = null;
  try {
    coverage = await getControlCoverage();
  } catch {
    // best-effort
  }

  let timeline: TimelineEvent[] = [];
  try {
    timeline = await getWorkspaceTimeline();
  } catch {
    // best-effort
  }

  const readiness = coverage ? computeAuditReadiness(coverage) : null;

  return { coverage, readiness, timeline };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const link = await validateToken(token);
  if (!link) notFound();

  const { coverage, readiness, timeline } = await getShareData();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-8">
      {/* Banner */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-5 py-3 text-center dark:border-blue-900/30 dark:bg-blue-900/10">
        <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
          Auditor View — Read Only
        </p>
        {link.expiresAt && (
          <p className="text-xs text-blue-600 dark:text-blue-400">
            This link expires {link.expiresAt.toLocaleDateString()}
          </p>
        )}
      </div>

      <h1 className="text-2xl font-bold">Compliance Overview</h1>

      {readiness && <ReadinessSection readiness={readiness} />}
      {coverage && <CoverageSection coverage={coverage} />}
      {timeline.length > 0 && <TimelineSection events={timeline.slice(0, 20)} />}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

const READINESS_STYLES: Record<string, { border: string; bg: string; dot: string; title: string; titleColor: string }> = {
  ready: {
    border: "border-green-200 dark:border-green-900/30",
    bg: "bg-green-50 dark:bg-green-900/10",
    dot: "bg-green-500",
    title: "Audit Ready",
    titleColor: "text-green-700 dark:text-green-400",
  },
  at_risk: {
    border: "border-yellow-300 dark:border-yellow-900/30",
    bg: "bg-yellow-50 dark:bg-yellow-900/10",
    dot: "bg-yellow-500",
    title: "At Risk",
    titleColor: "text-yellow-700 dark:text-yellow-400",
  },
  not_ready: {
    border: "border-red-200 dark:border-red-900/30",
    bg: "bg-red-50 dark:bg-red-900/10",
    dot: "bg-red-500",
    title: "Not Audit Ready",
    titleColor: "text-red-700 dark:text-red-400",
  },
};

function ReadinessSection({ readiness }: { readiness: AuditReadiness }) {
  const style = READINESS_STYLES[readiness.status]!;
  const blockingCodes = readiness.blockingControls.map((c) => `${c.framework} ${c.code}`);
  const staleCodes = readiness.staleControls.map((c) => `${c.framework} ${c.code}`);

  return (
    <div className={`rounded-lg border ${style.border} ${style.bg} p-5`}>
      <div className="flex items-center gap-3">
        <span className={`inline-block h-3 w-3 rounded-full ${style.dot}`} />
        <h2 className={`text-lg font-bold ${style.titleColor}`}>{style.title}</h2>
      </div>
      <p className="mt-1.5 text-sm text-foreground/60">{readiness.summary}</p>
      {blockingCodes.length > 0 && (
        <p className="mt-2 text-xs text-foreground/40">
          <span className="font-semibold text-foreground/50">Missing evidence: </span>
          {blockingCodes.join(", ")}
        </p>
      )}
      {staleCodes.length > 0 && (
        <p className="mt-1 text-xs text-foreground/40">
          <span className="font-semibold text-foreground/50">Stale evidence: </span>
          {staleCodes.join(", ")}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coverage (read-only — no action buttons)
// ---------------------------------------------------------------------------

function CoverageSection({ coverage }: { coverage: CoverageResult }) {
  const { summary, controls } = coverage;
  const covered = controls.filter((c) => c.status === "covered");
  const stale = controls.filter((c) => c.status === "stale");
  const missing = controls.filter((c) => c.status === "missing");

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Compliance Coverage</h2>

      <div className="rounded-lg border border-foreground/10 p-5">
        <div className="flex items-center gap-6">
          <div className="text-4xl font-bold">{summary.coveragePercent}%</div>
          <div className="space-y-1.5 text-sm">
            <div className="flex gap-4 text-foreground/60">
              <span className="text-green-600">{summary.covered} healthy</span>
              {summary.stale > 0 && <span className="text-yellow-600">{summary.stale} stale</span>}
              {summary.missing > 0 && <span className="text-red-500">{summary.missing} missing</span>}
            </div>
            <div className="h-2 w-48 overflow-hidden rounded-full bg-foreground/10">
              <div className="flex h-full">
                <div className="h-full bg-green-500" style={{ width: `${(summary.covered / summary.total) * 100}%` }} />
                <div className="h-full bg-yellow-400" style={{ width: `${(summary.stale / summary.total) * 100}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {covered.length > 0 && (
          <div className="space-y-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-green-600">Covered ({covered.length})</h3>
              <p className="text-xs text-foreground/30">Evidence is current</p>
            </div>
            <div className="space-y-2">
              {covered.map((c) => <ControlCard key={c.code} control={c} variant="covered" />)}
            </div>
          </div>
        )}
        {stale.length > 0 && (
          <div className="space-y-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-yellow-600">Stale ({stale.length})</h3>
              <p className="text-xs text-foreground/30">Evidence exists but is out of date</p>
            </div>
            <div className="space-y-2">
              {stale.map((c) => <ControlCard key={c.code} control={c} variant="stale" />)}
            </div>
          </div>
        )}
        {missing.length > 0 && (
          <div className="space-y-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-red-500">Missing ({missing.length})</h3>
              <p className="text-xs text-foreground/30">No evidence collected yet</p>
            </div>
            <div className="space-y-2">
              {missing.map((c) => <ControlCard key={c.code} control={c} variant="missing" />)}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

const VARIANT_STYLES = {
  covered: { border: "border-green-200 dark:border-green-900/30", bg: "bg-green-50 dark:bg-green-900/10", dot: "bg-green-500" },
  stale: { border: "border-yellow-300 dark:border-yellow-900/30", bg: "bg-yellow-50 dark:bg-yellow-900/10", dot: "bg-yellow-500" },
  missing: { border: "border-red-200 dark:border-red-900/30", bg: "bg-red-50 dark:bg-red-900/10", dot: "bg-red-400" },
};

function ControlCard({ control: c, variant }: { control: ControlStatus; variant: "covered" | "stale" | "missing" }) {
  const guidance = getControlGuidance(c.code);
  const s = VARIANT_STYLES[variant];

  return (
    <div className={`rounded-lg border ${s.border} ${s.bg} px-4 py-3`}>
      <div className="flex items-start gap-2">
        <span className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium">{c.framework} {c.code}</p>
          <p className="text-xs text-foreground/50">{c.name}</p>
          {guidance && <p className="text-xs italic text-foreground/40">{guidance.purpose}</p>}

          {variant === "covered" && (
            <>
              <p className="text-xs text-green-700 dark:text-green-400">
                Covered — recent {guidance?.evidenceSource ?? "evidence"} was collected
                {c.lastCollectedAt && <> on {c.lastCollectedAt.toLocaleDateString()}</>}.
              </p>
            </>
          )}

          {variant === "stale" && (
            <p className="text-xs text-yellow-700 dark:text-yellow-400">
              Evidence exists but is older than the freshness requirement.
              Last collected {c.ageDays}d ago (required every {getMaxAgeDays(c.code)} days).
            </p>
          )}

          {variant === "missing" && guidance && (
            <p className="text-xs text-foreground/40">
              Needs: {guidance.evidenceRequirement}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline (read-only)
// ---------------------------------------------------------------------------

const KIND_DOT: Record<string, string> = { snapshot: "bg-blue-500", export: "bg-purple-500", schedule: "bg-amber-500" };
const KIND_LABEL: Record<string, string> = { snapshot: "Evidence", export: "Export", schedule: "Schedule" };

function TimelineSection({ events }: { events: TimelineEvent[] }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Activity Timeline</h2>
      <div className="relative space-y-0">
        <div className="absolute left-[15px] top-2 bottom-2 w-px bg-foreground/10" />
        {events.map((event) => (
          <div key={event.id} className="relative flex gap-4 py-3 pl-1">
            <div className={`relative z-10 mt-1.5 h-[10px] w-[10px] shrink-0 rounded-full ring-2 ring-background ${KIND_DOT[event.kind] ?? "bg-foreground/30"}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{event.title}</span>
                {event.status && <StatusBadge status={event.status} />}
                <span className="ml-auto shrink-0 text-xs text-foreground/30">
                  {event.timestamp.toLocaleString()}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-foreground/40">
                <span className="rounded bg-foreground/5 px-1.5 py-0.5 font-medium">
                  {KIND_LABEL[event.kind] ?? event.kind}
                </span>
                {event.description && <span className="truncate">{event.description}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "succeeded"
      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
      : status === "failed"
        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
        : "bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{status}</span>
  );
}
