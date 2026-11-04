// Universal order tracking: code generation, public endpoint, privacy and abuse limits.
// Runs against the real migrations on in-process Postgres (PGlite), like services.test.ts.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { setDb, type DB } from "../db/client";
import { seedBranch } from "../server/seed";
import { DEFAULT_BRANCH_ID } from "../server/config";
import type { Ctx } from "../server/context";
import { changeStatus, createOrder, trackOrder } from "../server/services/orders";
import { generateTrackingCode } from "../server/tracking";
import { ALPHABET, CODE_LENGTH, formatCode, normalizeCode, trackingPath } from "../lib/tracking";
import { POST as trackRoute } from "../app/api/track/route";

let pg: PGlite;
let c: Ctx;
const PRODUCT = "00000000-0000-4000-8000-000000000010";

before(async () => {
  pg = new PGlite();
  const db = drizzle({ client: pg, schema }) as unknown as DB;
  await migrate(db as never, { migrationsFolder: "db/migrations" });
  await seedBranch(db);
  setDb(db);
  c = { db, branchId: DEFAULT_BRANCH_ID };
});
after(async () => {
  setDb(undefined);
  await pg.close();
});

const checkout = (over: Record<string, unknown> = {}) => ({
  requestId: randomUUID(),
  customer: "Ama Private",
  phone: "0241112233",
  pickup: "ASAP",
  payment: "CASH",
  source: "ONLINE",
  items: [{ productId: PRODUCT, qty: 1, options: [] }],
  ...over,
});

/** Calls the real route handler as a browser on another device would. */
let ipCounter = 0;
async function callTrack(code: unknown, ip = `10.0.0.${++ipCounter}`) {
  const res = await trackRoute(
    new Request("http://localhost/api/track", {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ code }),
    }),
  );
  return { status: res.status, body: await res.json(), headers: res.headers };
}

