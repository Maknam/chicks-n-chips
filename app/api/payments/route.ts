import { handle, body, sameOrigin, rateLimit } from "@/server/http";
import { ctx } from "@/server/context";
import { config } from "@/server/config";
import { startOnlinePayment } from "@/server/services/payments";

export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const c = ctx();
    await rateLimit(c, req, "payment", 10);
    const url = await startOnlinePayment(
      c,
      await body(req),
      req.headers.get("x-order-token"),
      config.appOrigin(new URL(req.url).origin),
    );
    return { url };
  });
}
