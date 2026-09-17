import { handle, body, sameOrigin } from "@/lib/http";
import { requireStaff, permissions, type Area } from "@/lib/auth";
import {
  readState,
  mutate,
  audit,
  demoMode,
  db,
  branchId,
  restaurantId,
} from "@/lib/repository";
import { active, confirmed, DomainError } from "@/lib/domain";
import { z } from "zod";
import { randomUUID } from "node:crypto";
export async function GET(req: Request) {
  return handle(async () => {
    const area = new URL(req.url).searchParams.get("area") || "overview";
    if (!(area in permissions)) throw new DomainError("Unknown workspace");
    const user = await requireStaff(area as Area);
    const s = await readState();
    // Kitchen needs tickets and recipes, but never customer phones or tracking capabilities.
    const orders = s.orders
      .filter((o) => area !== "kitchen" || (active(o) && confirmed(o)))
      .map((o) => ({
        ...o,
        token: "",
        phone: area === "kitchen" ? "" : o.phone,
        requestId: "",
      }));
    const management = user.role === "OWNER" || user.role === "MANAGER";
    let members: { user_id: string; role: string }[] = [];
    if (area === "staff" && !demoMode()) {
      const { data, error } = await db()
        .from("staff_roles")
        .select("user_id,role")
        .eq("branch_id", branchId())
        .eq("restaurant_id", restaurantId());
      if (error) throw error;
      members = data;
    }
    return {
      state: {
        ...s,
        orders,
        customers: management ? s.customers : [],
        movements: management ? s.movements : [],
        notifications: management ? s.notifications : [],
        audits: management ? s.audits : [],
      },
      role: user.role,
      demo: demoMode(),
      members,
    };
  });
}
export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const data = await body(req);
    const area = (
      {
        availability: "menu",
        product: "menu",
        inventory: "inventory",
        settings: "settings",
        staff: "staff",
      } as const
    )[
      data.action as
        "availability" | "product" | "inventory" | "settings" | "staff"
    ];
    if (!area) throw new DomainError("Unknown action");
    const user = await requireStaff(area);
    if (data.action === "staff") {
      if (demoMode())
        throw new DomainError(
          "Demo roles are fixed. Staff membership changes require Supabase.",
        );
      const input = z
        .object({
          userId: z.string().uuid(),
          role: z.enum(["OWNER", "MANAGER", "CASHIER", "KITCHEN"]),
        })
        .parse(data);
      if (input.userId === user.id)
        throw new DomainError("Ask another owner to change your role");
      const { error } = await db()
        .from("staff_roles")
        .upsert(
          {
            user_id: input.userId,
            role: input.role,
            restaurant_id: restaurantId(),
            branch_id: branchId(),
          },
          { onConflict: "user_id,branch_id" },
        );
      if (error) throw error;
      await mutate((s) =>
        audit(s, "STAFF_ROLE_CHANGED", user.id, input.userId),
      );
      return { ok: true };
    }
    return mutate((s) => {
      if (data.action === "availability") {
        const input = z
          .object({
            id: z.string().uuid(),
            availability: z.enum(["AVAILABLE", "LOW_STOCK", "SOLD_OUT"]),
          })
          .parse(data);
        const p = s.products.find((p) => p.id === input.id);
        if (!p) throw new DomainError("Product not found");
        p.availability = input.availability;
        audit(s, `MENU_${input.availability}`, user.id, p.id);
      }
      if (data.action === "product") {
        if (user.role === "KITCHEN")
          throw new DomainError("Kitchen can change availability only", 403);
        const input = z
          .object({
            id: z.string().uuid(),
            name: z.string().trim().min(2).max(100),
            description: z.string().max(400),
            price: z.number().int().min(100).max(100000),
            prep: z.number().int().min(1).max(120),
          })
          .parse(data);
        const p = s.products.find((p) => p.id === input.id);
        if (!p) throw new DomainError("Product not found");
        Object.assign(p, input);
        audit(s, "MENU_EDITED", user.id, p.id);
      }
      if (data.action === "inventory") {
        const input = z
          .object({
            id: z.string().uuid(),
            kind: z.enum(["RESTOCK", "WASTE"]),
            quantity: z.number().positive().max(10000),
            reason: z.string().trim().min(3).max(200),
            threshold: z.number().min(0).max(10000).optional(),
          })
          .parse(data);
        const item = s.inventory.find((i) => i.id === input.id);
        if (!item) throw new DomainError("Inventory item not found");
        if (input.kind === "WASTE" && input.quantity > item.quantity)
          throw new DomainError("Waste exceeds current stock");
        item.quantity +=
          input.kind === "RESTOCK" ? input.quantity : -input.quantity;
        if (input.threshold !== undefined) item.threshold = input.threshold;
        s.movements.push({
          id: randomUUID(),
          inventoryId: item.id,
          kind: input.kind,
          quantity: input.quantity,
          reason: input.reason,
          createdAt: new Date().toISOString(),
        });
        audit(s, `STOCK_${input.kind}`, user.id, item.id);
      }
      if (data.action === "settings") {
        const input = z
          .object({
            open: z.number().int().min(0).max(23),
            close: z.number().int().min(1).max(24),
            interval: z.number().int().min(5).max(60),
            capacity: z.number().int().min(1).max(200),
            basePrep: z.number().int().min(5).max(120),
          })
          .refine(
            (x) => x.close > x.open,
            "Closing time must be after opening time",
          )
          .parse(data);
        s.settings = input;
        audit(s, "SETTINGS_CHANGED", user.id, branchId());
      }
      return { ok: true };
    });
  });
}
