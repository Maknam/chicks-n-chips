// Staff sign-in by phone: `send` texts a 6-digit code, `verify` checks it and signs in.
// Codes go only to numbers that belong to staff of this branch, and the response never
// says whether a number is registered.
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { handle, body, sameOrigin, rateLimit } from "@/server/http";
import { ctx } from "@/server/context";
import { getAuth } from "@/server/auth";
import { homeFor } from "@/server/staff";
import { staffMembers, user } from "@/db/schema";
import { DomainError, phoneNumber } from "@/lib/domain";

export const dynamic = "force-dynamic";

const phone = z
  .string()
  .max(30)
  .transform(phoneNumber)
  .pipe(z.string().regex(/^\+233\d{9}$/, "Enter a Ghana phone number, e.g. 0241234567"));
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), phone }),
  z.object({ action: z.literal("verify"), phone, code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") }),
]);

export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const c = ctx();
    const data = input.parse(await body(req));
    const auth = getAuth();

    if (data.action === "send") {
      await rateLimit(c, req, "otp-send", 5);
      await rateLimit(c, req, "otp-send-phone", 3, data.phone);
      const [member] = await c.db
        .select({ id: user.id })
        .from(user)
        .innerJoin(staffMembers, eq(staffMembers.userId, user.id))
        .where(and(eq(user.phoneNumber, data.phone), eq(staffMembers.branchId, c.branchId)))
        .limit(1);
      if (member) {
        try {
          await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: data.phone }, headers: await headers() });
        } catch {
          throw new DomainError("We couldn't send the code right now. Try again or sign in with email.", 503);
        }
      }
      return { ok: true };
    }

    await rateLimit(c, req, "otp-verify", 10);
    // On success the nextCookies plugin attaches the session cookie to this response.
    const result = await auth.api
      .verifyPhoneNumber({ body: { phoneNumber: data.phone, code: data.code }, headers: await headers() })
      .catch(() => null);
    if (!result?.user || !result.token)
      throw new DomainError("That code is wrong or has expired. Request a new one.", 401);
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
