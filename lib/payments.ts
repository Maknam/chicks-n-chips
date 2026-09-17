import { createHmac, timingSafeEqual } from "node:crypto";
import { DomainError, type State } from "./domain";
export function validSignature(
  payload: string,
  signature: string | null,
  key: string,
) {
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = createHmac("sha512", key).update(payload).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
export function confirmPayment(
  s: State,
  payment: {
    reference: string;
    amount: number;
    currency: string;
    status: string;
  },
) {
  const order = s.orders.find((o) => o.reference === payment.reference);
  if (!order) throw new DomainError("Unknown reference", 404);
  if (
    order.payment !== "ONLINE" ||
    payment.status !== "success" ||
    payment.currency !== "GHS" ||
    payment.amount !== order.total
  )
    throw new DomainError("Payment details do not match order", 409);
  if (order.paymentStatus === "PAID") return false;
  order.paymentStatus = "PAID";
  order.updatedAt = new Date().toISOString();
  return true;
}
export async function paystack(path: string, init?: RequestInit) {
  if (!process.env.PAYSTACK_SECRET_KEY)
    throw new DomainError("Online payment is not configured", 503);
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok || !result.status)
    throw new DomainError(
      "Payment provider could not complete this request. Your order is saved; please retry.",
      502,
    );
  return result.data;
}
