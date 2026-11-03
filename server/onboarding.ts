// Self-service staff onboarding without email:
// - SETUP: one-time code (issued from the CLI) lets the restaurant owner create the first OWNER account.
// - INVITE: owner-generated link; the staff member chooses their own name and password.
// - RESET: owner-generated link; an existing staff member sets a new password.
// Only SHA-256 hashes of codes/links are stored. All are single-use and expire.
import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { accessTokens, session, staffMembers, user } from "@/db/schema";
import { DomainError, type Role } from "@/lib/domain";
import { getAuth } from "./auth";
import { transaction, type Ctx } from "./context";
import { audit, bumpRevision } from "./services/branch";

const HOURS = 3600_000;
const TTL = { SETUP: 7 * 24 * HOURS, INVITE: 72 * HOURS, RESET: 24 * HOURS } as const;
type Kind = keyof typeof TTL;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(24).toString("base64url");

export const password = z
  .string()
  .min(10, "Use at least 10 characters for your password")
  .max(128, "Password is too long");
const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(200);
const name = z.string().trim().min(2, "Enter your name").max(80);

async function issue(
  c: Ctx,
  kind: Kind,
  createdBy: string,
  fields: { email?: string; name?: string; role?: Role; userId?: string } = {},
) {
  const token = newToken();
  await c.db.insert(accessTokens).values({
    branchId: c.branchId,
    kind,
    tokenHash: hash(token),
    createdBy,
    expiresAt: new Date(Date.now() + TTL[kind]),
    ...fields,
  });
  return token;
}

/** Finds a usable token and locks it, so it can only be consumed once. */
async function claim(t: Ctx, kind: Kind, token: string) {
  const [row] = await t.db
    .select()
    .from(accessTokens)
    .where(
      and(
        eq(accessTokens.tokenHash, hash(token)),
        eq(accessTokens.branchId, t.branchId),
        eq(accessTokens.kind, kind),
        isNull(accessTokens.usedAt),
        gt(accessTokens.expiresAt, new Date()),
      ),
    )
    .for("update");
  if (!row) throw new DomainError("This link or code is invalid, already used or expired.", 410);
  await t.db.update(accessTokens).set({ usedAt: new Date() }).where(eq(accessTokens.id, row.id));
  return row;
}

async function createAccount(name: string, email: string, plain: string) {
  const context = await getAuth().$context;
  const created = await context.internalAdapter.createUser(
    { name, email, emailVerified: true },
    { method: "email-password" },
  );
  await context.internalAdapter.linkAccount({
    userId: created.id,
    providerId: "credential",
    accountId: created.id,
    password: await context.password.hash(plain),
  });
  return created.id;
}

/** Signs the browser in after onboarding (sets the session cookie on this response). */
async function signIn(emailAddress: string, plain: string) {
  await getAuth().api.signInEmail({
    body: { email: emailAddress, password: plain },
    headers: await headers(),
  });
}

// ---------- Owner setup ----------

export async function hasOwner(c: Ctx) {
  const [row] = await c.db
    .select({ userId: staffMembers.userId })
    .from(staffMembers)
    .where(and(eq(staffMembers.branchId, c.branchId), eq(staffMembers.role, "OWNER")))
    .limit(1);
  return !!row;
}

/** CLI only: issues a fresh one-time owner setup code (older unused codes are revoked). */
export async function issueSetupCode(c: Ctx) {
  if (await hasOwner(c)) throw new Error("This branch already has an owner. Owners invite staff from /admin/staff.");
  await c.db
    .update(accessTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(accessTokens.branchId, c.branchId), eq(accessTokens.kind, "SETUP"), isNull(accessTokens.usedAt)));
  return issue(c, "SETUP", "cli");
}

const setupInput = z.object({ code: z.string().trim().min(10).max(100), name, email, password });

export async function completeSetup(c: Ctx, raw: unknown) {
  const input = setupInput.parse(raw);
  await transaction(c, async (t) => {
    if (await hasOwner(t)) throw new DomainError("This workspace is already set up. Sign in instead.", 409);
    await claim(t, "SETUP", input.code);
    const taken = await t.db.query.user.findFirst({ where: eq(user.email, input.email) });
    if (taken) throw new DomainError("An account with this email already exists.", 409);
    const userId = await createAccount(input.name, input.email, input.password);
    await t.db.insert(staffMembers).values({ userId, branchId: t.branchId, role: "OWNER" });
    await audit(t, "OWNER_SETUP", userId, userId);
    await bumpRevision(t);
  });
  await signIn(input.email, input.password);
  return { home: "/admin" };
}

