// Initial branch data: menu, recipes and inventory. With `demo`, also fictional
// customers and order history (never use demo data in production).
import { eq, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import {
  branches,
  categories,
  customers,
  inventoryItems,
  orderItems,
  orders,
  productIngredients,
  productOptions,
  products,
  productVariants,
  restaurants,
} from "@/db/schema";
import { DEFAULT_BRANCH_ID, DEFAULT_RESTAURANT_ID } from "./config";
import { generateTrackingCode } from "./tracking";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const INVENTORY = [
  { name: "Chicken", quantity: 12 },
  { name: "Chips", quantity: 45 },
  { name: "Rice", quantity: 20 },
  { name: "Wings", quantity: 18 },
  { name: "Sobolo", quantity: 30 },
  { name: "Water", quantity: 50 },
  { name: "Burger buns", quantity: 16 },
].map((x, i) => ({ ...x, id: uuid(100 + i) }));

const CATEGORIES = ["Popular", "Chips", "Chicken", "Rice", "Drinks"];

// Illustrative stock photos; owners replace them with their own in Admin → Menu.
// An empty id shows the branded placeholder.
const photo = (id: string) =>
  id ? `https://images.unsplash.com/${id}?auto=format&fit=crop&w=700&q=80` : "";

const MENU = [
  ["Classic Chips & Chicken", "Popular", "Crispy chicken, golden chips, fresh slaw and house sauce.", 3800, "photo-1562967914-608f82629710", [0, 1]],
  ["Student Saver Box", "Popular", "Your campus lunch sorted. A generous meal at a student price.", 2800, "photo-1562967914-608f82629710", [0, 1]],
  ["Loaded Chips", "Chips", "Golden chips, chicken bites and our signature sauce.", 3200, "photo-1573080496219-bb080dd4f877", [0, 1]],
  ["Spicy Wings & Chips", "Chicken", "Glazed wings with a kick, chips and cooling dip.", 4200, "photo-1567620832903-9fc6debc209f", [3, 1]],
  ["Chicken Rice Bowl", "Rice", "Seasoned rice, grilled chicken and crunchy vegetables.", 4000, "photo-1512058564366-18510be2db19", [0, 2]],
  ["Chicken Burger Combo", "Chicken", "Crispy chicken burger, chips and a chilled drink.", 4500, "photo-1568901346375-23c9450c58cd", [0, 1, 6]],
  ["Fresh Sobolo", "Drinks", "Chilled hibiscus with ginger. Made fresh in house.", 800, "", [4]],
  ["Bottled Water", "Drinks", "Cold water for a hot campus day.", 500, "photo-1548839140-29a749e1cf4d", [5]],
] as const;

export async function seedBranch(
  db: DB,
  opts: { demo?: boolean; restaurantId?: string; branchId?: string } = {},
) {
  const restaurantId = opts.restaurantId ?? DEFAULT_RESTAURANT_ID;
  const branchId = opts.branchId ?? DEFAULT_BRANCH_ID;

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: products.id })
      .from(products)
      .where(eq(products.branchId, branchId))
      .limit(1);
    if (existing.length) throw new Error("Refusing to seed: this branch already has a menu");

    await tx.insert(restaurants).values({ id: restaurantId, name: "Chics & Chips" }).onConflictDoNothing();
    await tx
      .insert(branches)
      .values({ id: branchId, restaurantId, name: "Pent Hall", nextOrderNumber: 1000 })
      .onConflictDoNothing();

    await tx.insert(inventoryItems).values(
      INVENTORY.map((i) => ({ id: i.id, branchId, name: i.name, unit: "portions", quantity: i.quantity, lowThreshold: 15 })),
    );
    const categoryIds = Object.fromEntries(CATEGORIES.map((name, i) => [name, uuid(50 + i)]));
    await tx.insert(categories).values(
      CATEGORIES.map((name, i) => ({ id: categoryIds[name], branchId, name, sortOrder: i })),
    );

    for (const [i, [name, category, description, price, image, recipe]] of MENU.entries()) {
      const productId = uuid(10 + i);
      const meal = i < 6;
      await tx.insert(products).values({
        id: productId,
        branchId,
        categoryId: categoryIds[category],
        name,
        description,
        price,
        prepMinutes: meal ? 15 : 2,
        imageUrl: photo(image),
        sortOrder: i,
      });
      await tx.insert(productIngredients).values(
        recipe.map((n) => ({ productId, inventoryItemId: INVENTORY[n].id, quantity: 1 })),
      );
      if (!meal) continue;
      // "Large" adds one extra portion of the side (the recipe's last ingredient).
      const side = INVENTORY[recipe[recipe.length - 1]].id;
      await tx.insert(productVariants).values([
        { productId, code: "regular", name: "Regular", priceDelta: 0, sortOrder: 0 },
        { productId, code: "large", name: "Large (+ extra side)", priceDelta: 1000, extraIngredients: { [side]: 1 }, sortOrder: 1 },
      ]);
      await tx.insert(productOptions).values([
        { productId, code: "sauce", name: "Extra house sauce", price: 300, sortOrder: 0 },
        { productId, code: "slaw", name: "Extra slaw", price: 500, sortOrder: 1 },
      ]);
    }

    if (opts.demo) await seedDemoHistory(tx as unknown as DB, branchId);
  });
}

