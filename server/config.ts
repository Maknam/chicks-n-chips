// Central access to server configuration. Read lazily so builds don't require secrets.
export const DEFAULT_RESTAURANT_ID = "00000000-0000-4000-8000-000000000001";
export const DEFAULT_BRANCH_ID = "00000000-0000-4000-8000-000000000002";

const vercelUrl = (host?: string) => (host ? `https://${host}` : undefined);

export const config = {
  branchId: () => process.env.BRANCH_ID || DEFAULT_BRANCH_ID,
  /** Canonical public origin: APP_ORIGIN, else the stable Vercel branch/production URL. */
  appOrigin: (fallback?: string) =>
    process.env.APP_ORIGIN ||
    vercelUrl(process.env.VERCEL_ENV === "production" ? process.env.VERCEL_PROJECT_PRODUCTION_URL : process.env.VERCEL_BRANCH_URL) ||
    fallback ||
    "http://localhost:3000",
  /** Every origin this deployment is served from (custom domain + Vercel URLs). */
  allowedOrigins: () =>
    [
      process.env.APP_ORIGIN,
      vercelUrl(process.env.VERCEL_URL),
      vercelUrl(process.env.VERCEL_BRANCH_URL),
      vercelUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL),
    ].filter((o): o is string => !!o),
  /** If set, only this email may create the first owner account at /setup. */
  ownerEmail: () => process.env.OWNER_EMAIL?.trim().toLowerCase() || "",
  isProduction: () => process.env.NODE_ENV === "production",
  /** Labels the UI as fictional data (staging/dev seeded with --demo). Changes no behaviour. */
  demoLabel: () => process.env.DEMO_MODE === "true",
  authSecret: () => {
    const secret = process.env.BETTER_AUTH_SECRET;
    if (secret && secret.length >= 32) return secret;
    if (process.env.NODE_ENV === "production")
      throw new Error("BETTER_AUTH_SECRET must be set (32+ characters) in production");
    return "development-only-secret-not-for-production-use";
  },
  /** Secrets accepted by the notification worker (manual scheduler or Vercel Cron). */
  workerSecrets: () =>
    [process.env.WORKER_SECRET, process.env.CRON_SECRET].filter((s): s is string => !!s && s.length >= 16),
  paystackKey: () => process.env.PAYSTACK_SECRET_KEY || "",
  mnotify: () => ({ key: process.env.MNOTIFY_API_KEY || "", sender: process.env.MNOTIFY_SENDER || "ChicsChips" }),
};
