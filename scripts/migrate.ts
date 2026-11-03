// Applies pending migrations from db/migrations. Uses the direct (unpooled) Neon URL.
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { connectionString } from "../db/client";

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL (and ideally DATABASE_URL_UNPOOLED) first");
  const pool = new Pool({ connectionString: connectionString(url), max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "db/migrations" });
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
