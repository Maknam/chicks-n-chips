// Pure business rules — no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertTransition,
  buildSlots,
  chooseSlot,
  estimate,
  ingredientDemand,
  priceItems,
  analytics,
  type Product,
  type Settings,
  type Order,
} from "../lib/domain";

const settings: Settings = { open: 8, close: 22, interval: 15, capacity: 2, basePrep: 15 };
const product: Product = {
  id: "00000000-0000-4000-8000-000000000010",
  name: "Classic",
  category: "Popular",
  description: "",
  price: 3800,
  prep: 15,
  image: "",
  availability: "AVAILABLE",
  options: [{ id: "sauce", name: "Sauce", price: 300 }],
  variants: [
    { id: "regular", name: "Regular", price: 0 },
    { id: "large", name: "Large", price: 1000, extraIngredients: { chips: 1 } },
  ],
  ingredients: { chicken: 1, chips: 1 },
};

test("server prices lines from the catalogue, including variant and extras", () => {
  const { items, total } = priceItems(
    [product],
    [{ productId: product.id, qty: 2, variant: "large", options: ["sauce"] }],
  );
  assert.equal(items[0].price, 3800 + 1000 + 300);
  assert.equal(total, 2 * 5100);
});

test("sold out, unknown variants and duplicate or unknown extras are rejected", () => {
  const line = { productId: product.id, qty: 1, options: [] as string[] };
  assert.throws(() => priceItems([{ ...product, availability: "SOLD_OUT" }], [line]), /sold out/);
  assert.throws(() => priceItems([product], [{ ...line, variant: "huge" }]), /variant/);
  assert.throws(() => priceItems([product], [{ ...line, options: ["sauce", "sauce"] }]), /Duplicate/);
  assert.throws(() => priceItems([product], [{ ...line, options: ["gold"] }]), /Invalid extra/);
});

test("slots respect the prep estimate and capacity; ASAP picks the next open slot", () => {
  const now = new Date("2026-09-17T10:00:00Z");
  const empty = buildSlots(settings, new Map(), 0, now);
  assert.equal(empty[0].at, "2026-09-17T10:15:00.000Z");
  const full = new Map([[empty[0].at, 2]]);
  const slots = buildSlots(settings, full, 0, now);
  assert.equal(slots[0].full, true);
  assert.equal(chooseSlot(slots, "ASAP").at, "2026-09-17T10:30:00.000Z");
  assert.throws(() => chooseSlot(slots, empty[0].at), /full/);
  assert.equal(estimate(settings, 4), 15 + 2 * 15);
});

test("lifecycle enforces transitions, verified online payment and paid handover", () => {
  const online = { status: "NEW", payment: "ONLINE", paymentStatus: "PENDING" } as const;
  assert.throws(() => assertTransition(online, "ACCEPTED"), /payment/);
  assert.doesNotThrow(() => assertTransition(online, "CANCELLED"));
  const cash = { status: "READY", payment: "CASH", paymentStatus: "PENDING" } as const;
  assert.throws(() => assertTransition(cash, "COMPLETED"), /confirm payment/);
  assert.throws(() => assertTransition({ ...cash, status: "COMPLETED" }, "NEW"), /changed/);
});

test("ingredient demand includes variant extras", () => {
  const demand = ingredientDemand(
    [product],
    [
      { productId: product.id, qty: 2, variantId: "large" },
      { productId: product.id, qty: 1, variantId: "regular" },
    ],
  );
  assert.deepEqual(demand, { chicken: 3, chips: 5 });
});

test("revenue counts only paid, non-cancelled orders", () => {
  const day = "2026-09-17";
  const base = {
    createdAt: `${day}T11:00:00.000Z`,
    pickupAt: `${day}T11:30:00.000Z`,
    customerId: "c1",
    items: [],
    source: "ONLINE",
    scheduled: false,
  } as unknown as Order;
  const orders = [
    { ...base, id: "1", total: 1000, status: "COMPLETED", paymentStatus: "PAID" },
    { ...base, id: "2", total: 2000, status: "CANCELLED", paymentStatus: "PAID" },
    { ...base, id: "3", total: 4000, status: "NEW", paymentStatus: "PENDING" },
  ] as Order[];
  const a = analytics({ orders, products: [] }, day);
  assert.equal(a.revenue, 1000);
  assert.equal(a.cancelled, 1);
  assert.equal(a.count, 3);
});
