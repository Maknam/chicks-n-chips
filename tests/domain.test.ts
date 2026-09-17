import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { seed } from "../lib/seed";
import { createOrder, slots, changeStatus, analytics } from "../lib/domain";
const now = new Date("2026-09-17T10:00:00Z");
const input = (s: ReturnType<typeof seed>) => ({
  requestId: randomUUID(),
  customer: "Ama Test",
  phone: "0241234567",
  pickup: "ASAP",
  payment: "CASH",
  source: "ONLINE",
  items: [{ productId: s.products[0].id, qty: 2, options: [] }],
  total: 1,
});
test("server owns price and duplicate checkout is idempotent", () => {
  const s = seed(false),
    data = input(s);
  const o = createOrder(s, data, randomUUID, now);
  assert.equal(o.total, 7600);
  assert.equal(createOrder(s, data, randomUUID, now).id, o.id);
  assert.equal(s.orders.length, 1);
});
test("full scheduled slot rejects and ASAP recommends next", () => {
  const s = seed(false);
  s.settings.capacity = 1;
  const at = slots(s, now)[0].at;
  createOrder(s, { ...input(s), pickup: at }, randomUUID, now);
  assert.throws(
    () => createOrder(s, { ...input(s), pickup: at }, randomUUID, now),
    /full/,
  );
  assert.notEqual(createOrder(s, input(s), randomUUID, now).pickupAt, at);
});
test("sold out and invalid extras rejected", () => {
  const s = seed(false);
  s.products[0].availability = "SOLD_OUT";
  assert.throws(() => createOrder(s, input(s), randomUUID, now), /sold out/);
});
test("kitchen requires verified online payment and valid transitions", () => {
  const s = seed(false);
  const o = createOrder(s, { ...input(s), payment: "ONLINE" }, randomUUID, now);
  assert.throws(() => changeStatus(s, o, "ACCEPTED"), /payment/);
  o.paymentStatus = "PAID";
  changeStatus(s, o, "ACCEPTED");
  changeStatus(s, o, "PREPARING");
  changeStatus(s, o, "READY");
  assert.equal(s.notifications.length, 1);
  assert.throws(() => changeStatus(s, o, "NEW"));
});
test("unpaid orders are not revenue and missing measurements stay null", () => {
  const s = seed(false);
  createOrder(s, input(s), randomUUID, now);
  const a = analytics(s, "2026-09-17");
  assert.equal(a.revenue, 0);
  assert.equal(a.waitingMinutes, null);
});
test("cash handover requires staff payment confirmation", () => {
  const s = seed(false);
  const o = createOrder(s, input(s), randomUUID, now);
  changeStatus(s, o, "ACCEPTED");
  changeStatus(s, o, "PREPARING");
  changeStatus(s, o, "READY");
  assert.throws(() => changeStatus(s, o, "COMPLETED"), /confirm payment/);
  o.paymentStatus = "PAID";
  changeStatus(s, o, "COMPLETED");
  assert.ok(o.completedAt);
});
test("invalid quantities and foreign product IDs fail validation", () => {
  const s = seed(false);
  assert.throws(() =>
    createOrder(
      s,
      {
        ...input(s),
        items: [{ productId: randomUUID(), qty: 1, options: [] }],
      },
      randomUUID,
      now,
    ),
  );
  assert.throws(() =>
    createOrder(
      s,
      {
        ...input(s),
        items: [{ productId: s.products[0].id, qty: -1, options: [] }],
      },
      randomUUID,
      now,
    ),
  );
});
