import { cookies } from "next/headers";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { branchId, db, demoMode, restaurantId } from "./repository";
import { DomainError, type Role } from "./domain";
const globals = globalThis as unknown as { ccSecret?: string };
const secret = () =>
  process.env.SESSION_SECRET ||
  (globals.ccSecret ??= randomBytes(32).toString("hex"));
export const roles: Role[] = ["OWNER", "MANAGER", "CASHIER", "KITCHEN"];
export const permissions = {
  overview: ["OWNER", "MANAGER"],
  orders: ["OWNER", "MANAGER", "CASHIER"],
  menu: ["OWNER", "MANAGER", "KITCHEN"],
  customers: ["OWNER", "MANAGER"],
  inventory: ["OWNER", "MANAGER"],
  reports: ["OWNER", "MANAGER"],
  staff: ["OWNER"],
  settings: ["OWNER"],
  kitchen: roles,
  pos: ["OWNER", "MANAGER", "CASHIER"],
} satisfies Record<string, Role[]>;
export type Area = keyof typeof permissions;
export function signDemo(role: Role) {
  const payload = Buffer.from(
    JSON.stringify({ role, expires: Date.now() + 8 * 3600000 }),
  ).toString("base64url");
  return (
    payload + "." + createHmac("sha256", secret()).update(payload).digest("hex")
  );
}
export async function staff(): Promise<{ id: string; role: Role } | null> {
  const token = (await cookies()).get("cc_staff")?.value;
  if (!token) return null;
  if (demoMode()) {
    try {
      const [payload, signature] = token.split(".");
      const expected = createHmac("sha256", secret())
        .update(payload)
        .digest("hex");
      if (
        signature?.length !== expected.length ||
        !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
      )
        return null;
      const data = JSON.parse(Buffer.from(payload, "base64url").toString());
      return data.expires > Date.now() && roles.includes(data.role)
        ? { id: `demo-${data.role}`, role: data.role }
        : null;
    } catch {
      return null;
    }
  }
  const { data: user } = await db().auth.getUser(token);
  if (!user.user) return null;
  const { data } = await db()
    .from("staff_roles")
    .select("role")
    .eq("user_id", user.user.id)
    .eq("branch_id", branchId())
    .eq("restaurant_id", restaurantId())
    .single();
  return data && roles.includes(data.role)
    ? { id: user.user.id, role: data.role }
    : null;
}
export async function requireStaff(area: Area) {
  const user = await staff();
  if (!user) throw new DomainError("Please sign in", 401);
  if (!(permissions[area] as readonly string[]).includes(user.role))
    throw new DomainError("Your role cannot access this area", 403);
  return user;
}
