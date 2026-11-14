// Logical backup with pg_dump, without putting credentials on the command line or in logs.
//   node --env-file=.env.prod scripts/db-backup.mjs <label> [schema ...]
// Reads DATABASE_URL_UNPOOLED (or DATABASE_URL), passes it to pg_dump through PG* environment
// variables, and writes backups/<label>-<timestamp>.dump (custom format; restore with pg_restore).
// Read-only on the database. Set PG_DUMP to the pg_dump path if it is not the default below.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rootCertificates } from "node:tls";

/** Node's bundled Mozilla roots as a PEM file: libpq's "system" store is unreliable on Windows. */
function publicRoots() {
  const file = join(tmpdir(), "cc-public-roots.pem");
  writeFileSync(file, rootCertificates.join("\n"));
  return file;
}

const [label = "backup", ...schemas] = process.argv.slice(2);
const raw = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!raw) throw new Error("No DATABASE_URL in this env file");
const u = new URL(raw);
const pgDump =
  process.env.PG_DUMP ||
  ["C:/Program Files/PostgreSQL/17/bin/pg_dump.exe", "/usr/bin/pg_dump"].find((p) => existsSync(p)) ||
  "pg_dump";

mkdirSync("backups", { recursive: true });
const file = `backups/${label}-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`;
const env = {
  ...process.env,
  PGHOST: u.hostname,
  PGPORT: u.port || "5432",
  PGUSER: decodeURIComponent(u.username),
  PGPASSWORD: decodeURIComponent(u.password),
  PGDATABASE: u.pathname.slice(1) || "postgres",
  PGSSLMODE: u.searchParams.get("sslmode") === "require" ? "verify-full" : u.searchParams.get("sslmode") || "verify-full",
  // Private CA (Supabase) from the URL; otherwise the public roots (Neon uses a public CA).
  PGSSLROOTCERT: u.searchParams.get("sslrootcert") || publicRoots(),
};
const args = ["--format=custom", "--no-owner", "--no-privileges", `--file=${file}`, ...schemas.map((s) => `--schema=${s}`)];
console.log(`pg_dump ${u.hostname.split(".")[0]}… ${schemas.length ? `schemas: ${schemas.join(", ")}` : "all schemas"} → ${file}`);
const r = spawnSync(pgDump, args, { env, stdio: ["ignore", "inherit", "pipe"], encoding: "utf8" });
// pg_dump never prints the password, but scrub it anyway before showing errors.
const err = (r.stderr || "").split(env.PGPASSWORD).join("***");
if (r.status !== 0) {
  console.error(err || r.error?.message);
  process.exit(1);
}
if (err.trim()) console.error(err);
console.log(`Backup written: ${file} (${statSync(file).size} bytes)`);
