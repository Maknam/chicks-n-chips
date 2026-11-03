import { handle } from "@/server/http";
import { ctx } from "@/server/context";
import { config } from "@/server/config";
import { DomainError } from "@/lib/domain";
import { paystack, settlePayment, validSignature } from "@/server/services/payments";

export async function POST(req: Request) {
  return handle(async () => {
    const key = config.paystackKey();
    if (!key) throw new DomainError("Payment provider not configured", 503);
    const raw = await req.text();
    if (raw.length > 100_000) throw new DomainError("Payload too large", 413);
    if (!validSignature(raw, req.headers.get("x-paystack-signature"), key))
      throw new DomainError("Invalid webhook signature", 401);
    const event = JSON.parse(raw);
    if (event.event !== "charge.success") return { received: true };
    if (typeof event.data?.reference !== "string") throw new DomainError("Missing reference");
    // Never trust the webhook body for amounts: re-verify with Paystack.
    const payment = await paystack(
      `/transaction/verify/${encodeURIComponent(event.data.reference)}`,
    );
    await settlePayment(ctx(), payment);
    return { received: true };
  });
}
