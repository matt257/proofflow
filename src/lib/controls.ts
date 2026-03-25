import { db } from "@/lib/db";

/** Full control catalog — the universe of controls ProofFlow tracks. */
export const CONTROL_CATALOG = [
  {
    framework: "SOC2",
    code: "CC6.1",
    name: "Logical access controls",
    description:
      "The entity implements logical access security software, infrastructure, and architectures over protected information assets.",
  },
  {
    framework: "SOC2",
    code: "CC6.2",
    name: "User access review",
    description:
      "Prior to issuing system credentials and granting system access, the entity registers and authorizes new internal and external users.",
  },
  {
    framework: "SOC2",
    code: "CC6.3",
    name: "Role-based access",
    description:
      "The entity authorizes, modifies, or removes access to data, software, functions, and other protected information assets based on roles.",
  },
  {
    framework: "SOC2",
    code: "CC7.1",
    name: "Monitoring",
    description:
      "The entity monitors system components and the operation of those components for anomalies.",
  },
  {
    framework: "SOC2",
    code: "CC8.1",
    name: "Change management",
    description:
      "The entity authorizes, designs, develops or acquires, configures, documents, tests, approves, and implements changes to infrastructure, data, software, and procedures.",
  },
] as const;

/** Subset of controls that github_org_access_review evidence covers. */
export const ORG_ACCESS_REVIEW_CONTROLS = CONTROL_CATALOG.filter((c) =>
  ["CC6.1", "CC6.2", "CC6.3", "CC8.1"].includes(c.code),
);

/** Ensure all catalog controls exist in the DB. */
export async function ensureAllControls() {
  for (const c of CONTROL_CATALOG) {
    await db.control.upsert({
      where: { framework_code: { framework: c.framework, code: c.code } },
      create: c,
      update: {},
    });
  }
}

/** Ensure the org access review controls exist and return their IDs. */
export async function ensureControls(): Promise<string[]> {
  const ids: string[] = [];
  for (const c of ORG_ACCESS_REVIEW_CONTROLS) {
    const control = await db.control.upsert({
      where: {
        framework_code: { framework: c.framework, code: c.code },
      },
      create: c,
      update: {},
      select: { id: true },
    });
    ids.push(control.id);
  }
  return ids;
}

/** Map a snapshot to the org access review controls.
 *  If the snapshot contains PR data (v4+), also map CC8.1. */
export async function mapSnapshotToControls(snapshotId: string) {
  const controlIds = await ensureControls();
  for (const controlId of controlIds) {
    await db.evidenceControlMapping.upsert({
      where: {
        snapshotId_controlId: { snapshotId, controlId },
      },
      create: { snapshotId, controlId },
      update: {},
    });
  }

  // Check if snapshot has PR data → also map CC8.1
  const snapshot = await db.evidenceSnapshot.findUnique({
    where: { id: snapshotId },
    select: { data: true },
  });
  const data = (snapshot?.data ?? {}) as Record<string, unknown>;
  const orgs = Array.isArray(data.orgs) ? (data.orgs as Record<string, unknown>[]) : [];
  const hasPRs = orgs.some((o) => Array.isArray(o.pullRequests) && (o.pullRequests as unknown[]).length > 0);

  if (hasPRs) {
    await ensureAllControls();
    const cc81 = await db.control.findUnique({
      where: { framework_code: { framework: "SOC2", code: "CC8.1" } },
      select: { id: true },
    });
    if (cc81) {
      await db.evidenceControlMapping.upsert({
        where: { snapshotId_controlId: { snapshotId, controlId: cc81.id } },
        create: { snapshotId, controlId: cc81.id },
        update: {},
      });
    }
  }
}

/** Format control codes for display. */
export function controlLabel(): string {
  return ORG_ACCESS_REVIEW_CONTROLS.map(
    (c) => `${c.framework} ${c.code}`,
  ).join(", ");
}
