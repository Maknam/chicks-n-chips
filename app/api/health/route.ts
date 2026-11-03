import { sql } from "drizzle-orm";
import { json } from "@/server/http";
import { ctx } from "@/server/context";
import { getBranch } from "@/server/services/branch";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const c = ctx();
    await c.db.execute(sql`select 1`);
    await getBranch(c);
    return json({ application: "ok", database: "ok" });
  } catch {
    return json({ application: "degraded", database: "unavailable" }, 503);
  }
}
