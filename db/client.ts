// Database access with node-postgres + Drizzle. Two runtime strategies:
//
// - Cloudflare Workers (production → Supabase): a NEW pool per request, connected through the
//   Hyperdrive binding. Workers forbid reusing a socket opened by one request in another, so no
//   connection is ever cached globally there. Hyperdrive keeps the warm connections to Supabase
//   and verifies Supabase's TLS certificate; the Worker → Hyperdrive hop stays inside Cloudflare.
// - Node (Vercel, local dev): one pool per instance from DATABASE_URL (Neon Development).
//
// Tests inject a PGlite-backed instance with setDb().
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { attachDatabasePool } from "@vercel/functions";
import * as schema from "./schema";
import { assertExpectedDb } from "./target";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
/** Anything that can run queries: the root database or an open transaction. */
export type Executor = DB | Tx;

/**
 * `sslmode=require` is treated as verify-full by pg v8 but will be downgraded to libpq semantics
 * by pg v9. Pin verify-full so the security level never silently drops. Servers signed by a
 * private CA (Supabase) also need `sslrootcert=<path to CA file>` in the URL.
 */
export function connectionString(url: string) {
  const u = new URL(url);
  if (["prefer", "require", "verify-ca"].includes(u.searchParams.get("sslmode") ?? ""))
    u.searchParams.set("sslmode", "verify-full");
  return u.toString();
}

// ---------- Cloudflare Workers: per-request connections ----------

type Hyperdrive = { connectionString: string };
/** The per-request store OpenNext's worker entrypoint publishes on this global symbol. */
type CloudflareRequestContext = { env: { HYPERDRIVE?: Hyperdrive } & Record<string, unknown> };

export const onWorkers = () => typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
const cloudflareRequest = () =>
  (globalThis as Record<symbol, CloudflareRequestContext | undefined>)[Symbol.for("__cloudflare-context__")];

// Keyed by the request's own context object: entries disappear with the request.
const perRequest = new WeakMap<object, DB>();

function workersDb(): DB {
  const request = cloudflareRequest();
  if (!request) throw new Error("No Cloudflare request context: the database is only available while handling a request");
  const existing = perRequest.get(request);
  if (existing) return existing;
  const hyperdrive = request.env.HYPERDRIVE;
  if (!hyperdrive?.connectionString)
    throw new Error("HYPERDRIVE binding is not configured for this Worker (see wrangler.jsonc)");
  // Hyperdrive pools on Cloudflare's side; a few connections let one request run queries in parallel.
  const pool = new Pool({ connectionString: hyperdrive.connectionString, max: 5 });
  // Sockets close when the request ends; never let that surface as an uncaught error.
  pool.on("error", () => {});
  const db = drizzle(pool, { schema }) as unknown as DB;
  perRequest.set(request, db);
  return db;
}

// ---------- Node: one pool per instance ----------

const cache = globalThis as unknown as { ccDb?: DB; ccPool?: Pool };

function nodeDb(): DB {
  if (cache.ccDb) return cache.ccDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  // Guards against a connection string pasted into the wrong environment (see db/target.ts).
  assertExpectedDb(url);
  const pool = new Pool({ connectionString: connectionString(url), max: 5, idleTimeoutMillis: 10_000 });
  // Lets Vercel Fluid compute close idle connections before a function instance is suspended.
  attachDatabasePool(pool);
  cache.ccPool = pool;
  cache.ccDb = drizzle(pool, { schema }) as unknown as DB;
  return cache.ccDb;
}

export function getDb(): DB {
  if (cache.ccDb) return cache.ccDb; // test injection (never set on Workers)
  return onWorkers() ? workersDb() : nodeDb();
}

/** Test hook: route all services to a provided database. */
export function setDb(db: DB | undefined) {
  cache.ccDb = db;
}

export { schema };
