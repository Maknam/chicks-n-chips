import { cookies } from "next/headers";
import { handle, body, sameOrigin, rateLimit } from "@/lib/http";
import { signDemo, roles, staff } from "@/lib/auth";
import { demoMode, db } from "@/lib/repository";
import { DomainError } from "@/lib/domain";
export async function GET() {
  return handle(async () => ({ user: await staff(), demo: demoMode() }));
}
export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    await rateLimit(req, "login", 10);
    const data = await body(req);
    let token: string;
    if (demoMode()) {
      if (!roles.includes(data.role)) throw new DomainError("Select a role");
      token = signDemo(data.role);
    } else {
      const { data: session, error } = await db().auth.signInWithPassword({
        email: String(data.email),
        password: String(data.password),
      });
      if (error || !session.session)
        throw new DomainError("Sign-in failed", 401);
      token = session.session.access_token;
    }
    const jar = await cookies();
    jar.set("cc_staff", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: demoMode() ? 28800 : 3600,
    });
    return { ok: true };
  });
}
export async function DELETE(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    (await cookies()).delete("cc_staff");
    return { ok: true };
  });
}
