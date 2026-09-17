import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { seed, bid, rid } from "../lib/seed";
test("PostgreSQL migration, atomic revision conflict, projections and tenant isolation", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      `create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as 'select null::uuid'; create role anon; create role authenticated; create role service_role; create publication supabase_realtime;`,
    );
    const sql = (
      await readFile("supabase/migrations/001_initial.sql", "utf8")
    ).replace("create extension if not exists pgcrypto;", "");
    await pg.exec(sql);
    const state = seed(true);
    const committed = await pg.query<{ ok: boolean }>(
      "select public.commit_branch($1,$2,$3,$4) as ok",
      [bid, rid, 0, JSON.stringify(state)],
    );
    assert.equal(committed.rows[0].ok, true);
    const conflict = await pg.query<{ ok: boolean }>(
      "select public.commit_branch($1,$2,$3,$4) as ok",
      [bid, rid, 0, JSON.stringify(state)],
    );
    assert.equal(conflict.rows[0].ok, false);
    const read = await pg.query<{ s: ReturnType<typeof seed> }>(
      "select public.read_branch($1,$2) as s",
      [bid, rid],
    );
    assert.equal(read.rows[0].s.orders.length, 64);
    assert.equal(read.rows[0].s.revision, 1);
    const items = await pg.query<{ n: number }>(
      "select count(*)::integer as n from public.order_items",
    );
    assert.equal(items.rows[0].n, 64);
    await assert.rejects(
      pg.query("select public.read_branch($1,$2)", [
        bid,
        "00000000-0000-4000-8000-000000000999",
      ]),
    );
    await pg.exec(
      "grant usage on schema public to anon; grant select on public.orders to anon; set role anon;",
    );
    assert.equal(
      (await pg.query("select * from public.orders")).rows.length,
      0,
    );
    await assert.rejects(
      pg.query("select public.read_branch($1,$2)", [bid, rid]),
    );
    await pg.exec("reset role;");
  } finally {
    await pg.close();
  }
});