// ---------- Invites ----------

const inviteInput = z.object({ name, email, role: z.enum(["OWNER", "MANAGER", "CASHIER", "KITCHEN"]) });

/** Returns an invite token for a new person, or adds an existing account directly. */
export async function createInvite(c: Ctx, raw: unknown, actorId: string) {
  const input = inviteInput.parse(raw);
  const existing = await c.db.query.user.findFirst({ where: eq(user.email, input.email) });
  if (existing) {
    if (existing.id === actorId) throw new DomainError("You cannot change your own role.");
    await transaction(c, async (t) => {
      await t.db
        .insert(staffMembers)
        .values({ userId: existing.id, branchId: t.branchId, role: input.role })
        .onConflictDoUpdate({
          target: [staffMembers.userId, staffMembers.branchId],
          set: { role: input.role, updatedAt: new Date() },
        });
      await audit(t, "STAFF_ROLE_CHANGED", actorId, existing.id, { role: input.role });
      await bumpRevision(t);
    });
    return { token: null, existing: true };
  }
  const token = await issue(c, "INVITE", actorId, input);
  await audit(c, "STAFF_INVITED", actorId, input.email, { role: input.role });
  return { token, existing: false };
}

export async function createResetLink(c: Ctx, userId: string, actorId: string) {
  const member = await c.db.query.staffMembers.findFirst({
    where: and(eq(staffMembers.userId, userId), eq(staffMembers.branchId, c.branchId)),
  });
  if (!member) throw new DomainError("Staff member not found", 404);
  const token = await issue(c, "RESET", actorId, { userId });
  await audit(c, "PASSWORD_RESET_ISSUED", actorId, userId);
  return token;
}

/** What the join page shows before the person sets a password. Does not consume the link. */
export async function describeLink(c: Ctx, token: string) {
  const row = await c.db.query.accessTokens.findFirst({
    where: and(
      eq(accessTokens.tokenHash, hash(token)),
      eq(accessTokens.branchId, c.branchId),
      isNull(accessTokens.usedAt),
      gt(accessTokens.expiresAt, new Date()),
    ),
  });
  if (!row || row.kind === "SETUP") throw new DomainError("This link is invalid, already used or expired.", 410);
  if (row.kind === "RESET") {
    const account = await c.db.query.user.findFirst({ where: eq(user.id, row.userId!) });
    return { kind: row.kind, email: account?.email ?? "", name: account?.name ?? "", role: null };
  }
  return { kind: row.kind, email: row.email!, name: row.name ?? "", role: row.role };
}

const acceptInput = z.object({ token: z.string().min(10).max(100), name: name.optional(), password });

export async function acceptLink(c: Ctx, raw: unknown) {
  const input = acceptInput.parse(raw);
  const context = await getAuth().$context;
  const result = await transaction(c, async (t) => {
    const preview = await describeLink(t, input.token);
    const row = await claim(t, preview.kind, input.token);
    if (row.kind === "RESET") {
      await context.internalAdapter.updatePassword(row.userId!, await context.password.hash(input.password));
      // Sign out everywhere else: the old password may be compromised.
      await t.db.delete(session).where(eq(session.userId, row.userId!));
      await audit(t, "PASSWORD_RESET", row.userId!, row.userId!);
      return { email: preview.email };
    }
    const taken = await t.db.query.user.findFirst({ where: eq(user.email, row.email!) });
    if (taken) throw new DomainError("An account with this email already exists. Ask the owner to add it.", 409);
    const userId = await createAccount(input.name ?? row.name ?? row.email!, row.email!, input.password);
    await t.db.insert(staffMembers).values({ userId, branchId: t.branchId, role: row.role! });
    await audit(t, "STAFF_JOINED", userId, userId, { role: row.role });
    await bumpRevision(t);
    return { email: row.email! };
  });
  await signIn(result.email, input.password);
  return { ok: true };
}

// ---------- Own password ----------

const changeInput = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password });

export async function changeOwnPassword(raw: unknown) {
  const input = changeInput.parse(raw);
  try {
    await getAuth().api.changePassword({
      body: { ...input, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch {
    throw new DomainError("Current password is incorrect.", 400);
  }
}
