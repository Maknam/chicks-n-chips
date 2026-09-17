import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { seed } from "../lib/seed";
import { createOrder } from "../lib/domain";
import { validSignature, confirmPayment } from "../lib/payments";
test("webhooks require a valid exact-body HMAC", () => {
  const payload = '{"event":"charge.success"}',
    key = "test-secret";
  const sig = createHmac("sha512", key).update(payload).digest("hex");
  assert.equal(validSignature(payload, sig, key), true);
  assert.equal(validSignature(payload + " ", sig, key), false);
  assert.equal(validSignature(payload, "bad", key), false);
  assert.equal(validSignature(payload, null, key), false);
});
test("payment settlement validates amount and currency and is idempotent", () => {
  const s = seed(false);
  const o = createOrder(
    s,
    {
      requestId: randomUUID(),
      customer: "Ama Test",
      phone: "0241234567",
      items: [{ productId: s.products[0].id, qty: 1, options: [] }],
      pickup: "ASAP",
      payment: "ONLINE",
    },
    randomUUID,
    new Date("2026-09-17T10:00:00Z"),
  );
  const p = {
    reference: o.reference,
    amount: o.total,
    currency: "GHS",
    status: "success",
  };
  assert.throws(() => confirmPayment(s, { ...p, amount: 1 }));
  assert.throws(() => confirmPayment(s, { ...p, currency: "NGN" }));
  assert.equal(o.paymentStatus, "PENDING");
  assert.equal(confirmPayment(s, p), true);
  assert.equal(confirmPayment(s, p), false);
});
