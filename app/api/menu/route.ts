import { handle } from "@/lib/http";
import { readState, demoMode } from "@/lib/repository";
import { slots, estimate } from "@/lib/domain";
export const dynamic = "force-dynamic";
export async function GET() {
  return handle(async () => {
    const s = await readState();
    return {
      products: s.products,
      slots: slots(s),
      estimate: estimate(s),
      demo: demoMode(),
      onlinePayment: Boolean(process.env.PAYSTACK_SECRET_KEY),
      revision: s.revision,
    };
  });
}
