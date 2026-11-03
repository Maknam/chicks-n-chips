// Paystack online payments. Only a signed webhook plus an independent verify call
// can mark an online order as paid; no browser action can.
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { orders, payments } from "@/db/schema";
import { DomainError, VOIDED } from "@/lib/domain";
import { config } from "../config";
import { transaction, type Ctx } from "../context";
import { audit, bumpRevision } from "./branch";
import { getReceipt } from "./orders";

export function validSignature(payload: string, signature: string | null, key: string) {
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = createHmac("sha512", key).update(payload).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

export async function paystack(path: string, init?: RequestInit) {
  const key = config.paystackKey();
  if (!key) throw new DomainError("Online payment is not configured", 503);
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.status)
    throw new DomainError(
      "Payment provider could not complete this request. Your order is saved; please retry.",
      502,
    );
  return result.data;
}

const initInput = z.object({ number: z.string(), email: z.string().email().max(200) });

/** Starts (or resumes) a Paystack checkout for a guest's online order. */
export async function startOnlinePayment(c: Ctx, raw: unknown, token: string | null, origin: string) {
  const input = initInput.parse(raw);
  const order = await getReceipt(c, input.number, token);
  if (order.payment !== "ONLINE" || order.paymentStatus === "PAID" || VOIDED.includes(order.status))
    throw new DomainError("This order cannot be paid online");
  if (order.paymentUrl) return order.paymentUrl;
  const payment = await paystack("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: order.total,
      currency: "GHS",
      reference: order.reference,
      callback_url: `${origin}/order/${order.number}#${token}`,
    }),
  });
  if (
    typeof payment?.authorization_url !== "string" ||
    new URL(payment.authorization_url).hostname !== "checkout.paystack.com"
  )
    throw new Error("Unexpected payment URL");
  await c.db
    .update(orders)
    .set({ paymentUrl: payment.authorization_url, updatedAt: new Date() })
    .where(eq(orders.id, order.id));
  return payment.authorization_url as string;
}

export type VerifiedPayment = {
  reference: string;
  amount: number;
  currency: string;
  status: string;
};

/**
 * Applies a provider-verified payment. Idempotent: duplicates return false.
 * Payment of a cancelled order is recorded and flagged for manual refund.
 */
export async function settlePayment(c: Ctx, payment: VerifiedPayment) {
  return transaction(c, async (t) => {
    const [order] = await t.db
      .select()
      .from(orders)
      .where(eq(orders.paymentReference, payment.reference))
      .for("update");
    if (!order) throw new DomainError("Unknown reference", 404);
    if (
      order.paymentMethod !== "ONLINE" ||
      payment.status !== "success" ||
      payment.currency !== "GHS" ||
      payment.amount !== order.total
    )
      throw new DomainError("Payment details do not match order", 409);
    if (order.paymentStatus === "PAID") return false;
    const scoped = { ...t, branchId: order.branchId };
    await t.db.insert(payments).values({
      orderId: order.id,
      provider: "paystack",
      reference: payment.reference,
      amount: payment.amount,
      currency: payment.currency,
    });
    await t.db
      .update(orders)
      .set({ paymentStatus: "PAID", updatedAt: new Date() })
      .where(eq(orders.id, order.id));
    await audit(
      scoped,
      VOIDED.includes(order.status) ? "PAID_CANCELLED_REVIEW_REFUND" : "PAYMENT_VERIFIED",
      "paystack",
      order.id,
    );
    await bumpRevision(scoped);
    return true;
  });
}
