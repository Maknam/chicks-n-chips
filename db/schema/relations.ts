import { relations } from "drizzle-orm";
import {
  branches,
  categories,
  customers,
  inventoryItems,
  orderItemOptions,
  orderItems,
  orders,
  productIngredients,
  productOptions,
  products,
  productVariants,
  restaurants,
  staffMembers,
} from "./app";
import { user } from "./auth";

export const restaurantRelations = relations(restaurants, ({ many }) => ({
  branches: many(branches),
}));
export const branchRelations = relations(branches, ({ one }) => ({
  restaurant: one(restaurants, { fields: [branches.restaurantId], references: [restaurants.id] }),
}));
export const staffMemberRelations = relations(staffMembers, ({ one }) => ({
  user: one(user, { fields: [staffMembers.userId], references: [user.id] }),
}));
export const categoryRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));
export const productRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  variants: many(productVariants),
  options: many(productOptions),
  ingredients: many(productIngredients),
}));
export const productVariantRelations = relations(productVariants, ({ one }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
}));
export const productOptionRelations = relations(productOptions, ({ one }) => ({
  product: one(products, { fields: [productOptions.productId], references: [products.id] }),
}));
export const productIngredientRelations = relations(productIngredients, ({ one }) => ({
  product: one(products, { fields: [productIngredients.productId], references: [products.id] }),
  item: one(inventoryItems, {
    fields: [productIngredients.inventoryItemId],
    references: [inventoryItems.id],
  }),
}));
export const customerRelations = relations(customers, ({ many }) => ({
  orders: many(orders),
}));
export const orderRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  items: many(orderItems),
}));
export const orderItemRelations = relations(orderItems, ({ one, many }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  options: many(orderItemOptions),
}));
export const orderItemOptionRelations = relations(orderItemOptions, ({ one }) => ({
  item: one(orderItems, { fields: [orderItemOptions.orderItemId], references: [orderItems.id] }),
}));
