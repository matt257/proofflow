import { generateAuditPDF } from "@/lib/pdf-report";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const pdf = await generateAuditPDF();
    const date = new Date().toISOString().slice(0, 10);
    const filename = `proofflow-audit-report-${date}.pdf`;

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    console.error("PDF export failed:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
