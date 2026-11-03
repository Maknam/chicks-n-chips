import { handle, body, sameOrigin, rateLimit } from "@/server/http";
import { ctx } from "@/server/context";
import { completeSetup, hasOwner } from "@/server/onboarding";

export const dynamic = "force-dynamic";

/** Whether the workspace still needs its first owner. */
export async function GET() {
  return handle(async () => ({ needed: !(await hasOwner(ctx())) }));
}

/** Creates the first OWNER with a one-time setup code, then signs them in. */
export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const c = ctx();
    await rateLimit(c, req, "setup", 5);
    return completeSetup(c, await body(req));
  });
}
