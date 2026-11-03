import { handle, body, sameOrigin, rateLimit } from "@/server/http";
import { ctx } from "@/server/context";
import { requireStaff } from "@/server/staff";
import { createOrder } from "@/server/services/orders";

export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const c = ctx();
    await rateLimit(c, req, "checkout");
    const input = await body(req);
    // Walk-in orders come from the POS and require a cashier session.
    const staff = input?.source === "WALK_IN" ? await requireStaff("pos", c) : null;
    const order = await createOrder(c, input, staff?.id ?? "guest");
    return { order };
  });
}
