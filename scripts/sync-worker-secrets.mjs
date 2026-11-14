// Pushes the production Worker's runtime configuration from the CI environment (GitHub
// `production` environment secrets/variables) to Cloudflare as encrypted Worker secrets.
// Nothing is written to disk or passed on the command line: JSON goes to `wrangler secret bulk`
// over stdin. Prints names only. Empty values are skipped (an unset optional integration stays unset).
//   Used by .github/workflows/deploy-production.yml after `npm run deploy`.
import { spawnSync } from "node:child_process";

// Required: the Worker refuses to run sign-in / receipts / health diagnostics without these.
const REQUIRED = ["BETTER_AUTH_SECRET", "RECEIPT_SECRET", "WORKER_SECRET", "APP_ORIGIN", "OWNER_EMAIL"];
// Optional: integrations and verification metadata.
const OPTIONAL = ["DATABASE_ENDPOINT", "MNOTIFY_API_KEY", "PAYSTACK_SECRET_KEY", "SENTRY_DSN"];

const missing = REQUIRED.filter((k) => !process.env[k]?.trim());
if (missing.length) {
  console.error(`Missing in the GitHub cloudflare-production environment: ${missing.join(", ")}`);
  process.exit(1);
}
for (const k of ["BETTER_AUTH_SECRET", "RECEIPT_SECRET", "WORKER_SECRET"])
  if (process.env[k].length < 32) {
    console.error(`${k} must be at least 32 characters`);
    process.exit(1);
  }
const origin = process.env.APP_ORIGIN.trim();
if (!/^https:\/\/[^/\s]+$/.test(origin)) {
  console.error("APP_ORIGIN must be https://host with no path or trailing slash");
  process.exit(1);
}

const secrets = Object.fromEntries(
  [...REQUIRED, ...OPTIONAL].filter((k) => process.env[k]?.trim()).map((k) => [k, process.env[k].trim()]),
);
const r = spawnSync("npx", ["--no-install", "wrangler", "secret", "bulk"], {
  input: JSON.stringify(secrets),
  encoding: "utf8",
  stdio: ["pipe", "pipe", "pipe"],
});
// Wrangler prints names, never values; scrub anyway before echoing.
let out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
for (const v of Object.values(secrets)) if (v.length >= 6) out = out.split(v).join("***");
if (r.status !== 0) {
  console.error(out);
  process.exit(1);
}
console.log(`Synced ${Object.keys(secrets).length} Worker secrets: ${Object.keys(secrets).join(", ")}`);
