import { db, branchId, restaurantId } from "../lib/repository";
import { seed } from "../lib/seed";
async function main() {
  const { data: existing, error: readError } = await db().rpc("read_branch", {
    p_branch: branchId(),
    p_restaurant: restaurantId(),
  });
  if (readError) throw readError;
  if (existing.products.length || existing.orders.length)
    throw new Error("Refusing to overwrite an initialized branch");
  const state = seed(process.argv.includes("--demo"));
  const { error } = await db().rpc("commit_branch", {
    p_branch: branchId(),
    p_restaurant: restaurantId(),
    p_revision: existing.revision,
    p_state: state,
  });
  if (error) throw error;
  console.log("Branch initialized. Demo orders:", state.orders.length);
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
