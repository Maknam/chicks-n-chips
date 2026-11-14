// Read-only: shows which Neon branch the current env file points at and which migrations it has.
// Never prints credentials. Usage: npm run db:status (Development) / npm run db:status:prod.
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { connectionString } from "../db/client";
import { assertExpectedDb, describeDb, formatTarget } from "../db/target";

type Journal = { entries: { idx: number; when: number; tag: string }[] };

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set in this env file");
  assertExpectedDb(url);
  console.log(`Environment : ${process.env.APP_ENV || "(APP_ENV not set)"}`);
  console.log(`Target      : ${formatTarget(describeDb(url))}`);
  if (process.env.DATABASE_URL && process.env.DATABASE_URL_UNPOOLED) {
    const a = describeDb(process.env.DATABASE_URL).endpoint;
    const b = describeDb(process.env.DATABASE_URL_UNPOOLED).endpoint;
    if (a !== b) throw new Error(`DATABASE_URL (${a}) and DATABASE_URL_UNPOOLED (${b}) point at different branches`);
  }

  const journal: Journal = JSON.parse(readFileSync("db/migrations/meta/_journal.json", "utf8"));
  const pool = new Pool({ connectionString: connectionString(url), max: 1 });
  try {
    await pool.query("set default_transaction_read_only = on");
    const { rows: [server] } = await pool.query(
      "select current_database() as db, current_setting('server_version') as version, pg_is_in_recovery() as replica",
    );
    console.log(`Postgres    : ${server.version}${server.replica ? " (read replica)" : ""}`);
    const exists = await pool.query("select to_regclass('drizzle.__drizzle_migrations') as t");
    const applied = new Set<number>();
    if (exists.rows[0].t) {
      const { rows } = await pool.query("select created_at from drizzle.__drizzle_migrations");
      rows.forEach((r) => applied.add(Number(r.created_at)));
    }
    const phone = await pool.query(
      "select count(*)::int as n from information_schema.columns where table_schema = 'public' and table_name = 'user' and column_name in ('phone_number','phone_number_verified')",
    );
    console.log("\nMigrations:");
    let pending = 0;
    for (const e of journal.entries) {
      const done = applied.has(e.when);
      if (!done) pending++;
      console.log(`  ${done ? "applied" : "PENDING"}  ${e.tag}`);
    }
    const known = new Set(journal.entries.map((e) => e.when));
    const unknown = [...applied].filter((w) => !known.has(w)).length;
    if (unknown) console.log(`  WARNING: ${unknown} applied migration(s) are not in this repository's journal.`);
    console.log(`\nPhone sign-in columns (0004): ${phone.rows[0].n === 2 ? "present" : "absent"}`);
    console.log(pending ? `${pending} migration(s) pending.` : "Schema is up to date.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
