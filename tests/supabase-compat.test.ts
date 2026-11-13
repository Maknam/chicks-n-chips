// Migrations 0000–0004 and db/supabase/harden.sql on a Postgres prepared like a fresh Supabase
// project (anon/authenticated roles with Supabase's default grants on public, auth + storage schemas).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const journal = JSON.parse(readFileSync("db/migrations/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };

test("migrations apply on a Supabase-like database and hardening closes Data API access", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema auth; create schema storage; create table auth.users (id uuid primary key);
      grant usage on schema public to anon, authenticated;
      alter default privileges in schema public grant all on tables to anon, authenticated;
      alter default privileges in schema public grant all on sequences to anon, authenticated;`);
    for (const { tag } of journal.entries)
      for (const s of readFileSync(`db/migrations/${tag}.sql`, "utf8").split("--> statement-breakpoint"))
        if (s.trim()) await pg.exec(s);

    const exposed = async () =>
      (
        await pg.query<{ t: string }>(`select tablename as t from pg_tables where schemaname = 'public'
          and has_table_privilege('anon', format('%I.%I', schemaname, tablename), 'select')`)
      ).rows.length;
    assert.ok((await exposed()) > 0, "precondition: Supabase defaults expose the new tables");

    const harden = readFileSync("db/supabase/harden.sql", "utf8");
    await pg.exec(harden);
    await pg.exec(harden); // idempotent
    assert.equal(await exposed(), 0, "no table readable by anon after hardening");
    const noRls = await pg.query(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    assert.equal(noRls.rows.length, 0, "row level security on every public table");

    // Tables added by a later migration are not granted to anon either.
    await pg.exec(`create table public.future_table (id int)`);
    assert.equal(await exposed(), 0);

    // The owner (the app's role) still reads and writes normally.
    await pg.exec(`insert into restaurants (id, name) values (gen_random_uuid(), 'x')`);
    assert.equal((await pg.query<{ n: number }>("select count(*)::int as n from restaurants")).rows[0]!.n, 1);
  } finally {
    await pg.close();
  }
});
