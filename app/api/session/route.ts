import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { handle, body, sameOrigin, rateLimit } from "@/server/http";
import { ctx } from "@/server/context";
import { config } from "@/server/config";
import { getAuth } from "@/server/auth";
import { currentStaff, homeFor } from "@/server/staff";
import { staffMembers } from "@/db/schema";
import { DomainError } from "@/lib/domain";

const credentials = z.object({
  email: z.string().trim().toLowerCase().email("Enter your email address"),
  password: z.string().min(1, "Enter your password").max(128),
});

export async function GET() {
  return handle(async () => ({ user: await currentStaff(), demo: config.demoLabel() }));
}

export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const c = ctx();
    await rateLimit(c, req, "login", 10);
    const input = credentials.parse(await body(req));
    const auth = getAuth();
    // On success the nextCookies plugin attaches the session cookie to this response.
    const result = await auth.api
      .signInEmail({ body: input, headers: await headers() })
      .catch(() => null);
    if (!result) throw new DomainError("Sign-in failed. Check your email and password.", 401);
    const member = await c.db.query.staffMembers.findFirst({
      where: and(eq(staffMembers.userId, result.user.id), eq(staffMembers.branchId, c.branchId)),
    });
    if (!member) {
      await auth.api
        .revokeSession({ body: { token: result.token }, headers: await headers() })
        .catch(() => {});
      throw new DomainError("This account has no access to this branch.", 403);
    }
    return { ok: true, home: homeFor(member.role) };
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    await getAuth()
      .api.signOut({ headers: await headers() })
      .catch(() => {});
    return { ok: true };
  });
}
