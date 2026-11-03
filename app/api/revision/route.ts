import { handle } from "@/server/http";
import { ctx } from "@/server/context";
import { requireStaff } from "@/server/staff";
import { getRevision } from "@/server/services/branch";

export const dynamic = "force-dynamic";

/** Cheap change signal for staff screens: reload the workspace only when this number moves. */
export async function GET() {
  return handle(async () => {
    const c = ctx();
    await requireStaff("kitchen", c);
    return { revision: await getRevision(c) };
  });
}
