// One-time copy of reference data from Neon Development (.env.local) to production (.env.prod):
// restaurant/branch settings, menu (categories, products, variants, options, recipes), inventory
// items and staff accounts (users, password credentials, branch roles). Orders, customers,
// payments, sessions, invite tokens, audit logs and stock history are NOT copied.
//
//   CONFIRM_COPY=<production project ref> npx tsx --env-file=.env.prod scripts/copy-reference-data.ts
//
// Source is opened read-only. Every row read is saved to backups/ as JSON first. The target must
// have no rows in these tables; the copy runs in one transaction and commits only if every table's
// row count matches the source. Never prints credentials.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { Pool, type PoolClient } from "pg";
import { connectionString } from "../db/client";
import { assertExpectedDb, describeDb, formatTarget } from "../db/target";

// Parent tables before children (foreign keys).
const TABLES = [
  "restaurants",
  "branches",
  "categories",
  "inventory_items",
  "products",
  "product_variants",
  "product_options",
  "product_ingredients",
  "user",
  "account",
  "staff_members",
];

const columns = async (c: PoolClient, table: string) =>
  (
    await c.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position",
      [table],
    )
  ).rows.map((r) => r.column_name);

async function main() {
  const dev = parseEnv(readFileSync(".env.local", "utf8"));
  const sourceUrl = dev.DATABASE_URL_UNPOOLED || dev.DATABASE_URL;
  const targetUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!sourceUrl || !targetUrl) throw new Error("Need DATABASE_URL in both .env.local and .env.prod");
  assertExpectedDb(sourceUrl, dev.DATABASE_ENDPOINT);
  assertExpectedDb(targetUrl);
  const source = describeDb(sourceUrl);
  const target = describeDb(targetUrl);
  if (dev.APP_ENV === "production" || process.env.APP_ENV !== "production")
    throw new Error("Source must be the development env file and target the production one");
  if (source.endpoint === target.endpoint) throw new Error("Source and target are the same database");
  console.log(`Source (read-only): ${formatTarget(source)}`);
  console.log(`Target            : ${formatTarget(target)}`);
  if (process.env.CONFIRM_COPY !== target.endpoint)
    throw new Error(`Re-run with CONFIRM_COPY=${target.endpoint} to copy into ${target.endpoint}.`);

  const from = new Pool({ connectionString: connectionString(sourceUrl), max: 1 });
  const to = new Pool({ connectionString: connectionString(targetUrl), max: 1 });
  const src = await from.connect();
  const dst = await to.connect();
  try {
    // ---- Read everything from the source in one read-only snapshot ----
    await src.query("begin transaction isolation level repeatable read read only");
    const data: Record<string, { cols: string[]; rows: Record<string, unknown>[] }> = {};
    for (const t of TABLES) {
      const [srcCols, dstCols] = await Promise.all([columns(src, t), columns(dst, t)]);
      const cols = dstCols.filter((c) => srcCols.includes(c));
      const missing = srcCols.filter((c) => !dstCols.includes(c));
      if (missing.length) throw new Error(`${t}: target lacks columns ${missing.join(", ")}`);
      const { rows } = await src.query(`select row_to_json(x) as r from public."${t}" x`);
      data[t] = { cols, rows: rows.map((r) => r.r) };
    }
    await src.query("commit");

    mkdirSync("backups", { recursive: true });
    const snapshot = `backups/neon-development-snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    writeFileSync(snapshot, JSON.stringify({ source: source.endpoint, takenAt: new Date().toISOString(), data }, null, 1));
    console.log(`Snapshot of source rows: ${snapshot} (contains password hashes: keep private)\n`);

    // ---- Write to the target in one transaction ----
    await dst.query("begin");
    await dst.query("set local lock_timeout = '5s'");
    for (const t of TABLES) {
      const { rows } = await dst.query(`select count(*)::int as n from public."${t}"`);
      if (rows[0].n) throw new Error(`Target table ${t} already has ${rows[0].n} row(s). Nothing was copied.`);
    }
    for (const t of TABLES) {
      const { cols, rows } = data[t]!;
      if (rows.length) {
        const list = cols.map((c) => `"${c}"`).join(", ");
        await dst.query(
          `insert into public."${t}" (${list}) select ${list} from json_populate_recordset(null::public."${t}", $1::json)`,
          [JSON.stringify(rows)],
        );
      }
      const { rows: check } = await dst.query(`select count(*)::int as n from public."${t}"`);
      const ok = check[0].n === rows.length;
      console.log(`  ${ok ? "ok  " : "FAIL"}  ${t.padEnd(20)} ${check[0].n}/${rows.length}`);
      if (!ok) throw new Error(`Row count mismatch in ${t}. Rolled back; nothing was copied.`);
    }
    await dst.query("commit");
    console.log("\nCommitted. Reference data copied to production.");
  } catch (e) {
    await dst.query("rollback").catch(() => {});
    await src.query("rollback").catch(() => {});
    throw e;
  } finally {
    src.release();
    dst.release();
    await Promise.all([from.end(), to.end()]);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
