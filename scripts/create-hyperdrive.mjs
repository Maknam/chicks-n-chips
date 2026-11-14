// Creates the production Hyperdrive config for Supabase, from .env.prod, without printing credentials.
//   node --env-file=.env.prod scripts/create-hyperdrive.mjs
// 1. Uploads certs/supabase-prod-ca.crt as a Cloudflare CA certificate (reuses one with the same name).
// 2. Creates Hyperdrive "chicks-n-chips-prod" → Supabase session pooler, sslmode verify-full against
//    that CA, query caching disabled (the app polls for fresh orders and reads sessions per request).
// Prints only the resulting Hyperdrive id, to paste into wrangler.jsonc. Changes no database data.
import { spawnSync } from "node:child_process";

const NAME = "chicks-n-chips-prod";
const CA_NAME = "supabase-prod-ca";
const raw = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (process.env.APP_ENV !== "production" || !raw) throw new Error("Run with --env-file=.env.prod");
const url = new URL(raw);
if (!url.hostname.endsWith(".pooler.supabase.com") || url.port === "6543")
  throw new Error("Use the Supabase session pooler (port 5432) as the Hyperdrive origin");
const password = decodeURIComponent(url.password);
const scrub = (s) => String(s ?? "").split(password).join("***").split(url.password).join("***");

function wrangler(args) {
  const r = spawnSync("npx", ["--no-install", "wrangler", ...args], { encoding: "utf8", shell: process.platform === "win32" });
  return { ok: r.status === 0, out: scrub(r.stdout) + scrub(r.stderr) };
}

// 1. CA certificate
let caId = wrangler(["cert", "list"]).out.match(new RegExp(`ID:\\s*([0-9a-f-]{36})[\\s\\S]*?Name:\\s*${CA_NAME}\\b`))?.[1];
if (!caId) {
  const up = wrangler(["cert", "upload", "certificate-authority", "--ca-cert", "certs/supabase-prod-ca.crt", "--name", CA_NAME]);
  caId = up.out.match(/ID:\s*([0-9a-f-]{36})/)?.[1];
  if (!up.ok || !caId) throw new Error(`CA upload failed:\n${up.out}`);
  console.log(`Uploaded CA certificate ${CA_NAME}: ${caId}`);
} else console.log(`Reusing CA certificate ${CA_NAME}: ${caId}`);

// 2. Hyperdrive (individual origin flags so the URL's sslrootcert parameter is not sent)
const created = wrangler([
  "hyperdrive", "create", NAME,
  "--origin-host", url.hostname,
  "--origin-port", url.port || "5432",
  "--database", url.pathname.slice(1) || "postgres",
  "--origin-user", decodeURIComponent(url.username),
  "--origin-password", JSON.stringify(password),
  "--sslmode", "verify-full",
  "--ca-certificate-id", caId,
  "--caching-disabled",
]);
const id = created.out.match(/"id":\s*"([0-9a-f]{32})"/)?.[1] ?? created.out.match(/\b([0-9a-f]{32})\b/)?.[1];
if (!created.ok || !id) throw new Error(`Hyperdrive creation failed:\n${created.out}`);
console.log(`Created Hyperdrive ${NAME}: ${id}\nPut this id in wrangler.jsonc → hyperdrive[0].id`);
