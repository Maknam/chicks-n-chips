// Applies db/supabase/harden.sql to the production Supabase database (idempotent).
// db:migrate:prod already runs it after migrating; this is for re-applying it on its own.
//   CONFIRM_PRODUCTION_MIGRATION=<project ref> npm run db:harden:prod
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { connectionString } from "../db/client";
import { assertExpectedDb, describeDb, formatTarget } from "../db/target";

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set in this env file");
  if (process.env.APP_ENV !== "production") throw new Error("db:harden:prod needs APP_ENV=production in .env.prod");
  assertExpectedDb(url);
  const target = describeDb(url);
  if (target.provider !== "supabase") throw new Error(`Target is ${target.provider}, not Supabase`);
  if (process.env.CONFIRM_PRODUCTION_MIGRATION !== target.endpoint)
    throw new Error(`Re-run with CONFIRM_PRODUCTION_MIGRATION=${target.endpoint} to harden ${target.endpoint}.`);
  console.log(`Hardening: ${formatTarget(target)}`);
  const pool = new Pool({ connectionString: connectionString(url), max: 1 });
  try {
    await pool.query(readFileSync("db/supabase/harden.sql", "utf8"));
    console.log("Data API grants revoked and row level security enabled.");
  } finally {
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
