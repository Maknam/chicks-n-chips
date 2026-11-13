// Verifies that every migration applies cleanly to a target database WITHOUT changing it:
// all migration SQL (and, on Supabase, db/supabase/harden.sql) runs inside one transaction that is
// always rolled back. Postgres DDL is transactional, so nothing persists.
//
//   npm run db:verify:prod   (needs CONFIRM_DRY_RUN=<Supabase project ref>)
//
// Never prints credentials. Refuses to run if migrations were already applied (use db:status).
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { connectionString } from "../db/client";
import { assertExpectedDb, describeDb, formatTarget } from "../db/target";

type Journal = { entries: { idx: number; when: number; tag: string }[] };

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set in this env file");
  assertExpectedDb(url);
  const target = describeDb(url);
  console.log(`Environment : ${process.env.APP_ENV || "(APP_ENV not set)"}`);
  console.log(`Target      : ${formatTarget(target)}`);
  if (process.env.CONFIRM_DRY_RUN !== target.endpoint)
    throw new Error(
      `This connects to ${target.endpoint} and runs the migrations inside a transaction that is rolled back.\n` +
        `Re-run with CONFIRM_DRY_RUN=${target.endpoint} to proceed.`,
    );

  const journal: Journal = JSON.parse(readFileSync("db/migrations/meta/_journal.json", "utf8"));
  const migrations = journal.entries.map((e) => ({
    tag: e.tag,
    statements: readFileSync(`db/migrations/${e.tag}.sql`, "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean),
  }));
  const ourTables = [
    ...new Set(migrations.flatMap((m) => m.statements.join("\n").match(/CREATE TABLE "([^"]+)"/g) ?? [])),
  ].map((s) => s.slice(14, -1));

  const pool = new Pool({ connectionString: connectionString(url), max: 1 });
  const client = await pool.connect();
  let failed = false;
  try {
    // ---- Read-only preflight ----
    const { rows: [info] } = await client.query(`
      select current_setting('server_version') as version,
             (to_regnamespace('storage') is not null and to_regnamespace('auth') is not null) as supabase,
             to_regclass('drizzle.__drizzle_migrations') is not null as migrated,
             exists(select 1 from pg_roles where rolname = 'anon') as has_anon`);
    console.log(`Postgres    : ${info.version}${info.supabase ? " (Supabase)" : ""}`);
    if (info.migrated) {
      const { rows } = await client.query("select count(*)::int as n from drizzle.__drizzle_migrations");
      throw new Error(`${rows[0].n} migration(s) are already recorded here. Use db:status instead of a dry run.`);
    }
    const { rows: clashes } = await client.query(
      "select tablename from pg_tables where schemaname = 'public' and tablename = any($1)",
      [ourTables],
    );
    if (clashes.length)
      throw new Error(`public schema already has tables named: ${clashes.map((r) => r.tablename).join(", ")}`);
    console.log(`Preflight   : empty target, ${ourTables.length} tables to create, no name clashes\n`);

    // ---- Dry run inside one transaction ----
    await client.query("begin");
    await client.query("set local lock_timeout = '5s'");
    await client.query("set local statement_timeout = '60s'");
    for (const m of migrations) {
      for (const [i, statement] of m.statements.entries()) {
        try {
          await client.query(statement);
        } catch (e) {
          failed = true;
          console.log(`  FAIL  ${m.tag} (statement ${i + 1}/${m.statements.length}): ${(e as Error).message}`);
          throw new Error("Dry run stopped at the first failure.");
        }
      }
      console.log(`  ok    ${m.tag} (${m.statements.length} statements)`);
    }
    if (info.supabase) {
      await client.query(readFileSync("db/supabase/harden.sql", "utf8"));
      console.log("  ok    db/supabase/harden.sql");
    }

    // ---- Checks on the migrated (uncommitted) schema ----
    const { rows: [counts] } = await client.query(
      "select count(*)::int as n from pg_tables where schemaname = 'public' and tablename = any($1)",
      [ourTables],
    );
    console.log(`\n  tables created: ${counts.n}/${ourTables.length}`);
    if (counts.n !== ourTables.length) failed = true;
    if (info.has_anon) {
      const { rows: exposed } = await client.query(
        `select tablename from pg_tables where schemaname = 'public' and tablename = any($1)
           and (has_table_privilege('anon', format('%I.%I', schemaname, tablename), 'select')
             or has_table_privilege('authenticated', format('%I.%I', schemaname, tablename), 'select')
             or not (select relrowsecurity from pg_class where oid = format('%I.%I', schemaname, tablename)::regclass))`,
        [ourTables],
      );
      console.log(`  Data API exposure after hardening: ${exposed.length ? exposed.map((r) => r.tablename).join(", ") : "none"}`);
      if (exposed.length) failed = true;
    }
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
    await pool.end();
  }
  console.log(failed ? "\nDry run FAILED. Rolled back; nothing was changed." : "\nAll migrations apply cleanly. Rolled back; nothing was changed.");
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
