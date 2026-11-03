// Staff authentication (Better Auth, email + password). Customers never sign in.
// Public sign-up is disabled: owners create staff accounts from /admin/staff.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb, type DB } from "@/db/client";
import { account, session, user, verification } from "@/db/schema";
import { config } from "./config";

function createAuth(db: DB) {
  return betterAuth({
    appName: "Chics & Chips",
    baseURL: config.appOrigin(),
    trustedOrigins: config.allowedOrigins(),
    secret: config.authSecret(),
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 10,
    },
    session: {
      // One working shift; activity extends it at most hourly.
      expiresIn: 60 * 60 * 12,
      updateAge: 60 * 60,
    },
    // Sign-in is rate limited by our own Postgres-backed limiter in /api/session.
    rateLimit: { enabled: false },
    advanced: {
      useSecureCookies: config.isProduction(),
      defaultCookieAttributes: { sameSite: "strict", httpOnly: true },
    },
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
const cache = globalThis as unknown as { ccAuth?: { db: DB; auth: Auth } };

export function getAuth(): Auth {
  const db = getDb();
  if (cache.ccAuth?.db !== db) cache.ccAuth = { db, auth: createAuth(db) };
  return cache.ccAuth.auth;
}
