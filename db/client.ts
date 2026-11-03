// Database access. Production and development connect to Neon over the pooled
// connection string with node-postgres; tests inject a PGlite-backed instance.
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { attachDatabasePool } from "@vercel/functions";
import * as schema from "./schema";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
/** Anything that can run queries: the root database or an open transaction. */
export type Executor = DB | Tx;

/**
 * Neon connection strings use sslmode=require, which pg v8 treats as verify-full but pg v9
 * will downgrade to libpq semantics. Pin verify-full so the security level never silently drops.
 */
export function connectionString(url: string) {
  const u = new URL(url);
  if (["prefer", "require", "verify-ca"].includes(u.searchParams.get("sslmode") ?? ""))
    u.searchParams.set("sslmode", "verify-full");
  return u.toString();
}

const cache = globalThis as unknown as { ccDb?: DB; ccPool?: Pool };

export function getDb(): DB {
  if (cache.ccDb) return cache.ccDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  const pool = new Pool({ connectionString: connectionString(url), max: 5, idleTimeoutMillis: 10_000 });
  // Lets Vercel Fluid compute close idle connections before a function instance is suspended.
  attachDatabasePool(pool);
  cache.ccPool = pool;
  cache.ccDb = drizzle(pool, { schema }) as unknown as DB;
  return cache.ccDb;
}

/** Test hook: route all services to a provided database. */
export function setDb(db: DB | undefined) {
  cache.ccDb = db;
}

export { schema };
