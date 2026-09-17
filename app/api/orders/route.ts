import { randomUUID } from "node:crypto";
import { handle, body, sameOrigin, rateLimit } from "@/lib/http";
import { mutate, audit } from "@/lib/repository";
import { createOrder } from "@/lib/domain";
import { requireStaff } from "@/lib/auth";
export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    await rateLimit(req, "checkout");
    const input = await body(req);
    const user = input.source === "WALK_IN" ? await requireStaff("pos") : null;
    const order = await mutate((s) => {
      const order = createOrder(s, input, randomUUID);
      audit(s, "ORDER_CREATED", user?.id ?? "guest", order.id);
      return order;
    });
    return { order };
  });
}
