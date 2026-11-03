import { after } from "next/server";
import { handle, body, sameOrigin, rateLimit } from "@/server/http";
import { ctx } from "@/server/context";
import { requireStaff } from "@/server/staff";
import { DomainError } from "@/lib/domain";
import {
  changeStatus,
  confirmCounterPayment,
  getReceipt,
  markArrived,
  parseStatus,
  reportOrderError,
} from "@/server/services/orders";
import { deliverDue } from "@/server/services/notifications";

type Context = { params: Promise<{ id: string }> };

/** Guest receipt: requires the private token from the confirmation link. */
export async function GET(req: Request, { params }: Context) {
  return handle(async () => {
    const c = ctx();
    await rateLimit(c, req, "tracking", 180);
    const { id } = await params;
    return { order: await getReceipt(c, id, req.headers.get("x-order-token")) };
  });
}

export async function PATCH(req: Request, { params }: Context) {
  return handle(async () => {
    sameOrigin(req);
    const c = ctx();
    const { id } = await params;
    const input = await body(req);
    switch (input?.action) {
      case "arrive":
        await rateLimit(c, req, "tracking", 180);
        await markArrived(c, id, req.headers.get("x-order-token"));
        break;
      case "pay": {
        const staff = await requireStaff("pos", c);
        await confirmCounterPayment(c, id, staff.id);
        break;
      }
      case "error": {
        const staff = await requireStaff("kitchen", c);
        await reportOrderError(c, id, staff.id);
        break;
      }
      case undefined: {
        const staff = await requireStaff("kitchen", c);
        const result = await changeStatus(c, id, parseStatus(input?.status), staff.id);
        // Send the "ready" SMS right away; the scheduled worker retries failures.
        if (result.notify) after(() => deliverDue(ctx()).catch(() => {}));
        break;
      }
      default:
        throw new DomainError("Unknown action");
    }
    return { ok: true };
  });
}
