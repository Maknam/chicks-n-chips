// Signature and capability checks — no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { validSignature } from "../server/services/payments";
import { receiptToken, validReceiptToken } from "../server/receipts";

test("webhooks require a valid exact-body HMAC", () => {
  const payload = '{"event":"charge.success"}',
    key = "test-secret";
  const sig = createHmac("sha512", key).update(payload).digest("hex");
  assert.equal(validSignature(payload, sig, key), true);
  assert.equal(validSignature(payload + " ", sig, key), false);
  assert.equal(validSignature(payload, "bad", key), false);
  assert.equal(validSignature(payload, null, key), false);
});

test("receipt tokens are bound to one order", () => {
  const a = "00000000-0000-4000-8000-000000000001";
  const b = "00000000-0000-4000-8000-000000000002";
  assert.equal(validReceiptToken(a, receiptToken(a)), true);
  assert.equal(validReceiptToken(b, receiptToken(a)), false);
  assert.equal(validReceiptToken(a, null), false);
  assert.equal(validReceiptToken(a, "short"), false);
});
