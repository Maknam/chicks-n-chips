import { z } from "zod";
import { handle, body, sameOrigin, rateLimit } from "@/lib/http";
import { readState, mutate } from "@/lib/repository";
import { DomainError } from "@/lib/domain";
import { paystack } from "@/lib/payments";
export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    await rateLimit(req, "payment", 10);
    const input = z
      .object({ number: z.string(), email: z.string().email().max(200) })
      .parse(await body(req));
    const order = (await readState()).orders.find(
      (o) =>
        String(o.number) === input.number &&
        o.token === req.headers.get("x-order-token"),
    );
    if (!order) throw new DomainError("Receipt not found", 404);
    if (
      order.payment !== "ONLINE" ||
      order.paymentStatus === "PAID" ||
      ["CANCELLED", "REJECTED"].includes(order.status)
    )
      throw new DomainError("This order cannot be paid online");
    if (order.paymentUrl) return { url: order.paymentUrl };
    const origin = process.env.APP_ORIGIN || new URL(req.url).origin;
    const payment = await paystack("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        amount: order.total,
        currency: "GHS",
        reference: order.reference,
        callback_url: `${origin}/order/${order.number}#${order.token}`,
      }),
    });
    if (
      typeof payment.authorization_url !== "string" ||
      new URL(payment.authorization_url).hostname !== "checkout.paystack.com"
    )
      throw new Error("Unexpected payment URL");
    await mutate((s) => {
      const o = s.orders.find((o) => o.id === order.id)!;
      o.paymentUrl = payment.authorization_url;
    });
    return { url: payment.authorization_url };
  });
}
