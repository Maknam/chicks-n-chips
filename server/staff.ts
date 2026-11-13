// Staff identity, branch membership and role-based access.
import { headers } from "next/headers";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { staffMembers, user } from "@/db/schema";
import { DomainError, ROLES, phoneNumber, type Role } from "@/lib/domain";
import { getAuth } from "./auth";
import { ctx, transaction, type Ctx } from "./context";
import { audit, bumpRevision } from "./services/branch";

export const permissions = {
  overview: ["OWNER", "MANAGER"],
  orders: ["OWNER", "MANAGER", "CASHIER"],
  menu: ["OWNER", "MANAGER", "KITCHEN"],
  customers: ["OWNER", "MANAGER"],
  inventory: ["OWNER", "MANAGER"],
  reports: ["OWNER", "MANAGER"],
  staff: ["OWNER"],
  settings: ["OWNER"],
  kitchen: ROLES,
  pos: ["OWNER", "MANAGER", "CASHIER"],
} satisfies Record<string, Role[]>;
export type Area = keyof typeof permissions;
export const isArea = (a: string): a is Area => a in permissions;
export const canAccess = (role: Role, area: Area) => (permissions[area] as readonly Role[]).includes(role);
export const homeFor = (role: Role) =>
  role === "KITCHEN" ? "/kitchen" : role === "CASHIER" ? "/pos" : "/admin";

export type StaffUser = { id: string; name: string; email: string; role: Role };

/** The signed-in staff member for this branch, or null. Membership is checked on every call. */
export async function currentStaff(c?: Ctx): Promise<StaffUser | null> {
  // Read request headers before touching the database: this marks pages as dynamic,
  // so `next build` never opens a connection while prerendering.
  const requestHeaders = await headers();
  const result = await getAuth().api.getSession({ headers: requestHeaders });
  if (!result) return null;
  c ??= ctx();
  const member = await c.db.query.staffMembers.findFirst({
    where: and(eq(staffMembers.userId, result.user.id), eq(staffMembers.branchId, c.branchId)),
  });
  if (!member) return null;
  return { id: result.user.id, name: result.user.name, email: result.user.email, role: member.role };
}

export async function requireStaff(area: Area, c?: Ctx) {
  const staff = await currentStaff(c);
  if (!staff) throw new DomainError("Please sign in", 401);
  if (!canAccess(staff.role, area)) throw new DomainError("Your role cannot access this area", 403);
  return staff;
}

export async function listMembers(c: Ctx) {
  const rows = await c.db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      phone: user.phoneNumber,
      phoneVerified: user.phoneNumberVerified,
      role: staffMembers.role,
      since: staffMembers.createdAt,
    })
    .from(staffMembers)
    .innerJoin(user, eq(user.id, staffMembers.userId))
    .where(eq(staffMembers.branchId, c.branchId))
    .orderBy(asc(user.name));
  return rows;
}

export const staffInput = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(10).max(128).optional(),
  role: z.enum(["OWNER", "MANAGER", "CASHIER", "KITCHEN"]),
});

/**
 * Creates a staff login (if the email is new) and grants it a role in this branch.
 * Existing accounts keep their password; only the membership changes.
 */
export async function upsertStaff(c: Ctx, raw: unknown, actorId: string) {
  const input = staffInput.parse(raw);
  const auth = getAuth();
  const internal = (await auth.$context).internalAdapter;
  const hash = (await auth.$context).password.hash;
  let existing = await c.db.query.user.findFirst({ where: eq(user.email, input.email) });
  if (existing?.id === actorId) throw new DomainError("Ask another owner to change your role");
  if (!existing) {
    if (!input.password) throw new DomainError("Set a temporary password (10+ characters) for new staff");
    const created = await internal.createUser(
      { name: input.name, email: input.email, emailVerified: true },
      { method: "email-password" },
    );
    await internal.linkAccount({
      userId: created.id,
      providerId: "credential",
      accountId: created.id,
      password: await hash(input.password),
    });
    existing = await c.db.query.user.findFirst({ where: eq(user.id, created.id) });
  }
  const userId = existing!.id;
  await transaction(c, async (t) => {
    await t.db
      .insert(staffMembers)
      .values({ userId, branchId: t.branchId, role: input.role })
      .onConflictDoUpdate({
        target: [staffMembers.userId, staffMembers.branchId],
        set: { role: input.role, updatedAt: new Date() },
      });
    await audit(t, "STAFF_ROLE_CHANGED", actorId, userId, { role: input.role });
    await bumpRevision(t);
  });
  return { userId };
}

export async function removeStaff(c: Ctx, userId: string, actorId: string) {
  if (userId === actorId) throw new DomainError("You cannot remove yourself");
  await transaction(c, async (t) => {
    await t.db
      .delete(staffMembers)
      .where(and(eq(staffMembers.userId, userId), eq(staffMembers.branchId, t.branchId)));
    await audit(t, "STAFF_REMOVED", actorId, userId);
    await bumpRevision(t);
  });
}

/** Ghana mobile number in E.164, or "" to clear. */
export const staffPhone = z
  .string()
  .max(30)
  .transform(phoneNumber)
  .pipe(z.string().regex(/^(\+233\d{9})?$/, "Use a Ghana phone number, e.g. 0241234567"));

/** Throws if another account already uses this number. */
export async function assertPhoneFree(c: Ctx, phone: string, exceptUserId?: string) {
  if (!phone) return;
  const taken = await c.db.query.user.findFirst({ where: eq(user.phoneNumber, phone) });
  if (taken && taken.id !== exceptUserId)
    throw new DomainError("That phone number is already used by another account.", 409);
}

const phoneInput = z.object({ userId: z.string().min(1), phone: staffPhone });

/** Sets or clears the number a staff member signs in with. A new number starts unverified. */
export async function setStaffPhone(c: Ctx, raw: unknown, actorId: string) {
  const input = phoneInput.parse(raw);
  const member = await c.db.query.staffMembers.findFirst({
    where: and(eq(staffMembers.userId, input.userId), eq(staffMembers.branchId, c.branchId)),
  });
  if (!member) throw new DomainError("Staff member not found", 404);
  await assertPhoneFree(c, input.phone, input.userId);
  await transaction(c, async (t) => {
    const current = await t.db.query.user.findFirst({ where: eq(user.id, input.userId) });
    if (current?.phoneNumber === (input.phone || null)) return;
    await t.db
      .update(user)
      .set({ phoneNumber: input.phone || null, phoneNumberVerified: false, updatedAt: new Date() })
      .where(eq(user.id, input.userId));
    await audit(t, input.phone ? "STAFF_PHONE_SET" : "STAFF_PHONE_REMOVED", actorId, input.userId);
    await bumpRevision(t);
  });
}
