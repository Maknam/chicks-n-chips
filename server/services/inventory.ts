// Stock ledger: restocks, waste and recipe consumption when a ticket starts.
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { inventoryItems, stockMovements } from "@/db/schema";
import { DomainError, ingredientDemand, type Item } from "@/lib/domain";
import { transaction, type Ctx } from "../context";
import { audit, bumpRevision } from "./branch";
import { listProducts } from "./catalog";

const movementInput = z.object({
  id: z.string().uuid(),
  kind: z.enum(["RESTOCK", "WASTE"]),
  quantity: z.number().positive().max(10000),
  reason: z.string().trim().min(3).max(200),
  threshold: z.number().min(0).max(10000).optional(),
});

export async function recordMovement(c: Ctx, raw: unknown, actorId: string) {
  const input = movementInput.parse(raw);
  await transaction(c, async (t) => {
    const [item] = await t.db
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.id, input.id), eq(inventoryItems.branchId, t.branchId)))
      .for("update");
    if (!item) throw new DomainError("Inventory item not found", 404);
    if (input.kind === "WASTE" && input.quantity > item.quantity)
      throw new DomainError("Waste exceeds current stock");
    const delta = input.kind === "RESTOCK" ? input.quantity : -input.quantity;
    await t.db
      .update(inventoryItems)
      .set({
        quantity: sql`${inventoryItems.quantity} + ${delta}`,
        ...(input.threshold !== undefined ? { lowThreshold: input.threshold } : {}),
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.id, item.id));
    await t.db.insert(stockMovements).values({
      branchId: t.branchId,
      inventoryItemId: item.id,
      kind: input.kind,
      quantity: input.quantity,
      reason: input.reason,
      actorId,
    });
    await audit(t, `STOCK_${input.kind}`, actorId, item.id);
    await bumpRevision(t);
  });
}

/**
 * Deducts recipe ingredients for an order that is starting preparation.
 * Must run inside the transaction that changes the order status.
 */
export async function consumeForOrder(
  t: Ctx,
  order: { id: string; number: number; items: Pick<Item, "productId" | "qty" | "variantId">[] },
  actorId: string,
) {
  const products = await listProducts(t, [...new Set(order.items.map((i) => i.productId))]);
  const demand = Object.entries(ingredientDemand(products, order.items)).filter(([, q]) => q > 0);
  if (!demand.length) return;
  const stock = await t.db
    .select()
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.branchId, t.branchId),
        inArray(
          inventoryItems.id,
          demand.map(([id]) => id),
        ),
      ),
    )
    .orderBy(inventoryItems.id) // consistent lock order avoids deadlocks
    .for("update");
  const byId = new Map(stock.map((s) => [s.id, s]));
  if (demand.some(([id, required]) => required > (byId.get(id)?.quantity ?? 0)))
    throw new DomainError(
      "Insufficient recorded stock. Ask a manager to restock before preparation.",
      409,
    );
  for (const [id, required] of demand) {
    await t.db
      .update(inventoryItems)
      .set({ quantity: sql`${inventoryItems.quantity} - ${required}`, updatedAt: new Date() })
      .where(eq(inventoryItems.id, id));
  }
  await t.db.insert(stockMovements).values(
    demand.map(([id, required]) => ({
      branchId: t.branchId,
      inventoryItemId: id,
      orderId: order.id,
      kind: "CONSUMPTION" as const,
      quantity: required,
      reason: `Preparation for #${order.number}`,
      actorId,
    })),
  );
}
