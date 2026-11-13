// Applies pending migrations from db/migrations over the direct/session connection (never the transaction pooler).
// Additive only: Drizzle runs each new SQL file once, in order, inside a transaction.
//
//   npm run db:migrate        → .env.local (Neon Development)
//   npm run db:migrate:prod   → .env.prod  (Supabase production), needs explicit confirmation:
//     CONFIRM_PRODUCTION_MIGRATION=<Supabase project ref> npm run db:migrate:prod
//   On Supabase, db/supabase/harden.sql runs right after, so new tables are never left exposed.
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { connectionString } from "../db/client";
import { assertExpectedDb, describeDb, formatTarget } from "../db/target";

async function main() {
  const production = process.argv.includes("--production");
  const env = process.env.APP_ENV || "";
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL (and ideally DATABASE_URL_UNPOOLED) first");
  assertExpectedDb(url);
  const target = describeDb(url);

  if (production) {
    if (env !== "production") throw new Error("db:migrate:prod needs APP_ENV=production in .env.prod");
    if (process.env.CONFIRM_PRODUCTION_MIGRATION !== target.endpoint)
      throw new Error(
        `Refusing to migrate production (${target.endpoint}) without confirmation.\n` +
          "1. Take a backup first (Supabase: Database → Backups, or pg_dump).\n" +
          `2. Re-run: CONFIRM_PRODUCTION_MIGRATION=${target.endpoint} npm run db:migrate:prod`,
      );
  } else if (env === "production") {
    throw new Error("This env file is marked APP_ENV=production. Use npm run db:migrate:prod.");
  }

  console.log(`Migrating ${env || "(APP_ENV not set)"}: ${formatTarget(target)}`);
  const pool = new Pool({ connectionString: connectionString(url), max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "db/migrations" });
    console.log("Migrations applied.");
    if (target.provider === "supabase") {
      await pool.query(readFileSync("db/supabase/harden.sql", "utf8"));
      console.log("Supabase hardening applied (Data API grants revoked, RLS enabled).");
    }
  } finally {
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
