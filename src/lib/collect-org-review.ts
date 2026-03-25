import { db } from "@/lib/db";
import { fetchGitHubOrgAccessReview } from "@/lib/github-api";
import { mapSnapshotToControls } from "@/lib/controls";

/**
 * Run a GitHub org access review collection.
 * Returns the created snapshot, or throws on infrastructure errors.
 */
export async function collectOrgAccessReview() {
  const integration = await db.integration.findFirst({
    where: { provider: "github" },
    select: { id: true, workspaceId: true, accessToken: true },
  });

  if (!integration || !integration.accessToken) {
    throw new Error("No GitHub integration found");
  }

  try {
    const data = await fetchGitHubOrgAccessReview(integration.accessToken);

    const snapshot = await db.evidenceSnapshot.create({
      data: {
        workspaceId: integration.workspaceId,
        integrationId: integration.id,
        type: "github_org_access_review",
        status: "succeeded",
        data: JSON.parse(JSON.stringify(data)),
      },
    });

    await mapSnapshotToControls(snapshot.id);
    return snapshot;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";

    await db.evidenceSnapshot.create({
      data: {
        workspaceId: integration.workspaceId,
        integrationId: integration.id,
        type: "github_org_access_review",
        status: "failed",
        data: { error: message },
      },
    });

    throw e;
  }
}
