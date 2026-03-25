import {
  getWorkspaceTimeline,
  getTimelineSummary,
  type TimelineEvent,
} from "@/lib/timeline";
import Link from "next/link";

export const dynamic = "force-dynamic";

function isPrismaTableMissing(e: unknown): boolean {
  return (
    e != null &&
    typeof e === "object" &&
    "code" in e &&
    (e as { code: string }).code === "P2021"
  );
}

async function getData() {
  try {
    const [events, summary] = await Promise.all([
      getWorkspaceTimeline(),
      getTimelineSummary(),
    ]);
    return { schemaReady: true as const, events, summary };
  } catch (e) {
    if (isPrismaTableMissing(e)) {
      return {
        schemaReady: false as const,
        events: [] as TimelineEvent[],
        summary: { recentSnapshots: 0, recentExports: 0, lastSuccessfulRun: null },
      };
    }
    throw e;
  }
}

export default async function TimelinePage() {
  const { schemaReady, events, summary } = await getData();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          className="text-sm text-foreground/40 hover:text-foreground/60"
        >
          &larr; Dashboard
        </Link>
        <h1 className="text-2xl font-bold">Timeline</h1>
        <div />
      </div>

      {!schemaReady ? (
        <div className="rounded-lg border border-yellow-400/30 bg-yellow-50 px-6 py-4 text-center dark:bg-yellow-950/20">
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            Database schema is not initialized yet.
          </p>
        </div>
      ) : (
        <>
          <Summary summary={summary} />

          {events.length === 0 ? (
            <div className="rounded-lg border border-foreground/10 p-6 text-center text-sm text-foreground/40">
              No compliance activity recorded yet.
            </div>
          ) : (
            <div className="relative space-y-0">
              {/* Vertical line */}
              <div className="absolute left-[15px] top-2 bottom-2 w-px bg-foreground/10" />

              {events.map((event) => (
                <TimelineRow key={event.id} event={event} />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function Summary({
  summary,
}: {
  summary: { recentSnapshots: number; recentExports: number; lastSuccessfulRun: Date | null };
}) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="rounded-lg border border-foreground/10 p-4 text-center">
        <div className="text-2xl font-bold">{summary.recentSnapshots}</div>
        <div className="text-xs text-foreground/40">Snapshots (30d)</div>
      </div>
      <div className="rounded-lg border border-foreground/10 p-4 text-center">
        <div className="text-2xl font-bold">{summary.recentExports}</div>
        <div className="text-xs text-foreground/40">Exports (30d)</div>
      </div>
      <div className="rounded-lg border border-foreground/10 p-4 text-center">
        <div className="text-xs text-foreground/40">Last scheduled run</div>
        <div className="mt-1 text-sm font-medium">
          {summary.lastSuccessfulRun
            ? summary.lastSuccessfulRun.toLocaleDateString()
            : "—"}
        </div>
      </div>
    </div>
  );
}

const KIND_DOT: Record<string, string> = {
  snapshot: "bg-blue-500",
  export: "bg-purple-500",
  schedule: "bg-amber-500",
};

const KIND_LABEL: Record<string, string> = {
  snapshot: "Evidence",
  export: "Export",
  schedule: "Schedule",
};

function TimelineRow({ event }: { event: TimelineEvent }) {
  return (
    <div className="relative flex gap-4 py-3 pl-1">
      {/* Dot */}
      <div
        className={`relative z-10 mt-1.5 h-[10px] w-[10px] shrink-0 rounded-full ring-2 ring-background ${KIND_DOT[event.kind] ?? "bg-foreground/30"}`}
      />

      {/* Content */}
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
          {event.description && (
            <span className="truncate">{event.description}</span>
          )}
        </div>
      </div>
    </div>
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
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {status}
    </span>
  );
}
