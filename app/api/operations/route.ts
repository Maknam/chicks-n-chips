import { z } from "zod";
import { handle, body, sameOrigin } from "@/server/http";
import { ctx } from "@/server/context";
import { config } from "@/server/config";
import { isArea, removeStaff, requireStaff, type Area } from "@/server/staff";
import { createInvite, createResetLink } from "@/server/onboarding";
import { DomainError } from "@/lib/domain";
import { buildWorkspace } from "@/server/services/workspace";
import { setAvailability, updateProduct } from "@/server/services/catalog";
import { recordMovement } from "@/server/services/inventory";
import { updateBusiness, updateReceipt, updateSettings } from "@/server/services/branch";

export const dynamic = "force-dynamic";

const origin = (req: Request) => config.appOrigin(new URL(req.url).origin);

export async function GET(req: Request) {
  return handle(async () => {
    const area = new URL(req.url).searchParams.get("area") || "overview";
    if (!isArea(area)) throw new DomainError("Unknown workspace");
    const c = ctx();
    const staff = await requireStaff(area, c);
    return { ...(await buildWorkspace(c, area, staff.role)), demo: config.demoLabel() };
  });
}

// Each action names the workspace whose permission it requires.
const actionArea: Record<string, Area> = {
  availability: "menu",
  product: "menu",
  inventory: "inventory",
  settings: "settings",
  business: "settings",
  receipt: "settings",
  invite: "staff",
  resetLink: "staff",
  removeStaff: "staff",
};

export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const data = await body(req);
    const area = actionArea[data?.action];
    if (!area) throw new DomainError("Unknown action");
    const c = ctx();
    const staff = await requireStaff(area, c);
    switch (data.action) {
      case "availability":
        await setAvailability(c, data, staff.id);
        break;
      case "product":
        if (staff.role === "KITCHEN") throw new DomainError("Kitchen can change availability only", 403);
        await updateProduct(c, data, staff.id);
        break;
      case "inventory":
        await recordMovement(c, data, staff.id);
        break;
      case "settings":
        await updateSettings(c, data, staff.id);
        break;
      case "business":
        await updateBusiness(c, data, staff.id);
        break;
      case "receipt":
        await updateReceipt(c, data, staff.id);
        break;
      case "invite": {
        const { token, existing } = await createInvite(c, data, staff.id);
        return { ok: true, existing, link: token ? `${origin(req)}/join#${token}` : null };
      }
      case "resetLink": {
        const token = await createResetLink(c, z.object({ userId: z.string().min(1) }).parse(data).userId, staff.id);
        return { ok: true, link: `${origin(req)}/join#${token}` };
      }
      case "removeStaff":
        await removeStaff(c, z.object({ userId: z.string().min(1) }).parse(data).userId, staff.id);
        break;
    }
    return { ok: true };
  });
}
