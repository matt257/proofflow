import { db } from "@/lib/db";

/** Controls that map to github_org_access_review evidence. */
export const ORG_ACCESS_REVIEW_CONTROLS = [
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
] as const;

/** Ensure the seed controls exist in the DB. Returns the control IDs. */
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

/** Map a snapshot to the org access review controls. */
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
}

/** Format control codes for display. */
export function controlLabel(): string {
  return ORG_ACCESS_REVIEW_CONTROLS.map(
    (c) => `${c.framework} ${c.code}`,
  ).join(", ");
}
