import { handle, body, sameOrigin, rateLimit } from "@/lib/http";
import { readState, mutate, audit } from "@/lib/repository";
import { DomainError, changeStatus, type Status } from "@/lib/domain";
import { requireStaff } from "@/lib/auth";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, ctx: Context) {
  return handle(async () => {
    await rateLimit(req, "tracking", 180);
    const { id } = await ctx.params;
    const token = req.headers.get("x-order-token");
    const order = (await readState()).orders.find(
      (o) => String(o.number) === id && o.token === token,
    );
    if (!order)
      throw new DomainError(
        "Receipt not found. Open the private link from your confirmation.",
        404,
      );
    return { order };
  });
}
export async function PATCH(req: Request, ctx: Context) {
  return handle(async () => {
    sameOrigin(req);
    const { id } = await ctx.params;
    const input = await body(req);
    const user =
      input.action === "arrive"
        ? null
        : await requireStaff(input.action === "pay" ? "pos" : "kitchen");
    return mutate((s) => {
      const order = s.orders.find(
        (o) => o.id === id || String(o.number) === id,
      );
      if (!order) throw new DomainError("Order not found", 404);
      if (input.action === "arrive") {
        if (order.token !== req.headers.get("x-order-token"))
          throw new DomainError("Invalid receipt", 403);
        order.arrivedAt ??= new Date().toISOString();
      } else if (input.action === "pay") {
        if (order.payment === "ONLINE")
          throw new DomainError(
            "Online payments require provider verification",
          );
        order.paymentStatus = "PAID";
      } else if (input.action === "error") {
        order.errorReported = true;
      } else {
        if (
          ![
            "NEW",
            "ACCEPTED",
            "PREPARING",
            "READY",
            "COMPLETED",
            "CANCELLED",
            "REJECTED",
          ].includes(input.status)
        )
          throw new DomainError("Invalid status");
        changeStatus(s, order, input.status as Status);
      }
      audit(
        s,
        `ORDER_${input.action ?? input.status}`,
        user?.id ?? "guest",
        order.id,
      );
      return { ok: true };
    });
  });
}
