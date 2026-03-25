import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import {
  computeAuditReadiness,
  type AuditReadiness,
} from "@/lib/audit-readiness";
import { getControlCoverage, getMaxAgeDays } from "@/lib/control-coverage";
import type { RemediationResult } from "@/lib/scheduler";

const RATE_LIMIT_MS = 24 * 60 * 60 * 1000; // 24 hours

const APP_URL = process.env.APP_URL ?? "https://proofflow.vercel.app";

/**
 * Send compliance notifications based on current state.
 * Rate-limited to one email per preference per 24h.
 */
export async function sendComplianceNotifications(
  remediation: RemediationResult[],
): Promise<number> {
  let prefs;
  try {
    prefs = await db.notificationPreference.findMany({
      where: { enabled: true },
    });
  } catch {
    // Table may not exist yet
    return 0;
  }

  if (prefs.length === 0) return 0;

  // Rate-limit check
  const now = new Date();
  const eligible = prefs.filter(
    (p) => !p.lastSentAt || now.getTime() - p.lastSentAt.getTime() >= RATE_LIMIT_MS,
  );
  if (eligible.length === 0) {
    console.log("[notify] All recipients rate-limited, skipping");
    return 0;
  }

  // Compute current state
  let readiness: AuditReadiness;
  try {
    const coverage = await getControlCoverage();
    readiness = computeAuditReadiness(coverage);
  } catch {
    console.log("[notify] Could not compute readiness, skipping notifications");
    return 0;
  }

  // Determine which notification to send
  const succeeded = remediation.filter((r) => r.status === "succeeded");
  const { subject, body } = buildEmail(readiness, succeeded);

  // Nothing noteworthy
  if (!subject) return 0;

  let sent = 0;
  for (const pref of eligible) {
    const ok = await sendEmail({ to: pref.email, subject, text: body });
    if (ok) {
      sent++;
      await db.notificationPreference.update({
        where: { id: pref.id },
        data: { lastSentAt: now },
      });
    }
  }

  console.log(`[notify] Sent ${sent} notification(s)`);
  return sent;
}

function buildEmail(
  readiness: AuditReadiness,
  succeeded: RemediationResult[],
): { subject: string; body: string } {
  const lines: string[] = ["Your compliance status has changed.", ""];

  // Auto-remediation success
  if (succeeded.length > 0) {
    const codes = [...new Set(succeeded.map((r) => r.controlCode))];
    const subject = "Evidence automatically refreshed";
    lines.push("Auto-refreshed controls:");
    for (const code of codes) {
      lines.push(`  - ${code}`);
    }
    lines.push("");

    if (readiness.status === "pass") {
      lines.push("All controls now have current evidence.");
    }

    lines.push("", `Visit dashboard: ${APP_URL}/dashboard`);
    return { subject, body: lines.join("\n") };
  }

  // Fail
  if (readiness.status === "fail") {
    const subject = "Compliance alert: you will fail an audit";
    lines.push("Missing controls (will cause audit failure):");
    for (const c of readiness.blockingControls) {
      lines.push(`  - ${c.framework} ${c.code} — ${c.name}`);
    }
    if (readiness.fixPlan.length > 0) {
      lines.push("", "Fix plan:");
      for (const item of readiness.fixPlan) {
        lines.push(`  - ${item.control}: ${item.title}`);
      }
    }
    lines.push("", `Visit dashboard: ${APP_URL}/dashboard`);
    return { subject, body: lines.join("\n") };
  }

  // At risk (stale only)
  if (readiness.status === "at_risk") {
    const subject = "Compliance alert: evidence is out of date";
    lines.push("Stale controls (may fail audit):");
    for (const c of readiness.staleControls) {
      const maxAge = getMaxAgeDays(c.code);
      lines.push(
        `  - ${c.framework} ${c.code} — last updated ${c.ageDays}d ago (required every ${maxAge}d)`,
      );
    }
    if (readiness.fixPlan.length > 0) {
      lines.push("", "Fix plan:");
      for (const item of readiness.fixPlan) {
        lines.push(`  - ${item.control}: ${item.title}`);
      }
    }
    lines.push("", `Visit dashboard: ${APP_URL}/dashboard`);
    return { subject, body: lines.join("\n") };
  }

  // Pass — no notification needed
  return { subject: "", body: "" };
}
