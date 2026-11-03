// Service layer against the real migrations, on in-process Postgres (PGlite).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { setDb, type DB } from "../db/client";
import { seedBranch } from "../server/seed";
import { DEFAULT_BRANCH_ID } from "../server/config";
import type { Ctx } from "../server/context";
import { receiptToken } from "../server/receipts";
import {
  availability,
  changeStatus,
  confirmCounterPayment,
  createOrder,
  getReceipt,
} from "../server/services/orders";
import { settlePayment } from "../server/services/payments";
import { recordMovement } from "../server/services/inventory";
import { buildWorkspace } from "../server/services/workspace";
import { deliverDue } from "../server/services/notifications";
import { updateSettings } from "../server/services/branch";

let pg: PGlite;
let c: Ctx;
const PRODUCT = "00000000-0000-4000-8000-000000000010"; // Classic Chips & Chicken
const CHICKEN = "00000000-0000-4000-8000-000000000100";

before(async () => {
  pg = new PGlite();
  const db = drizzle({ client: pg, schema }) as unknown as DB;
  await migrate(db as never, { migrationsFolder: "db/migrations" });
  await seedBranch(db);
  setDb(db);
  c = { db, branchId: DEFAULT_BRANCH_ID };
});
after(async () => {
  setDb(undefined);
  await pg.close();
});

const checkout = (over: Record<string, unknown> = {}) => ({
  requestId: randomUUID(),
  customer: "Ama Test",
  phone: "0241234567",
  pickup: "ASAP",
  payment: "CASH",
  source: "ONLINE",
  items: [{ productId: PRODUCT, qty: 2, options: [] }],
  total: 1, // ignored: the server prices orders
  ...over,
});

test("checkout prices server-side, numbers orders and is idempotent", async () => {
  const input = checkout();
  const first = await createOrder(c, input, "guest");
  assert.equal(first.total, 7600);
  assert.equal(first.number, 1000);
  assert.equal(first.phone, "+233241234567");
  assert.equal(first.token, receiptToken(first.id));
  const retry = await createOrder(c, input, "guest");
  assert.equal(retry.id, first.id);
  assert.equal(retry.token, first.token);
  const next = await createOrder(c, checkout(), "guest");
  assert.equal(next.number, 1001);
});

test("slot capacity holds under concurrent checkouts", async () => {
  await updateSettings(c, { open: 0, close: 24, interval: 15, capacity: 3, basePrep: 5 }, "test");
  const { slots } = await availability(c);
  // Tomorrow's last slot: far enough ahead that the growing queue estimate never excludes it.
  const target = slots.at(-1)!.at;
  const results = await Promise.allSettled(
    Array.from({ length: 6 }, () => createOrder(c, checkout({ pickup: target }), "guest")),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 3);
  assert.equal(results.filter((r) => r.status === "rejected").length, 3);
});

test("receipts require the private token", async () => {
  const order = await createOrder(c, checkout(), "guest");
  const receipt = await getReceipt(c, String(order.number), order.token);
  assert.equal(receipt.id, order.id);
  await assert.rejects(getReceipt(c, String(order.number), "guess"), /Receipt not found/);
});

test("lifecycle consumes stock, queues SMS and requires payment before handover", async () => {
  const order = await createOrder(c, checkout(), "guest");
  const [before] = await c.db
    .select()
    .from(schema.inventoryItems)
    .where(eq(schema.inventoryItems.id, CHICKEN));
  await changeStatus(c, order.id, "ACCEPTED", "kitchen");
  await changeStatus(c, order.id, "PREPARING", "kitchen");
  const [afterPrep] = await c.db
    .select()
    .from(schema.inventoryItems)
    .where(eq(schema.inventoryItems.id, CHICKEN));
  assert.equal(afterPrep.quantity, before.quantity - 2);
  await assert.rejects(changeStatus(c, order.id, "PREPARING", "kitchen"), /changed/);
  const { notify } = await changeStatus(c, order.id, "READY", "kitchen");
  assert.equal(notify, true);
  await assert.rejects(changeStatus(c, order.id, "COMPLETED", "kitchen"), /confirm payment/);
  await confirmCounterPayment(c, String(order.number), "cashier");
  await changeStatus(c, order.id, "COMPLETED", "cashier");

  const sent: string[] = [];
  const result = await deliverDue(c, { sendSMS: async (to) => void sent.push(to) });
  assert.equal(result.sent, 1);
  assert.deepEqual(sent, ["+233241234567"]);
  assert.equal((await deliverDue(c, { sendSMS: async () => {} })).claimed, 0);
});

test("preparation is blocked when recorded stock is insufficient", async () => {
  const [chicken] = await c.db
    .select()
    .from(schema.inventoryItems)
    .where(eq(schema.inventoryItems.id, CHICKEN));
  await recordMovement(c, { id: CHICKEN, kind: "WASTE", quantity: chicken.quantity, reason: "test spoilage" }, "manager");
  const order = await createOrder(c, checkout(), "guest");
  await changeStatus(c, order.id, "ACCEPTED", "kitchen");
  await assert.rejects(changeStatus(c, order.id, "PREPARING", "kitchen"), /Insufficient/);
  await recordMovement(c, { id: CHICKEN, kind: "RESTOCK", quantity: 40, reason: "delivery" }, "manager");
  await changeStatus(c, order.id, "PREPARING", "kitchen");
});

test("online payment settlement is exact and idempotent; kitchen sees it only once paid", async () => {
  const order = await createOrder(c, checkout({ payment: "ONLINE" }), "guest");
  const hidden = await buildWorkspace(c, "kitchen", "KITCHEN");
  assert.equal(hidden.state.orders.some((o) => o.id === order.id), false);
  const payment = { reference: order.reference, amount: order.total, currency: "GHS", status: "success" };
  await assert.rejects(settlePayment(c, { ...payment, amount: 1 }), /do not match/);
  assert.equal(await settlePayment(c, payment), true);
  assert.equal(await settlePayment(c, payment), false);
  const shown = await buildWorkspace(c, "kitchen", "KITCHEN");
  const ticket = shown.state.orders.find((o) => o.id === order.id);
  assert.ok(ticket);
  assert.equal(ticket.phone, "", "kitchen never receives customer phones");
  assert.equal(shown.state.customers.length, 0);
});
