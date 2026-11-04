// Thermal receipt template and receipt/business settings validation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { RECEIPT_DEFAULTS, businessInput, receiptInput, toReceiptSettings } from "../lib/domain";
import { SAMPLE_ORDER, maskPhone, receiptHtml } from "../lib/receipt";

const business = { name: "Chics & Chips", branch: "Pent Hall", phone: "0241112222", address: "Legon" };

test("receipt shows what the settings allow and escapes user text", () => {
  const html = receiptHtml(SAMPLE_ORDER, business, { ...RECEIPT_DEFAULTS, footer: "<b>Thanks</b>" });
  assert.match(html, /Chics &amp; Chips/);
  assert.match(html, /ORDER #1042/);
  assert.match(html, /Extra house sauce/);
  assert.match(html, /Ama Mensah/);
  assert.match(html, /&lt;b&gt;Thanks&lt;\/b&gt;/);
  assert.doesNotMatch(html, /0241234567/, "customer phone hidden by default");
  assert.match(html, /size: 80mm auto/);

  const minimal = receiptHtml(SAMPLE_ORDER, business, {
    ...RECEIPT_DEFAULTS,
    paperWidth: "58",
    showBusinessName: false,
    showCustomerName: false,
    showCustomerPhone: true,
    showItemOptions: false,
    showPaymentMethod: false,
    footer: "",
  });
  assert.doesNotMatch(minimal, /Chics &amp; Chips/);
  assert.doesNotMatch(minimal, /Ama Mensah/);
  assert.doesNotMatch(minimal, /Extra house sauce/);
  assert.doesNotMatch(minimal, /Payment/);
  assert.match(minimal, /024•••4567/);
  assert.match(minimal, /size: 58mm auto/);
  assert.match(minimal, /TOTAL/);
});

test("phone masking keeps only the ends", () => {
  assert.equal(maskPhone("0241234567"), "024•••4567");
  assert.equal(maskPhone("123"), "123");
});

test("stored receipt settings fall back to defaults", () => {
  assert.deepEqual(toReceiptSettings({}), RECEIPT_DEFAULTS);
  assert.equal(toReceiptSettings({ paperWidth: "58" }).paperWidth, "58");
  assert.deepEqual(toReceiptSettings({ paperWidth: "99" }), RECEIPT_DEFAULTS, "invalid stored values are ignored");
  assert.throws(() => receiptInput.parse({ ...RECEIPT_DEFAULTS, footer: "x".repeat(201) }));
});

test("business details are validated", () => {
  assert.equal(businessInput.parse({ name: " Chics ", branch: "Pent", phone: "", address: "" }).name, "Chics");
  assert.throws(() => businessInput.parse({ name: "C", branch: "Pent", phone: "", address: "" }));
});
