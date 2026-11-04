// Menu: products with variants, extras and recipes.
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { productOptions, products, productVariants } from "@/db/schema";
import { DomainError } from "@/lib/domain";
import { toProduct } from "../mappers";
import { transaction, type Ctx } from "../context";
import { audit, bumpRevision } from "./branch";

export async function listProducts(c: Ctx, ids?: string[]) {
  if (ids && !ids.length) return [];
  const rows = await c.db.query.products.findMany({
    where: and(
      eq(products.branchId, c.branchId),
      eq(products.archived, false),
      ids ? inArray(products.id, ids) : undefined,
    ),
    with: {
      category: true,
      variants: { orderBy: [asc(productVariants.sortOrder)] },
      options: { orderBy: [asc(productOptions.sortOrder)] },
      ingredients: true,
    },
    orderBy: [asc(products.sortOrder), asc(products.name)],
  });
  return rows.map(toProduct);
}

const availabilityInput = z.object({
  id: z.string().uuid(),
  availability: z.enum(["AVAILABLE", "LOW_STOCK", "SOLD_OUT"]),
});

export async function setAvailability(c: Ctx, raw: unknown, actorId: string) {
  const input = availabilityInput.parse(raw);
  await transaction(c, async (t) => {
    const [row] = await t.db
      .update(products)
      .set({ availability: input.availability, updatedAt: new Date() })
      .where(and(eq(products.id, input.id), eq(products.branchId, t.branchId)))
      .returning({ id: products.id });
    if (!row) throw new DomainError("Product not found", 404);
    await audit(t, `MENU_${input.availability}`, actorId, input.id);
    await bumpRevision(t);
  });
}

const productInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  description: z.string().max(400),
  price: z.number().int().min(100).max(100000),
  prep: z.number().int().min(1).max(120),
  // Optional photo: an https link, or empty for the branded placeholder.
  image: z
    .string()
    .trim()
    .max(1000)
    .refine((v) => v === "" || /^https:\/\/[^\s]+$/i.test(v), "Use an https:// image link, or leave it empty")
    .optional(),
});

export async function updateProduct(c: Ctx, raw: unknown, actorId: string) {
  const input = productInput.parse(raw);
  await transaction(c, async (t) => {
    const [row] = await t.db
      .update(products)
      .set({
        name: input.name,
        description: input.description,
        price: input.price,
        prepMinutes: input.prep,
        ...(input.image !== undefined && { imageUrl: input.image }),
        updatedAt: new Date(),
      })
      .where(and(eq(products.id, input.id), eq(products.branchId, t.branchId)))
      .returning({ id: products.id });
    if (!row) throw new DomainError("Product not found", 404);
    await audit(t, "MENU_EDITED", actorId, input.id);
    await bumpRevision(t);
  });
}
