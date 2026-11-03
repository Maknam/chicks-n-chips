// Seeds the configured branch with the menu and inventory.
//   npm run db:seed            menu + inventory only (safe for production)
//   npm run db:seed -- --demo  also fictional orders and four demo staff logins (staging/dev only)
//   STAFF_PASSWORD=<10+ chars> npm run db:seed -- --demo   use that password instead of "demo-password"
//   (always do this for any internet-reachable deployment)
import { getDb } from "../db/client";
import { seedBranch } from "../server/seed";
import { upsertStaff } from "../server/staff";
import { config } from "../server/config";

async function main() {
  const demo = process.argv.includes("--demo");
  const db = getDb();
  await seedBranch(db, { demo, branchId: config.branchId() });
  console.log(`Branch ${config.branchId()} seeded${demo ? " with demo history" : ""}.`);
  if (demo) {
    const password = process.env.STAFF_PASSWORD || "demo-password";
    const c = { db, branchId: config.branchId() };
    for (const role of ["OWNER", "MANAGER", "CASHIER", "KITCHEN"] as const) {
      const email = `${role.toLowerCase()}@demo.local`;
      await upsertStaff(c, { name: `Demo ${role.toLowerCase()}`, email, password, role }, "seed");
      console.log(`  ${role.padEnd(8)} ${email}`);
    }
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
