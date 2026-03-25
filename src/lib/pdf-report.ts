import PDFDocument from "pdfkit";
import { db } from "@/lib/db";
import { getControlCoverage, getMaxAgeDays } from "@/lib/control-coverage";
import { computeAuditReadiness } from "@/lib/audit-readiness";
import { getControlGuidance } from "@/lib/control-guidance";
import { analyzeOrgAccessReview, type Finding } from "@/lib/access-analysis";
import { getWorkspaceTimeline } from "@/lib/timeline";

const COLOR_GREEN = "#16a34a";
const COLOR_YELLOW = "#ca8a04";
const COLOR_RED = "#dc2626";
const COLOR_GRAY = "#6b7280";

/** Generate a PDF audit report and return it as a Buffer. */
export async function generateAuditPDF(): Promise<Buffer> {
  // Gather data
  const coverage = await getControlCoverage();
  const readiness = computeAuditReadiness(coverage);

  const orgSnapshot = await db.evidenceSnapshot.findFirst({
    where: { type: "github_org_access_review", status: "succeeded" },
    orderBy: { collectedAt: "desc" },
    select: { collectedAt: true, data: true },
  });

  let findings: Finding[] = [];
  let orgData: Record<string, unknown> | null = null;
  if (orgSnapshot) {
    orgData = orgSnapshot.data as Record<string, unknown>;
    findings = analyzeOrgAccessReview(orgData);
  }

  let timeline: Awaited<ReturnType<typeof getWorkspaceTimeline>> = [];
  try {
    timeline = await getWorkspaceTimeline();
  } catch {
    // best-effort
  }

  const workspace = await db.workspace.findFirst({ select: { name: true } });

  // Build PDF
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // -----------------------------------------------------------------------
  // Title page
  // -----------------------------------------------------------------------
  doc.moveDown(6);
  doc.fontSize(28).font("Helvetica-Bold").text("ProofFlow Audit Report", { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(14).font("Helvetica").fillColor(COLOR_GRAY).text(today, { align: "center" });
  if (workspace?.name) {
    doc.moveDown(0.3);
    doc.fontSize(12).text(workspace.name, { align: "center" });
  }
  doc.fillColor("#000000");

  // -----------------------------------------------------------------------
  // Audit Readiness Summary
  // -----------------------------------------------------------------------
  doc.addPage();
  sectionTitle(doc, "1. Audit Readiness Summary");

  const statusLabel =
    readiness.status === "pass" ? "PASS" :
    readiness.status === "at_risk" ? "AT RISK" : "FAIL";
  const statusColor =
    readiness.status === "pass" ? COLOR_GREEN :
    readiness.status === "at_risk" ? COLOR_YELLOW : COLOR_RED;

  doc.fontSize(18).font("Helvetica-Bold").fillColor(statusColor).text(statusLabel);
  doc.fillColor("#000000");
  doc.moveDown(0.3);
  doc.fontSize(11).font("Helvetica").text(readiness.summary);

  if (readiness.blockingControls.length > 0) {
    doc.moveDown(0.5);
    doc.fontSize(10).font("Helvetica-Bold").text("Blocking controls (no evidence):");
    doc.font("Helvetica");
    for (const c of readiness.blockingControls) {
      doc.text(`  • ${c.framework} ${c.code} — ${c.name}`, { indent: 10 });
    }
  }

  if (readiness.staleControls.length > 0) {
    doc.moveDown(0.5);
    doc.fontSize(10).font("Helvetica-Bold").text("Stale controls:");
    doc.font("Helvetica");
    for (const c of readiness.staleControls) {
      doc.text(`  • ${c.framework} ${c.code} — last collected ${c.ageDays}d ago (max ${getMaxAgeDays(c.code)}d)`, { indent: 10 });
    }
  }

  if (readiness.fixPlan.length > 0) {
    doc.moveDown(0.5);
    doc.fontSize(10).font("Helvetica-Bold").text("Fix plan:");
    doc.font("Helvetica");
    for (const item of readiness.fixPlan) {
      doc.text(`  ${item.control}: ${item.title} — ${item.reason}`, { indent: 10 });
    }
  }

  // -----------------------------------------------------------------------
  // Compliance Coverage
  // -----------------------------------------------------------------------
  doc.addPage();
  sectionTitle(doc, "2. Compliance Coverage");

  doc.fontSize(11).font("Helvetica")
    .text(`Overall coverage: ${coverage.summary.coveragePercent}% (${coverage.summary.covered} of ${coverage.summary.total} controls)`);
  doc.moveDown(0.5);

  // Table header
  const tableLeft = 50;
  const colWidths = [100, 160, 80, 100];
  let y = doc.y;

  doc.fontSize(9).font("Helvetica-Bold");
  doc.text("Control", tableLeft, y, { width: colWidths[0] });
  doc.text("Name", tableLeft + colWidths[0], y, { width: colWidths[1] });
  doc.text("Status", tableLeft + colWidths[0] + colWidths[1], y, { width: colWidths[2] });
  doc.text("Last Collected", tableLeft + colWidths[0] + colWidths[1] + colWidths[2], y, { width: colWidths[3] });

  y = doc.y + 4;
  doc.moveTo(tableLeft, y).lineTo(tableLeft + colWidths.reduce((a, b) => a + b, 0), y).stroke();
  y += 6;

  doc.font("Helvetica").fontSize(9);
  for (const c of coverage.controls) {
    if (y > 750) {
      doc.addPage();
      y = 50;
    }

    const statusColorCell =
      c.status === "covered" ? COLOR_GREEN :
      c.status === "stale" ? COLOR_YELLOW : COLOR_RED;

    doc.fillColor("#000000").text(`${c.framework} ${c.code}`, tableLeft, y, { width: colWidths[0] });
    doc.text(c.name, tableLeft + colWidths[0], y, { width: colWidths[1] });
    doc.fillColor(statusColorCell).text(c.status, tableLeft + colWidths[0] + colWidths[1], y, { width: colWidths[2] });
    doc.fillColor("#000000").text(
      c.lastCollectedAt ? c.lastCollectedAt.toLocaleDateString() : "—",
      tableLeft + colWidths[0] + colWidths[1] + colWidths[2], y, { width: colWidths[3] },
    );

    y += 18;
  }

  doc.y = y;

  // Control details
  doc.moveDown(1);
  doc.fontSize(10).font("Helvetica-Bold").fillColor("#000000").text("Control Details");
  doc.moveDown(0.3);

  for (const c of coverage.controls) {
    const guidance = getControlGuidance(c.code);
    if (!guidance) continue;

    doc.fontSize(9).font("Helvetica-Bold").text(`${c.framework} ${c.code} — ${c.name}`);
    doc.font("Helvetica").fillColor(COLOR_GRAY).text(guidance.purpose);
    doc.fillColor("#000000").text(`Evidence required: ${guidance.evidenceRequirement}`);
    doc.moveDown(0.4);
  }

  // -----------------------------------------------------------------------
  // Evidence Summary
  // -----------------------------------------------------------------------
  doc.addPage();
  sectionTitle(doc, "3. Evidence Summary");

  if (orgSnapshot && orgData) {
    doc.fontSize(11).font("Helvetica")
      .text(`Latest GitHub org access review: ${orgSnapshot.collectedAt.toLocaleDateString()}`);
    doc.moveDown(0.3);

    const orgs = Array.isArray(orgData.orgs) ? orgData.orgs : [];
    for (const raw of orgs) {
      const entry = (raw ?? {}) as Record<string, unknown>;
      const org = (entry.org ?? {}) as Record<string, unknown>;
      const members = Array.isArray(entry.members) ? entry.members : [];
      const admins = members.filter((m: Record<string, unknown>) => String(m.role) === "admin");

      doc.fontSize(10).font("Helvetica-Bold").text(`Organization: ${String(org.login ?? "unknown")}`);
      doc.font("Helvetica").text(`  Total members: ${members.length}`);
      doc.text(`  Admins: ${admins.length}`);
      doc.moveDown(0.3);
    }
  } else {
    doc.fontSize(11).font("Helvetica").text("No organization access review evidence available.");
  }

  // Manual uploads
  let manualUploads: { controlCode: string; title: string; content: string; createdAt: Date }[] = [];
  try {
    manualUploads = await db.evidenceUpload.findMany({
      orderBy: { createdAt: "desc" },
      select: { controlCode: true, title: true, content: true, createdAt: true },
    });
  } catch {
    // table may not exist
  }

  if (manualUploads.length > 0) {
    doc.moveDown(1);
    doc.fontSize(12).font("Helvetica-Bold").text("Manual Evidence Uploads");
    doc.moveDown(0.3);
    doc.fontSize(9).font("Helvetica");
    for (const u of manualUploads) {
      doc.font("Helvetica-Bold").text(`${u.controlCode} — ${u.title} (${u.createdAt.toLocaleDateString()})`);
      doc.font("Helvetica").fillColor(COLOR_GRAY).text(u.content.slice(0, 500));
      doc.fillColor("#000000").moveDown(0.3);
    }
  }

  // AWS Monitoring
  const awsSnapshot = await db.evidenceSnapshot.findFirst({
    where: { type: "aws_monitoring", status: "succeeded" },
    orderBy: { collectedAt: "desc" },
    select: { collectedAt: true, data: true },
  }).catch(() => null);

  if (awsSnapshot) {
    const aws = awsSnapshot.data as Record<string, unknown>;
    doc.moveDown(1);
    doc.fontSize(12).font("Helvetica-Bold").fillColor("#000000").text("AWS Monitoring (CloudTrail)");
    doc.moveDown(0.3);
    doc.fontSize(10).font("Helvetica");
    doc.text(`Collected: ${awsSnapshot.collectedAt.toLocaleDateString()}`);
    const ctEnabled = Boolean(aws.cloudTrailEnabled);
    doc.text(`CloudTrail enabled: `, { continued: true });
    doc.fillColor(ctEnabled ? COLOR_GREEN : COLOR_RED).text(ctEnabled ? "Yes" : "No");
    doc.fillColor("#000000");
    doc.text(`Trails: ${Number(aws.trailCount ?? 0)}`);
    doc.text(`Multi-region: ${Boolean(aws.multiRegion) ? "Yes" : "No"}`);
    doc.text(`Region: ${String(aws.region ?? "")}`);
  }

  // -----------------------------------------------------------------------
  // Risk Findings
  // -----------------------------------------------------------------------
  if (findings.length > 0) {
    doc.moveDown(1);
    sectionTitle(doc, "4. Risk Findings");

    for (const f of findings) {
      const sevColor = f.severity === "high" ? COLOR_RED : f.severity === "medium" ? COLOR_YELLOW : COLOR_GRAY;
      doc.fontSize(10).font("Helvetica-Bold").fillColor(sevColor)
        .text(`[${f.severity.toUpperCase()}] `, { continued: true })
        .fillColor("#000000").font("Helvetica")
        .text(`${f.message} (${f.orgLogin})`);
      doc.moveDown(0.2);
    }
  }

  // -----------------------------------------------------------------------
  // Timeline
  // -----------------------------------------------------------------------
  const recentTimeline = timeline.slice(0, 10);
  if (recentTimeline.length > 0) {
    doc.addPage();
    sectionTitle(doc, findings.length > 0 ? "5. Activity Timeline" : "4. Activity Timeline");

    doc.fontSize(9).font("Helvetica");
    for (const event of recentTimeline) {
      const statusStr = event.status ? ` (${event.status})` : "";
      doc.text(
        `${event.timestamp.toLocaleDateString()}  ${event.title}${statusStr}`,
      );
      if (event.description) {
        doc.fillColor(COLOR_GRAY).text(`    ${event.description}`).fillColor("#000000");
      }
      doc.moveDown(0.2);
    }
  }

  // -----------------------------------------------------------------------
  // Footer
  // -----------------------------------------------------------------------
  doc.moveDown(2);
  doc.fontSize(8).fillColor(COLOR_GRAY)
    .text(`Generated by ProofFlow on ${today}`, { align: "center" });

  doc.end();
  return done;
}

function sectionTitle(doc: PDFKit.PDFDocument, text: string) {
  doc.fontSize(16).font("Helvetica-Bold").fillColor("#000000").text(text);
  doc.moveDown(0.5);
}
