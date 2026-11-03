// Operational schema. Money is integer pesewas; timestamps are UTC (timestamptz).
// Every operational row is scoped to a branch; a branch belongs to one restaurant.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const created = () => ts("created_at").notNull().defaultNow();
const updated = () => ts("updated_at").notNull().defaultNow();
const qty = (name: string) =>
  numeric(name, { precision: 12, scale: 3, mode: "number" });

export const staffRole = pgEnum("staff_role", ["OWNER", "MANAGER", "CASHIER", "KITCHEN"]);
export const availability = pgEnum("availability", ["AVAILABLE", "LOW_STOCK", "SOLD_OUT"]);
export const orderStatus = pgEnum("order_status", [
  "NEW",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "COMPLETED",
  "CANCELLED",
  "REJECTED",
]);
export const orderSource = pgEnum("order_source", ["ONLINE", "WALK_IN"]);
export const paymentMethod = pgEnum("payment_method", ["CASH", "MOMO", "ONLINE"]);
export const paymentStatus = pgEnum("payment_status", ["PENDING", "PAID"]);
export const movementKind = pgEnum("movement_kind", ["RESTOCK", "WASTE", "CONSUMPTION"]);
export const notificationStatus = pgEnum("notification_status", [
  "PENDING",
  "SENDING",
  "SENT",
  "FAILED",
]);

// ---------- Tenancy ----------

export const restaurants = pgTable("restaurants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: created(),
  updatedAt: updated(),
});

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id),
    name: text("name").notNull(),
    timezone: text("timezone").notNull().default("Africa/Accra"),
    openHour: integer("open_hour").notNull().default(8),
    closeHour: integer("close_hour").notNull().default(22),
    slotIntervalMinutes: integer("slot_interval_minutes").notNull().default(15),
    slotCapacity: integer("slot_capacity").notNull().default(15),
    basePrepMinutes: integer("base_prep_minutes").notNull().default(15),
    nextOrderNumber: integer("next_order_number").notNull().default(1000),
    // Bumped by every write; staff screens poll it to know when to refresh.
    revision: integer("revision").notNull().default(0),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    check("branch_hours", sql`${t.openHour} >= 0 and ${t.closeHour} <= 24 and ${t.closeHour} > ${t.openHour}`),
    check("branch_slot", sql`${t.slotIntervalMinutes} between 5 and 60 and ${t.slotCapacity} > 0`),
  ],
);

export const staffMembers = pgTable(
  "staff_members",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    role: staffRole("role").notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.branchId] })],
);

// ---------- Catalog ----------

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("categories_branch_name").on(t.branchId, t.name)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    price: integer("price").notNull(),
    prepMinutes: integer("prep_minutes").notNull(),
    imageUrl: text("image_url").notNull().default(""),
    availability: availability("availability").notNull().default("AVAILABLE"),
    sortOrder: integer("sort_order").notNull().default(0),
    archived: boolean("archived").notNull().default(false),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index("products_branch_idx").on(t.branchId),
    check("product_price", sql`${t.price} > 0`),
  ],
);

// `code` is the stable identifier the cart sends ("regular", "large").
export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    priceDelta: integer("price_delta").notNull().default(0),
    // Extra portions of each recipe ingredient consumed by this variant, keyed by inventory id.
    extraIngredients: jsonb("extra_ingredients").$type<Record<string, number>>().notNull().default({}),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("product_variants_code").on(t.productId, t.code)],
);

export const productOptions = pgTable(
  "product_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    price: integer("price").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("product_options_code").on(t.productId, t.code)],
);

// ---------- Inventory ----------

export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    unit: text("unit").notNull(),
    quantity: qty("quantity").notNull().default(0),
    lowThreshold: qty("low_threshold").notNull().default(0),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index("inventory_branch_idx").on(t.branchId),
    check("inventory_non_negative", sql`${t.quantity} >= 0`),
  ],
);

export const productIngredients = pgTable(
  "product_ingredients",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    inventoryItemId: uuid("inventory_item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "restrict" }),
    quantity: qty("quantity").notNull(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.inventoryItemId] })],
);

