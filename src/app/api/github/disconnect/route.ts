import { db } from "@/lib/db";
import { redirect } from "next/navigation";

export async function POST() {
  try {
    const integration = await db.integration.findFirst({
      where: { provider: "github" },
      select: { id: true },
    });

    if (integration) {
      await db.integration.delete({ where: { id: integration.id } });
      console.log("[github] Integration disconnected (evidence retained)");
    }
  } catch (e) {
    console.error("GitHub disconnect failed:", e);
  }

  redirect("/dashboard");
}
