import { handle } from "@/lib/http";
import { validSignature, paystack, confirmPayment } from "@/lib/payments";
import { mutate, audit } from "@/lib/repository";
import { DomainError } from "@/lib/domain";
export async function POST(req: Request) {
  return handle(async () => {
    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) throw new DomainError("Payment provider not configured", 503);
    const raw = await req.text();
    if (raw.length > 100000) throw new DomainError("Payload too large", 413);
    if (!validSignature(raw, req.headers.get("x-paystack-signature"), key))
      throw new DomainError("Invalid webhook signature", 401);
    const event = JSON.parse(raw);
    if (event.event !== "charge.success") return { received: true };
    if (typeof event.data?.reference !== "string")
      throw new DomainError("Missing reference");
    const payment = await paystack(
      `/transaction/verify/${encodeURIComponent(event.data.reference)}`,
    );
    await mutate((s) => {
      if (confirmPayment(s, payment)) {
        const o = s.orders.find((o) => o.reference === payment.reference)!;
        audit(
          s,
          ["CANCELLED", "REJECTED"].includes(o.status)
            ? "PAID_CANCELLED_REVIEW_REFUND"
            : "PAYMENT_VERIFIED",
          "paystack",
          o.id,
        );
      }
    });
    return { received: true };
  });
}
