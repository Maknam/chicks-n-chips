// Creates a staff login and branch role. Use it once for the first OWNER;
// after that, owners manage staff from /admin/staff.
//   npm run staff:create -- --email owner@example.com --name "Ama Owner" --role OWNER --password '<10+ chars>'
import { parseArgs } from "node:util";
import { getDb } from "../db/client";
import { upsertStaff } from "../server/staff";
import { config } from "../server/config";

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      role: { type: "string", default: "OWNER" },
      password: { type: "string" },
    },
  });
  const { userId } = await upsertStaff(
    { db: getDb(), branchId: config.branchId() },
    values,
    "cli",
  );
  console.log(`Staff ${values.email} (${values.role}) ready. User id: ${userId}`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e.issues?.[0]?.message ?? e.message);
  process.exit(1);
});
