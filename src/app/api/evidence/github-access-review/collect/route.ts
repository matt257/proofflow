import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchGitHubAccessReview } from "@/lib/github-api";

export async function POST() {
  const integration = await db.integration.findFirst({
    where: { provider: "github" },
    select: { id: true, workspaceId: true, accessToken: true },
  });

  if (!integration || !integration.accessToken) {
    return NextResponse.json(
      { error: "No GitHub integration found. Connect GitHub first." },
      { status: 400 },
    );
  }

  try {
    const data = await fetchGitHubAccessReview(integration.accessToken);

    const snapshot = await db.evidenceSnapshot.create({
      data: {
        workspaceId: integration.workspaceId,
        integrationId: integration.id,
        type: "github_access_review",
        status: "succeeded",
        data: JSON.parse(JSON.stringify(data)),
      },
    });

    return NextResponse.json({ snapshot });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";

    const snapshot = await db.evidenceSnapshot.create({
      data: {
        workspaceId: integration.workspaceId,
        integrationId: integration.id,
        type: "github_access_review",
        status: "failed",
        data: { error: message },
      },
    });

    return NextResponse.json({ snapshot, error: message }, { status: 502 });
  }
}
