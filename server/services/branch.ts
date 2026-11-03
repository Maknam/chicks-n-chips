// Branch settings, the change-revision counter and the audit trail.
import { eq, sql } from "drizzle-orm";
import { auditLogs, branches } from "@/db/schema";
import { DomainError, settingsInput, type Settings } from "@/lib/domain";
import { transaction, type Ctx } from "../context";

export type BranchRow = typeof branches.$inferSelect;

export const toSettings = (b: BranchRow): Settings => ({
  open: b.openHour,
  close: b.closeHour,
  interval: b.slotIntervalMinutes,
  capacity: b.slotCapacity,
  basePrep: b.basePrepMinutes,
});

const NOT_INITIALIZED = "Branch not initialized. Run the database seed first.";

export async function getBranch(c: Ctx) {
  const [row] = await c.db.select().from(branches).where(eq(branches.id, c.branchId));
  if (!row) throw new Error(NOT_INITIALIZED);
  return row;
}

/** Locks the branch row until the transaction ends (order numbering, slot capacity). */
export async function lockBranch(c: Ctx) {
  const [row] = await c.db
    .select()
    .from(branches)
    .where(eq(branches.id, c.branchId))
    .for("update");
  if (!row) throw new Error(NOT_INITIALIZED);
  return row;
}

/** Signals staff screens that something changed. Call once per write transaction. */
export async function bumpRevision(c: Ctx) {
  await c.db
    .update(branches)
    .set({ revision: sql`${branches.revision} + 1`, updatedAt: new Date() })
    .where(eq(branches.id, c.branchId));
}

export async function getRevision(c: Ctx) {
  const [row] = await c.db
    .select({ revision: branches.revision })
    .from(branches)
    .where(eq(branches.id, c.branchId));
  if (!row) throw new DomainError("Branch not found", 404);
  return row.revision;
}

export async function audit(
  c: Ctx,
  action: string,
  actorId: string,
  entityId: string,
  metadata?: Record<string, unknown>,
) {
  await c.db.insert(auditLogs).values({ branchId: c.branchId, action, actorId, entityId, metadata });
}

export async function updateSettings(c: Ctx, raw: unknown, actorId: string) {
  const s = settingsInput.parse(raw);
  await transaction(c, async (t) => {
    await t.db
      .update(branches)
      .set({
        openHour: s.open,
        closeHour: s.close,
        slotIntervalMinutes: s.interval,
        slotCapacity: s.capacity,
        basePrepMinutes: s.basePrep,
        updatedAt: new Date(),
      })
      .where(eq(branches.id, t.branchId));
    await audit(t, "SETTINGS_CHANGED", actorId, t.branchId, s);
    await bumpRevision(t);
  });
}