// ---------- Customers & orders ----------

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("customers_branch_phone").on(t.branchId, t.phone)],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    // Client-generated idempotency key: retried checkouts return the same order.
    requestId: uuid("request_id").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    total: integer("total").notNull(),
    status: orderStatus("status").notNull().default("NEW"),
    source: orderSource("source").notNull(),
    pickupAt: ts("pickup_at").notNull(),
    scheduled: boolean("scheduled").notNull().default(false),
    paymentMethod: paymentMethod("payment_method").notNull(),
    paymentStatus: paymentStatus("payment_status").notNull().default("PENDING"),
    paymentReference: text("payment_reference").notNull(),
    paymentUrl: text("payment_url"),
    errorReported: boolean("error_reported").notNull().default(false),
    createdAt: created(),
    updatedAt: updated(),
    acceptedAt: ts("accepted_at"),
    preparingAt: ts("preparing_at"),
    readyAt: ts("ready_at"),
    arrivedAt: ts("arrived_at"),
    completedAt: ts("completed_at"),
  },
  (t) => [
    uniqueIndex("orders_branch_number").on(t.branchId, t.number),
    uniqueIndex("orders_branch_request").on(t.branchId, t.requestId),
    uniqueIndex("orders_payment_reference").on(t.paymentReference),
    index("orders_branch_pickup").on(t.branchId, t.pickupAt),
    index("orders_branch_created").on(t.branchId, t.createdAt),
    index("orders_branch_status").on(t.branchId, t.status),
    index("orders_customer_idx").on(t.customerId),
    check("order_total", sql`${t.total} > 0`),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    // Snapshots: the receipt must not change when the menu changes later.
    productName: text("product_name").notNull(),
    variantCode: text("variant_code"),
    variantName: text("variant_name"),
    quantity: integer("quantity").notNull(),
    unitPrice: integer("unit_price").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [
    index("order_items_order_idx").on(t.orderId),
    index("order_items_product_idx").on(t.productId),
    check("order_item_quantity", sql`${t.quantity} > 0`),
  ],
);

export const orderItemOptions = pgTable(
  "order_item_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    price: integer("price").notNull(),
  },
  (t) => [index("order_item_options_item_idx").on(t.orderItemId)],
);

// Verified provider settlements. The unique reference makes webhook handling idempotent.
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  reference: text("reference").notNull().unique(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  verifiedAt: created(),
});

// ---------- Operations ----------

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    inventoryItemId: uuid("inventory_item_id")
      .notNull()
      .references(() => inventoryItems.id),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    kind: movementKind("kind").notNull(),
    quantity: qty("quantity").notNull(),
    reason: text("reason").notNull(),
    actorId: text("actor_id").notNull(),
    createdAt: created(),
  },
  (t) => [index("stock_movements_branch_created").on(t.branchId, t.createdAt)],
);

// Transactional outbox: written with the READY transition, delivered by a worker.
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("SMS"),
    status: notificationStatus("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
    sentAt: ts("sent_at"),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("notifications_order_channel").on(t.orderId, t.channel),
    index("notifications_due").on(t.status, t.nextAttemptAt),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    actorId: text("actor_id").notNull(),
    entityId: text("entity_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: created(),
  },
  (t) => [index("audit_logs_branch_created").on(t.branchId, t.createdAt)],
);

// One-time links/codes for onboarding without email: owner setup code, staff invites,
// password resets. Only a SHA-256 hash of the secret is stored.
export const accessTokenKind = pgEnum("access_token_kind", ["SETUP", "INVITE", "RESET"]);
export const accessTokens = pgTable(
  "access_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    kind: accessTokenKind("kind").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    email: text("email"),
    name: text("name"),
    role: staffRole("role"),
    // RESET targets an existing account.
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    createdBy: text("created_by").notNull(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: created(),
  },
  (t) => [index("access_tokens_branch_kind").on(t.branchId, t.kind)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: ts("window_start").notNull(),
  count: integer("count").notNull(),
});
