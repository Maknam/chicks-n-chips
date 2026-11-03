import { z } from "zod";
import { handle, body, sameOrigin, rateLimit } from "@/server/http";
import { ctx } from "@/server/context";
import { acceptLink, describeLink } from "@/server/onboarding";

export const dynamic = "force-dynamic";

/** Invite / password-reset links: `describe` previews, `accept` sets the password and signs in. */
export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const c = ctx();
    await rateLimit(c, req, "invite", 20);
    const input = await body(req);
    if (input?.action === "describe")
      return describeLink(c, z.object({ token: z.string().min(10).max(100) }).parse(input).token);
    return acceptLink(c, input);
  });
}
