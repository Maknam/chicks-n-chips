import { handle } from "@/server/http";
import { ctx } from "@/server/context";
import { config } from "@/server/config";
import { listProducts } from "@/server/services/catalog";
import { availability } from "@/server/services/orders";
import { estimate } from "@/lib/domain";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const c = ctx();
    const [products, open] = await Promise.all([listProducts(c), availability(c)]);
    return {
      products,
      slots: open.slots,
      estimate: estimate(open.settings, open.queued),
      demo: config.demoLabel(),
      onlinePayment: Boolean(config.paystackKey()),
      revision: open.revision,
    };
  });
}
