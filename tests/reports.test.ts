// Filterable reports — pure functions, no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { clampRange, presetRange, report, toCsv, type ReportFilter } from "../lib/reports";
import type { Order, Product, Settings } from "../lib/domain";

const settings: Settings = { open: 8, close: 22, interval: 15, capacity: 2, basePrep: 15 };
const product = (id: string, name: string, category: string): Product => ({
  id,
  name,
  category,
  description: "",
  price: 1000,
  prep: 10,
  image: "",
  availability: "AVAILABLE",
  options: [],
  variants: [],
  ingredients: {},
});
const products = [product("p1", "Chips", "Chips"), product("p2", "Sobolo", "Drinks")];

let n = 0;
function order(day: string, patch: Partial<Order> = {}, items = [{ productId: "p1", qty: 1, price: 1000 }]): Order {
  n++;
  const createdAt = `${day}T12:00:00.000Z`;
  return {
    id: `o${n}`,
    number: 1000 + n,
    token: "",
    trackingCode: `CODE${n}`,
    requestId: `r${n}`,
    customerId: patch.customerId ?? `c${n}`,
    customer: "Ama",
    phone: "+233240000000",
    items: items.map((i) => ({ ...i, name: i.productId, options: [] })),
    total: items.reduce((s, i) => s + i.qty * i.price, 0),
    status: "COMPLETED",
    source: "ONLINE",
    pickupAt: createdAt,
    scheduled: false,
    payment: "CASH",
    paymentStatus: "PAID",
    reference: "",
    createdAt,
    updatedAt: createdAt,
    ...patch,
  };
}

const state = (orders: Order[]) => ({
  orders,
  products,
  customers: [],
  inventory: [],
  movements: [],
  audits: [],
  settings,
});
const all = (from: string, to: string): ReportFilter => ({ from, to, source: "ALL", payment: "ALL", category: "ALL" });

test("presets and clamping produce valid ranges", () => {
  assert.deepEqual(presetRange("7d", "2026-11-04"), { from: "2026-10-29", to: "2026-11-04" });
  assert.deepEqual(presetRange("month", "2026-11-04"), { from: "2026-11-01", to: "2026-11-04" });
  assert.deepEqual(presetRange("yesterday", "2026-11-01"), { from: "2026-10-31", to: "2026-10-31" });
  assert.deepEqual(clampRange("2026-11-09", "2026-01-01", "2026-08-07", "2026-11-04"), {
    from: "2026-08-07",
    to: "2026-11-04",
  });
});

test("range, previous period and daily series", () => {
  const r = report(
    state([
      order("2026-11-03"),
      order("2026-11-04", { total: 3000 }, [{ productId: "p1", qty: 3, price: 1000 }]),
      order("2026-11-02"), // previous period
      order("2026-11-04", { status: "CANCELLED" }),
      order("2026-11-04", { paymentStatus: "PENDING", status: "NEW" }),
    ]),
    all("2026-11-03", "2026-11-04"),
  );
  assert.equal(r.range.days, 2);
  assert.equal(r.count, 4);
  assert.equal(r.sales.revenue, 4000);
  assert.equal(r.sales.orders, 2);
  assert.equal(r.sales.items, 4);
  assert.equal(r.before.revenue, 1000);
  assert.deepEqual(r.previousRange, { from: "2026-11-01", to: "2026-11-02" });
  assert.deepEqual(
    r.daily.map((d) => [d.day, d.revenue]),
    [
      ["2026-11-03", 1000],
      ["2026-11-04", 3000],
    ],
  );
  assert.equal(r.service.cancelled, 1);
  assert.equal(r.service.unpaid, 1);
});

test("channel, payment and category filters", () => {
  const orders = [
    order("2026-11-04", { source: "WALK_IN", payment: "MOMO" }),
    order("2026-11-04", {}, [
      { productId: "p1", qty: 1, price: 1000 },
      { productId: "p2", qty: 2, price: 500 },
    ]),
    order("2026-11-04", {}, [{ productId: "p2", qty: 1, price: 500 }]),
  ];
  const day = all("2026-11-04", "2026-11-04");
  assert.equal(report(state(orders), { ...day, source: "WALK_IN" }).sales.orders, 1);
  assert.equal(report(state(orders), { ...day, payment: "CASH" }).sales.orders, 2);

  const drinks = report(state(orders), { ...day, category: "Drinks" });
  assert.equal(drinks.sales.orders, 2, "orders containing a drink");
  assert.equal(drinks.sales.revenue, 1500, "only drink lines count");
  assert.deepEqual(drinks.products.map((p) => p.name), ["Sobolo"]);
  assert.equal(drinks.products[0].share, 100);
});

test("new vs returning customers use the first order seen", () => {
  const r = report(
    state([
      order("2026-11-01", { customerId: "regular" }),
      order("2026-11-04", { customerId: "regular" }),
      order("2026-11-04", { customerId: "newbie" }),
    ]),
    all("2026-11-04", "2026-11-04"),
  );
  assert.equal(r.customers.unique, 2);
  assert.equal(r.customers.new, 1);
  assert.equal(r.customers.returning, 1);
});

test("CSV escapes quotes, commas and spreadsheet formulas", () => {
  assert.equal(toCsv([["a,b", 'say "hi"', "=SUM(A1)", -5]]), '"a,b","say ""hi""",\'=SUM(A1),-5');
});
