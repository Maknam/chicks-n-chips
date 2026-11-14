import { sql } from "drizzle-orm";
import { hasWorkerSecret, json } from "@/server/http";
import { ctx } from "@/server/context";
import { getBranch } from "@/server/services/branch";
import { describeDb } from "@/db/target";
import { onWorkers } from "@/db/client";

export const dynamic = "force-dynamic";

type Row = { applied: number; latest: string | null; supabase: boolean; version: string };

/**
 * Public: application/database status only. With `Authorization: Bearer $WORKER_SECRET` it also
 * reports which environment and database this deployment uses and its migration level, so
 * environment separation can be verified without exposing any credential. On Workers the host is
 * hidden behind Hyperdrive, so the provider is identified from Supabase's own schemas.
 */
export async function GET(req: Request) {
  const diagnostics = hasWorkerSecret(req);
  try {
    const c = ctx();
    await c.db.execute(sql`select 1`);
    await getBranch(c);
    if (!diagnostics) return json({ application: "ok", database: "ok" });
    const result = (await c.db.execute(sql`
      select
        (select count(*)::int from drizzle.__drizzle_migrations) as applied,
        (select max(created_at)::text from drizzle.__drizzle_migrations) as latest,
        (to_regnamespace('storage') is not null and to_regnamespace('auth') is not null) as supabase,
        current_setting('server_version') as version`)) as unknown as { rows: Row[] };
    const row = result.rows[0];
    const url = process.env.DATABASE_URL;
    return json({
      application: "ok",
      database: "ok",
      environment: process.env.APP_ENV || "unset",
      connection: onWorkers() ? "hyperdrive" : "direct",
      provider: row?.supabase ? "supabase" : url ? describeDb(url).provider : "postgres",
      databaseEndpoint: !onWorkers() && url ? describeDb(url).endpoint : null,
      expectedEndpoint: process.env.DATABASE_ENDPOINT || "unset",
      postgres: row?.version,
      migrationsApplied: row?.applied ?? 0,
      latestMigration: row?.latest ?? null,
    });
  } catch (e) {
    return json(
      {
        application: "degraded",
        database: "unavailable",
        ...(diagnostics && { reason: e instanceof Error ? e.message.slice(0, 200) : "unknown" }),
      },
      503,
    );
  }
}
