// Cloudflare Workers forbid reusing a connection across requests: every request must get its own
// database (and auth instance), built from the HYPERDRIVE binding. Simulates the Workers runtime.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../db/client";
import { getAuth } from "../server/auth";

const CONTEXT = Symbol.for("__cloudflare-context__");
const g = globalThis as Record<PropertyKey, unknown>;
let current: object | undefined;
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const request = (env: Record<string, unknown>) => ({ env, ctx: {}, cf: {} });
const hyperdrive = { HYPERDRIVE: { connectionString: "postgresql://u:p@hyperdrive.local:5432/postgres" } };

before(() => {
  Object.defineProperty(globalThis, "navigator", { value: { userAgent: "Cloudflare-Workers" }, configurable: true });
  Object.defineProperty(globalThis, CONTEXT, { get: () => current, configurable: true });
});
after(() => {
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
  delete g[CONTEXT];
});

test("one database per request, reused within the request, never across requests", () => {
  const a = request(hyperdrive);
  const b = request(hyperdrive);
  current = a;
  const dbA = getDb();
  assert.equal(getDb(), dbA, "same request reuses its database");
  const authA = getAuth();
  assert.equal(getAuth(), authA);
  current = b;
  const dbB = getDb();
  assert.notEqual(dbB, dbA, "a new request gets a new database");
  assert.notEqual(getAuth(), authA, "and a new auth instance");
  current = a;
  assert.equal(getDb(), dbA, "interleaved requests keep their own database");
});

test("no Hyperdrive binding or no request context is a clear error, not a fallback", () => {
  current = request({ DATABASE_URL: "postgresql://u:p@ep-x.neon.tech/db" });
  assert.throws(() => getDb(), /HYPERDRIVE binding is not configured/);
  current = undefined;
  assert.throws(() => getDb(), /No Cloudflare request context/);
});
