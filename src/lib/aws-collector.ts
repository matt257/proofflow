import { CloudTrailClient, DescribeTrailsCommand, GetTrailStatusCommand } from "@aws-sdk/client-cloudtrail";
import { db } from "@/lib/db";
import { ensureAllControls } from "@/lib/controls";

export type AWSMonitoringResult = {
  cloudTrailEnabled: boolean;
  trailCount: number;
  multiRegion: boolean;
  region: string;
  trails: {
    name: string;
    isMultiRegion: boolean;
    isLogging: boolean;
    s3BucketName: string | null;
    homeRegion: string | null;
  }[];
  collectorVersion: number;
};

/** Collect AWS CloudTrail monitoring evidence and store as a snapshot. */
export async function collectAWSMonitoringEvidence() {
  const integration = await db.integration.findFirst({
    where: { provider: "aws" },
    select: { id: true, workspaceId: true, metadata: true },
  });

  if (!integration?.metadata) {
    throw new Error("No AWS integration found");
  }

  const meta = integration.metadata as Record<string, string>;
  const { accessKeyId, secretAccessKey, region } = meta;

  if (!accessKeyId || !secretAccessKey || !region) {
    throw new Error("AWS credentials incomplete");
  }

  const client = new CloudTrailClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  try {
    const describeRes = await client.send(new DescribeTrailsCommand({}));
    const rawTrails = describeRes.trailList ?? [];

    const trails: AWSMonitoringResult["trails"] = [];
    for (const t of rawTrails) {
      let isLogging = false;
      try {
        const statusRes = await client.send(
          new GetTrailStatusCommand({ Name: t.TrailARN ?? t.Name }),
        );
        isLogging = statusRes.IsLogging ?? false;
      } catch {
        // status check failed — assume not logging
      }

      trails.push({
        name: t.Name ?? "unknown",
        isMultiRegion: t.IsMultiRegionTrail ?? false,
        isLogging,
        s3BucketName: t.S3BucketName ?? null,
        homeRegion: t.HomeRegion ?? null,
      });
    }

    const result: AWSMonitoringResult = {
      cloudTrailEnabled: trails.some((t) => t.isLogging),
      trailCount: trails.length,
      multiRegion: trails.some((t) => t.isMultiRegion && t.isLogging),
      region,
      trails,
      collectorVersion: 1,
    };

    const snapshot = await db.evidenceSnapshot.create({
      data: {
        workspaceId: integration.workspaceId,
        integrationId: integration.id,
        type: "aws_monitoring",
        status: "succeeded",
        data: JSON.parse(JSON.stringify(result)),
      },
    });

    // Map to CC7.1
    await ensureAllControls();
    const cc71 = await db.control.findUnique({
      where: { framework_code: { framework: "SOC2", code: "CC7.1" } },
      select: { id: true },
    });
    if (cc71) {
      await db.evidenceControlMapping.upsert({
        where: { snapshotId_controlId: { snapshotId: snapshot.id, controlId: cc71.id } },
        create: { snapshotId: snapshot.id, controlId: cc71.id },
        update: {},
      });
    }

    return snapshot;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";

    await db.evidenceSnapshot.create({
      data: {
        workspaceId: integration.workspaceId,
        integrationId: integration.id,
        type: "aws_monitoring",
        status: "failed",
        data: { error: message },
      },
    });

    throw e;
  }
}
