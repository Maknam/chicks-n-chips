// Order engine shared by online checkout, POS, kitchen and receipts.
// Each command is one short transaction with explicit row locks.
import { randomUUID } from "node:crypto";
import { and, count, eq, gte, inArray, lt, notInArray, or, sql, type SQL } from "drizzle-orm";
import {
  branches,
  customers,
  notifications,
  orderItemOptions,
  orderItems,
  orders,
} from "@/db/schema";
import {
  assertTransition,
  buildSlots,
  chooseSlot,
  DomainError,
  orderInput,
  priceItems,
  slotWindow,
  STATUSES,
  VOIDED,
  type Order,
  type Status,
} from "@/lib/domain";
import { toOrder } from "../mappers";
import { receiptToken, validReceiptToken } from "../receipts";
import { generateTrackingCode } from "../tracking";
import { normalizeCode, toPublicOrder, type PublicOrder } from "@/lib/tracking";
import { transaction, type Ctx } from "../context";
import { audit, bumpRevision, getBranch, lockBranch, toSettings } from "./branch";
import { listProducts } from "./catalog";
import { consumeForOrder } from "./inventory";

const withItems = { items: { with: { options: true } } } as const;

// ---------- Queries ----------

export async function findOrders(c: Ctx, where?: SQL, limit = 500) {
  const rows = await c.db.query.orders.findMany({
    where: and(eq(orders.branchId, c.branchId), where),
    with: withItems,
    orderBy: (o, { desc }) => [desc(o.createdAt)],
    limit,
  });
  return rows.map(toOrder);
}

async function findOrder(c: Ctx, where: SQL) {
  const row = await c.db.query.orders.findFirst({
    where: and(eq(orders.branchId, c.branchId), where),
    with: withItems,
  });
  return row ? toOrder(row) : null;
}

/** Accepts either the UUID or the human order number. */
const byRef = (ref: string) =>
  /^\d{1,9}$/.test(ref) ? eq(orders.number, Number(ref)) : eq(orders.id, ref);

/** Locks the order row for the rest of the transaction. */
async function lockOrder(t: Ctx, where: SQL) {
  const [row] = await t.db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.branchId, t.branchId), where))
    .for("update");
  if (!row) throw new DomainError("Order not found", 404);
  return (await findOrder(t, eq(orders.id, row.id)))!;
}

/** Confirmed tickets still waiting in the kitchen; drives the ASAP estimate. */
async function queuedCount(c: Ctx) {
  const [row] = await c.db
    .select({ n: count() })
    .from(orders)
    .where(
      and(
        eq(orders.branchId, c.branchId),
        inArray(orders.status, ["NEW", "ACCEPTED", "PREPARING"]),
        or(sql`${orders.paymentMethod} <> 'ONLINE'`, eq(orders.paymentStatus, "PAID")),
      ),
    );
  return row?.n ?? 0;
}

async function slotCounts(c: Ctx, now: Date) {
  const { from, to } = slotWindow(now);
  const rows = await c.db
    .select({ at: orders.pickupAt, n: count() })
    .from(orders)
    .where(
      and(
        eq(orders.branchId, c.branchId),
        gte(orders.pickupAt, from),
        lt(orders.pickupAt, to),
        notInArray(orders.status, VOIDED),
      ),
    )
    .groupBy(orders.pickupAt);
  return new Map(rows.map((r) => [r.at.toISOString(), r.n]));
}

/** Public pickup slots and current ASAP estimate. */
export async function availability(c: Ctx, now = new Date()) {
  const branch = await getBranch(c);
  const settings = toSettings(branch);
  const [counts, queued] = await Promise.all([slotCounts(c, now), queuedCount(c)]);
  const slots = buildSlots(settings, counts, queued, now);
  return { settings, slots, queued, revision: branch.revision };
}

// ---------- Commands ----------

/**
 * Creates an order with server-side pricing and atomic slot capacity.
 * Idempotent on `requestId`: retrying returns the original order.
 */
