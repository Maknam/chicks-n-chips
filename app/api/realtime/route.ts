import { cookies } from "next/headers";
import { handle } from "@/lib/http";
import { requireStaff } from "@/lib/auth";
import { branchId } from "@/lib/repository";
export async function GET() {
  return handle(async () => {
    await requireStaff("kitchen");
    return {
      token: (await cookies()).get("cc_staff")?.value,
      branch: branchId(),
    };
  });
}
