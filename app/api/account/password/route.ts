import { handle, body, sameOrigin, rateLimit } from "@/server/http";
import { ctx } from "@/server/context";
import { requireStaff } from "@/server/staff";
import { changeOwnPassword } from "@/server/onboarding";

export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const c = ctx();
    await rateLimit(c, req, "password", 10);
    await requireStaff("kitchen", c); // any signed-in staff role
    await changeOwnPassword(await body(req));
    return { ok: true };
  });
}
