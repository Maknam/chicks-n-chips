// Menu: products with variants, extras and recipes.
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { categories, productOptions, products, productVariants } from "@/db/schema";
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

const productFields = z.object({
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
  // Category name; created on first use. Omitted on edit keeps the current category.
  category: z.string().trim().min(2, "Enter a category").max(60).optional(),
});
const productInput = productFields.extend({ id: z.string().uuid() });
const newProductInput = productFields.extend({
  category: z.string().trim().min(2, "Enter a category").max(60),
  availability: z.enum(["AVAILABLE", "LOW_STOCK", "SOLD_OUT"]).default("AVAILABLE"),
});

/** Finds the branch category by name (case-insensitive) or creates it at the end of the list. */
async function categoryId(t: Ctx, name: string) {
  const found = await t.db.query.categories.findFirst({
    where: and(eq(categories.branchId, t.branchId), sql`lower(${categories.name}) = lower(${name})`),
  });
  if (found) return found.id;
  const [{ next }] = await t.db
    .select({ next: sql<number>`coalesce(max(${categories.sortOrder}), 0) + 1` })
    .from(categories)
    .where(eq(categories.branchId, t.branchId));
  const [row] = await t.db
    .insert(categories)
    .values({ branchId: t.branchId, name, sortOrder: Number(next) })
    .returning({ id: categories.id });
  return row.id;
}

export async function createProduct(c: Ctx, raw: unknown, actorId: string) {
  const input = newProductInput.parse(raw);
  return transaction(c, async (t) => {
    const duplicate = await t.db.query.products.findFirst({
      where: and(
        eq(products.branchId, t.branchId),
        eq(products.archived, false),
        sql`lower(${products.name}) = lower(${input.name})`,
      ),
    });
    if (duplicate) throw new DomainError("A product with this name is already on the menu.", 409);
    const [{ next }] = await t.db
      .select({ next: sql<number>`coalesce(max(${products.sortOrder}), 0) + 1` })
      .from(products)
      .where(eq(products.branchId, t.branchId));
    const [row] = await t.db
      .insert(products)
      .values({
        branchId: t.branchId,
        categoryId: await categoryId(t, input.category),
        name: input.name,
        description: input.description,
        price: input.price,
        prepMinutes: input.prep,
        imageUrl: input.image ?? "",
        availability: input.availability,
        sortOrder: Number(next),
      })
      .returning({ id: products.id });
    // Every product needs a base variant: the cart orders by variant code.
    await t.db.insert(productVariants).values({ productId: row.id, code: "regular", name: "Regular" });
    await audit(t, "MENU_CREATED", actorId, row.id);
    await bumpRevision(t);
    return { id: row.id };
  });
}

/** Removes a product from the menu. Past orders keep their history. */
export async function archiveProduct(c: Ctx, raw: unknown, actorId: string) {
  const { id } = z.object({ id: z.string().uuid() }).parse(raw);
  await transaction(c, async (t) => {
    const [row] = await t.db
      .update(products)
      .set({ archived: true, updatedAt: new Date() })
      .where(and(eq(products.id, id), eq(products.branchId, t.branchId), eq(products.archived, false)))
      .returning({ id: products.id });
    if (!row) throw new DomainError("Product not found", 404);
    await audit(t, "MENU_REMOVED", actorId, id);
    await bumpRevision(t);
  });
}

export async function updateProduct(c: Ctx, raw: unknown, actorId: string) {
  const input = productInput.parse(raw);
  await transaction(c, async (t) => {
    const [row] = await t.db
      .update(products)
      .set({
        ...(input.category && { categoryId: await categoryId(t, input.category) }),
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