export async function createOrder(
  c: Ctx,
  raw: unknown,
  actorId: string,
  now = new Date(),
): Promise<Order> {
  const input = orderInput.parse(raw);
  return transaction(c, async (t) => {
    // Serializes checkouts per branch: order numbers and slot capacity stay exact.
    const branch = await lockBranch(t);
    const existing = await findOrder(t, eq(orders.requestId, input.requestId));
    if (existing) return { ...existing, token: receiptToken(existing.id) };

    const products = await listProducts(t, [...new Set(input.items.map((i) => i.productId))]);
    const { items, total } = priceItems(products, input.items);
    const settings = toSettings(branch);
    const [counts, queued] = await Promise.all([slotCounts(t, now), queuedCount(t)]);
    const slot = chooseSlot(buildSlots(settings, counts, queued, now), input.pickup);

    const [customer] = await t.db
      .insert(customers)
      .values({ branchId: t.branchId, name: input.customer, phone: input.phone })
      .onConflictDoUpdate({
        target: [customers.branchId, customers.phone],
        set: { updatedAt: now },
      })
      .returning({ id: customers.id });

    const id = randomUUID();
    await t.db.insert(orders).values({
      id,
      branchId: t.branchId,
      number: branch.nextOrderNumber,
      requestId: input.requestId,
      trackingCode: generateTrackingCode(),
      customerId: customer.id,
      customerName: input.customer,
      customerPhone: input.phone,
      total,
      source: input.source,
      pickupAt: new Date(slot.at),
      scheduled: input.pickup !== "ASAP",
      paymentMethod: input.payment,
      paymentReference: `cc-${randomUUID()}`,
      createdAt: now,
      updatedAt: now,
    });
    const lines = items.map((item, position) => ({ item, id: randomUUID(), position }));
    await t.db.insert(orderItems).values(
      lines.map(({ item, id: itemId, position }) => ({
        id: itemId,
        orderId: id,
        productId: item.productId,
        productName: item.name,
        variantCode: item.variantId ?? null,
        variantName: item.variant ?? null,
        quantity: item.qty,
        unitPrice: item.price,
        position,
      })),
    );
    const options = lines.flatMap(({ item, id: itemId }) =>
      item.options.map((o) => ({ orderItemId: itemId, code: o.id, name: o.name, price: o.price })),
    );
    if (options.length) await t.db.insert(orderItemOptions).values(options);

    await t.db
      .update(branches)
      .set({ nextOrderNumber: sql`${branches.nextOrderNumber} + 1` })
      .where(eq(branches.id, t.branchId));
    await audit(t, "ORDER_CREATED", actorId, id);
    await bumpRevision(t);
    const order = (await findOrder(t, eq(orders.id, id)))!;
    return { ...order, token: receiptToken(id) };
  });
}

export function parseStatus(value: unknown): Status {
  if (!STATUSES.includes(value as Status)) throw new DomainError("Invalid status");
  return value as Status;
}

/** Moves an order through its lifecycle, with stock and notification side effects. */
export async function changeStatus(c: Ctx, ref: string, next: Status, actorId: string) {
  return transaction(c, async (t) => {
    const order = await lockOrder(t, byRef(ref));
    assertTransition(order, next);
    const now = new Date();
    if (next === "PREPARING") await consumeForOrder(t, order, actorId);
    if (next === "READY")
      await t.db
        .insert(notifications)
        .values({ branchId: t.branchId, orderId: order.id, nextAttemptAt: now })
        .onConflictDoNothing();
    await t.db
      .update(orders)
      .set({
        status: next,
        updatedAt: now,
        ...(next === "ACCEPTED" && { acceptedAt: now }),
        ...(next === "PREPARING" && { preparingAt: now }),
        ...(next === "READY" && { readyAt: now }),
        ...(next === "COMPLETED" && { completedAt: now }),
      })
      .where(eq(orders.id, order.id));
    await audit(t, `ORDER_${next}`, actorId, order.id);
    await bumpRevision(t);
    return { id: order.id, notify: next === "READY" };
  });
}

/** Cashier confirms a cash or merchant-MoMo payment. Online payments need provider verification. */
export async function confirmCounterPayment(c: Ctx, ref: string, actorId: string) {
  await transaction(c, async (t) => {
    const order = await lockOrder(t, byRef(ref));
    if (order.payment === "ONLINE")
      throw new DomainError("Online payments require provider verification");
    await t.db
      .update(orders)
      .set({ paymentStatus: "PAID", updatedAt: new Date() })
      .where(eq(orders.id, order.id));
    await audit(t, "ORDER_pay", actorId, order.id);
    await bumpRevision(t);
  });
}

export async function reportOrderError(c: Ctx, ref: string, actorId: string) {
  await transaction(c, async (t) => {
    const order = await lockOrder(t, byRef(ref));
    await t.db
      .update(orders)
      .set({ errorReported: true, updatedAt: new Date() })
      .where(eq(orders.id, order.id));
    await audit(t, "ORDER_error", actorId, order.id);
    await bumpRevision(t);
  });
}

// ---------- Guest receipts ----------

/** Looks up a guest receipt by order number; requires the private receipt token. */
export async function getReceipt(c: Ctx, number: string, token: string | null) {
  const order = /^\d{1,9}$/.test(number)
    ? await findOrder(c, eq(orders.number, Number(number)))
    : null;
  if (!order || !validReceiptToken(order.id, token))
    throw new DomainError("Receipt not found. Open the private link from your confirmation.", 404);
  return order;
}

/**
 * Public, read-only tracking by code. Unknown and malformed codes get the same answer,
 * so responses reveal nothing about which codes exist.
 */
export async function trackOrder(c: Ctx, rawCode: unknown): Promise<PublicOrder | null> {
  const code = normalizeCode(String(rawCode ?? ""));
  if (!code) return null;
  const order = await findOrder(c, eq(orders.trackingCode, code));
  return order ? toPublicOrder(order) : null;
}

/** Guest taps "I'm at Pent Hall". Starts the pickup-wait measurement. */
export async function markArrived(c: Ctx, number: string, token: string | null) {
  const order = await getReceipt(c, number, token);
  await transaction(c, async (t) => {
    const [row] = await t.db
      .update(orders)
      .set({ arrivedAt: sql`coalesce(${orders.arrivedAt}, now())`, updatedAt: new Date() })
      .where(and(eq(orders.id, order.id), eq(orders.branchId, t.branchId)))
      .returning({ id: orders.id });
    if (!row) throw new DomainError("Order not found", 404);
    await audit(t, "ORDER_arrive", "guest", order.id);
    await bumpRevision(t);
  });
}