/** Fictional customers and ~3 days of orders so dashboards have something to show. */
async function seedDemoHistory(db: DB, branchId: string) {
  const people = Array.from({ length: 18 }, (_, i) => ({
    id: uuid(200 + i),
    branchId,
    name: ["Ama", "Kojo", "Esi", "Kwame", "Akua", "Yaw"][i % 6] + ` ${i + 1}`,
    phone: "+233240" + String(i).padStart(6, "0"),
  }));
  await db.insert(customers).values(people);
  const now = new Date();
  const minutes = (d: Date, m: number) => new Date(d.getTime() + m * 60000);
  for (let i = 0; i < 64; i++) {
    const customer = people[i % people.length];
    const [name, , , price] = MENU[i % MENU.length];
    const created = new Date(now);
    created.setUTCDate(created.getUTCDate() - Math.floor(i / 22));
    created.setUTCHours(11 + (i % 4), i % 60, 0, 0);
    const live = i < 7;
    if (live) created.setTime(now.getTime() - (i + 1) * 3 * 60000);
    const status = live
      ? (["NEW", "ACCEPTED", "PREPARING", "READY"] as const)[i % 4]
      : i % 17 === 0
        ? "CANCELLED"
        : "COMPLETED";
    const qty = 1 + (i % 2);
    const done = status === "READY" || status === "COMPLETED";
    const orderId = uuid(500 + i);
    await db.insert(orders).values({
      id: orderId,
      branchId,
      number: 1000 + i,
      requestId: uuid(900 + i),
      trackingCode: generateTrackingCode(),
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      total: price * qty,
      status,
      source: i % 3 === 0 ? "WALK_IN" : "ONLINE",
      pickupAt: minutes(created, 20),
      scheduled: i % 2 === 0,
      paymentMethod: "CASH",
      paymentStatus: "PAID",
      paymentReference: `demo-${i}`,
      createdAt: created,
      updatedAt: created,
      preparingAt: done ? minutes(created, 4) : null,
      readyAt: done ? minutes(created, 16) : null,
      arrivedAt: status === "COMPLETED" ? minutes(created, 21) : null,
      completedAt: status === "COMPLETED" ? minutes(created, 24) : null,
    });
    await db.insert(orderItems).values({
      orderId,
      productId: uuid(10 + (i % MENU.length)),
      productName: name,
      quantity: qty,
      unitPrice: price,
      position: 0,
    });
  }
  await db
    .update(branches)
    .set({ nextOrderNumber: sql`1064` })
    .where(eq(branches.id, branchId));
}
