// Staff authentication (Better Auth): email + password, or phone + SMS code. Customers never sign in.
// Public sign-up is disabled: owners create staff accounts from /admin/staff.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { phoneNumber } from "better-auth/plugins/phone-number";
import { getDb, type DB } from "@/db/client";
import { account, session, user, verification } from "@/db/schema";
import { config } from "./config";
import { MNotifyProvider } from "./services/notifications";

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
    plugins: [
      // Endpoints are only reached through our own /api/session/phone route, which rate limits
      // and only texts numbers that belong to staff of this branch. No public sign-up.
      phoneNumber({
        otpLength: 6,
        expiresIn: 5 * 60,
        allowedAttempts: 3,
        phoneNumberValidator: (p) => /^\+233\d{9}$/.test(p),
        sendOTP: async ({ phoneNumber: to, code }) => {
          if (!config.mnotify().key && !config.isProduction()) {
            // Local development without SMS credentials: read the code from the server log.
            console.info(`[dev] Sign-in code for ${to}: ${code}`);
            return;
          }
          await new MNotifyProvider().sendSMS(
            to,
            `Chics & Chips sign-in code: ${code}. It expires in 5 minutes. Never share it.`,
          );
        },
      }),
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
// One auth instance per database instance. On Workers each request has its own database (see
// db/client.ts), so an instance — and the connections it holds — never crosses requests.
const instances = new WeakMap<DB, Auth>();

export function getAuth(): Auth {
  const db = getDb();
  let auth = instances.get(db);
  if (!auth) instances.set(db, (auth = createAuth(db)));
  return auth;
}
