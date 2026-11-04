// Branch settings, the change-revision counter and the audit trail.
import { eq, sql } from "drizzle-orm";
import { auditLogs, branches, restaurants } from "@/db/schema";
import {
  DomainError,
  businessInput,
  receiptInput,
  settingsInput,
  toReceiptSettings,
  type Business,
  type Settings,
} from "@/lib/domain";
import { transaction, type Ctx } from "../context";

export type BranchRow = typeof branches.$inferSelect;

export const toSettings = (b: BranchRow): Settings => ({
  open: b.openHour,
  close: b.closeHour,
  interval: b.slotIntervalMinutes,
  capacity: b.slotCapacity,
  basePrep: b.basePrepMinutes,
});

export const toReceipt = (b: BranchRow) => toReceiptSettings(b.receipt);

export async function getBusiness(c: Ctx, b: BranchRow): Promise<Business> {
  const [r] = await c.db
    .select({ name: restaurants.name })
    .from(restaurants)
    .where(eq(restaurants.id, b.restaurantId));
  return { name: r?.name ?? "", branch: b.name, phone: b.phone, address: b.address };
}

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

export async function updateBusiness(c: Ctx, raw: unknown, actorId: string) {
  const s = businessInput.parse(raw);
  await transaction(c, async (t) => {
    const b = await lockBranch(t);
    await t.db.update(restaurants).set({ name: s.name, updatedAt: new Date() }).where(eq(restaurants.id, b.restaurantId));
    await t.db
      .update(branches)
      .set({ name: s.branch, phone: s.phone, address: s.address, updatedAt: new Date() })
      .where(eq(branches.id, t.branchId));
    await audit(t, "BUSINESS_CHANGED", actorId, t.branchId, s);
    await bumpRevision(t);
  });
}

export async function updateReceipt(c: Ctx, raw: unknown, actorId: string) {
  const s = receiptInput.parse(raw);
  await transaction(c, async (t) => {
    await t.db.update(branches).set({ receipt: s, updatedAt: new Date() }).where(eq(branches.id, t.branchId));
    await audit(t, "RECEIPT_CHANGED", actorId, t.branchId);
    await bumpRevision(t);
  });
}