test("codes are random, well-formed and normalise from what people type", () => {
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  for (let i = 0; i < 5000; i++) {
    const code = generateTrackingCode();
    assert.equal(code.length, CODE_LENGTH);
    for (const ch of code) {
      assert.ok(ALPHABET.includes(ch));
      counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
    seen.add(code);
  }
  assert.equal(seen.size, 5000, "no collisions in 5,000 codes");
  // Every symbol is used, roughly evenly (expected ≈ 1613 each; allow wide slack).
  assert.equal(counts.size, ALPHABET.length);
  for (const n of counts.values()) assert.ok(n > 1300 && n < 1950, `symbol frequency ${n}`);

  const code = "K4M2Q9RX7T";
  assert.equal(formatCode(code), "CC-K4M2Q-9RX7T");
  for (const typed of ["CC-K4M2Q-9RX7T", "cc k4m2q 9rx7t", "k4m2q9rx7t", "https://x.app/orders#CC-K4M2Q-9RX7T"])
    assert.equal(normalizeCode(typed), code, typed);
  for (const bad of ["", "CC-K4M2Q", "K4M2Q9RX7O", "K4M2Q9RX71", "1000", "<script>"]) assert.equal(normalizeCode(bad), null, bad);
  assert.equal(trackingPath(code), "/orders#CC-K4M2Q-9RX7T");
});

test("an order placed on one device can be tracked anywhere with only its code", async () => {
  const order = await createOrder(c, checkout(), "guest");
  assert.ok(normalizeCode(order.trackingCode), "checkout returns a tracking code");

  // "Device B": no receipt token, no local storage, no login — just the code, typed casually.
  const typed = formatCode(order.trackingCode).toLowerCase().replace(/-/g, " ");
  const r = await callTrack(typed);
  assert.equal(r.status, 200);
  assert.equal(r.body.order.number, order.number);
  assert.equal(r.body.order.status, "NEW");
  assert.equal(r.body.order.timeline[0].state, "current");
  assert.equal(r.headers.get("cache-control"), "no-store");

  // Kitchen updates show up.
  await changeStatus(c, order.id, "ACCEPTED", "kitchen");
  await changeStatus(c, order.id, "PREPARING", "kitchen");
  const live = (await trackOrder(c, order.trackingCode))!;
  assert.equal(live.status, "PREPARING");
  assert.deepEqual(
    live.timeline.map((s) => s.state),
    ["done", "done", "current", "upcoming", "upcoming"],
  );
  assert.ok(live.timeline[2].at, "preparing has a timestamp");
});

test("idempotent checkout keeps the same code", async () => {
  const input = checkout();
  const a = await createOrder(c, input, "guest");
  const b = await createOrder(c, input, "guest");
  assert.equal(a.trackingCode, b.trackingCode);
});

test("public response contains no private order data", async () => {
  const order = await createOrder(c, checkout({ customer: "Kofi Secretname", phone: "0249876543" }), "guest");
  const r = await callTrack(order.trackingCode);
  const text = JSON.stringify(r.body);
  for (const secret of ["Kofi", "Secretname", "249876543", order.id, order.customerId, order.reference, order.requestId || "-none-"])
    assert.ok(!text.includes(secret), `leaked ${secret}`);
  for (const key of ["id", "customer", "phone", "customerId", "reference", "token", "requestId", "paymentUrl"])
    assert.ok(!(key in r.body.order), `has key ${key}`);
});

test("cancelled orders are reported as cancelled, not as progress", async () => {
  const order = await createOrder(c, checkout(), "guest");
  await changeStatus(c, order.id, "CANCELLED", "kitchen");
  const t = (await trackOrder(c, order.trackingCode))!;
  assert.equal(t.cancelled, true);
  assert.equal(t.closed, true);
  assert.equal(t.statusLabel, "Cancelled");
});

test("unknown and malformed codes get the same safe answer", async () => {
  const unknown = await callTrack("CC-ZZZZZ-ZZZZZ");
  const malformed = await callTrack("1000");
  const missing = await callTrack(undefined);
  for (const r of [unknown, malformed, missing]) {
    assert.equal(r.status, 404);
    assert.equal(r.body.error, unknown.body.error);
  }
  // Order numbers alone never work as credentials.
  assert.equal(await trackOrder(c, "1000"), null);
});

test("guessing is rate limited per client", async () => {
  const ip = "203.0.113.7";
  const statuses: number[] = [];
  for (let i = 0; i < 12; i++) statuses.push((await callTrack(`CC-ZZZZZ-ZZZZ${ALPHABET[i]}`, ip)).status);
  assert.deepEqual(statuses.slice(0, 10), Array(10).fill(404));
  assert.ok(statuses.slice(10).every((s) => s === 429), `after 10 misses: ${statuses.slice(10)}`);
});

test("cross-origin requests are refused", async () => {
  const res = await trackRoute(
    new Request("http://localhost/api/track", {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: JSON.stringify({ code: "CC-ZZZZZ-ZZZZZ" }),
    }),
  );
  assert.equal(res.status, 403);
});

test("migration backfill gives existing orders unique, valid codes", async () => {
  // Re-run the backfill statement from the migration over every order and check the result.
  const migration = readFileSync("db/migrations/0003_order_tracking_code.sql", "utf8");
  const update = migration.split("--> statement-breakpoint").find((s) => s.includes("UPDATE"))!;
  for (let i = 0; i < 20; i++) await createOrder(c, checkout(), "guest");
  await c.db.execute(sql.raw(update));
  const rows = (await c.db.execute(sql`select tracking_code from orders`)) as unknown as { rows: { tracking_code: string }[] };
  const codes = rows.rows.map((r) => r.tracking_code);
  assert.ok(codes.length >= 20, `rows: ${codes.length}`);
  assert.equal(new Set(codes).size, codes.length, "unique per row");
  for (const code of codes) assert.ok(normalizeCode(code), `valid: ${code}`);
});
