// Public, read-only order tracking by code. No login.
//
// POST rather than GET so the code travels in the body and never lands in URLs, access
// logs, browser history or analytics. Responses are no-store (see server/http.ts json()).
//
// Abuse limits, per client IP:
//   - 60 lookups/minute overall (a tracking page polls about 12/minute);
//   - 10 unknown codes/minute. With ~8 × 10^14 possible codes, guessing is infeasible.
// Unknown and malformed codes get the same response.
import { handle, body, sameOrigin, rateLimit } from "@/server/http";
import { ctx } from "@/server/context";
import { DomainError } from "@/lib/domain";
import { trackOrder } from "@/server/services/orders";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const c = ctx();
    await rateLimit(c, req, "track", 60);
    const input = await body(req, 512);
    const order = await trackOrder(c, input?.code);
    if (!order) {
      await rateLimit(c, req, "track-miss", 10);
      throw new DomainError("We couldn’t find an order with that code. Check it and try again.", 404);
    }
    return { order };
  });
}
