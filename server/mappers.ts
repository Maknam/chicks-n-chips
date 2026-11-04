// Row → DTO conversion. Keeps database shapes out of the API contract.
import type {
  auditLogs,
  categories,
  customers,
  inventoryItems,
  notifications,
  orderItemOptions,
  orderItems,
  orders,
  productIngredients,
  productOptions,
  products,
  productVariants,
  stockMovements,
} from "@/db/schema";
import type {
  Audit,
  Customer,
  Inventory,
  Movement,
  Notification,
  Order,
  Product,
} from "@/lib/domain";

const iso = (d: Date) => d.toISOString();
const isoOpt = (d: Date | null) => (d ? d.toISOString() : undefined);

export type ProductRow = typeof products.$inferSelect & {
  category: typeof categories.$inferSelect;
  variants: (typeof productVariants.$inferSelect)[];
  options: (typeof productOptions.$inferSelect)[];
  ingredients: (typeof productIngredients.$inferSelect)[];
};
export const toProduct = (p: ProductRow): Product => ({
  id: p.id,
  name: p.name,
  category: p.category.name,
  description: p.description,
  price: p.price,
  prep: p.prepMinutes,
  image: p.imageUrl,
  availability: p.availability,
  variants: p.variants.map((v) => ({
    id: v.code,
    name: v.name,
    price: v.priceDelta,
    extraIngredients: v.extraIngredients,
  })),
  options: p.options.map((o) => ({ id: o.code, name: o.name, price: o.price })),
  ingredients: Object.fromEntries(p.ingredients.map((i) => [i.inventoryItemId, i.quantity])),
});

export type OrderRow = typeof orders.$inferSelect & {
  items: (typeof orderItems.$inferSelect & {
    options: (typeof orderItemOptions.$inferSelect)[];
  })[];
};
/** Staff/receipt view of an order. The receipt token is never included here. */
export const toOrder = (o: OrderRow): Order => ({
  id: o.id,
  number: o.number,
  token: "",
  trackingCode: o.trackingCode,
  requestId: "",
  customerId: o.customerId,
  customer: o.customerName,
  phone: o.customerPhone,
  items: [...o.items]
    .sort((a, b) => a.position - b.position)
    .map((i) => ({
      productId: i.productId,
      name: i.productName,
      qty: i.quantity,
      price: i.unitPrice,
      variant: i.variantName ?? undefined,
      variantId: i.variantCode ?? undefined,
      options: i.options.map((x) => ({ id: x.code, name: x.name, price: x.price })),
    })),
  total: o.total,
  status: o.status,
  source: o.source,
  pickupAt: iso(o.pickupAt),
  scheduled: o.scheduled,
  payment: o.paymentMethod,
  paymentStatus: o.paymentStatus,
  reference: o.paymentReference,
  paymentUrl: o.paymentUrl ?? undefined,
  createdAt: iso(o.createdAt),
  updatedAt: iso(o.updatedAt),
  acceptedAt: isoOpt(o.acceptedAt),
  preparingAt: isoOpt(o.preparingAt),
  readyAt: isoOpt(o.readyAt),
  arrivedAt: isoOpt(o.arrivedAt),
  completedAt: isoOpt(o.completedAt),
  errorReported: o.errorReported,
});

export const toCustomer = (c: typeof customers.$inferSelect): Customer => ({
  id: c.id,
  name: c.name,
  phone: c.phone,
  createdAt: iso(c.createdAt),
});
export const toInventory = (i: typeof inventoryItems.$inferSelect): Inventory => ({
  id: i.id,
  name: i.name,
  unit: i.unit,
  quantity: i.quantity,
  threshold: i.lowThreshold,
});
export const toMovement = (m: typeof stockMovements.$inferSelect): Movement => ({
  id: m.id,
  inventoryId: m.inventoryItemId,
  kind: m.kind,
  quantity: m.quantity,
  reason: m.reason,
  createdAt: iso(m.createdAt),
});
export const toNotification = (n: typeof notifications.$inferSelect): Notification => ({
  id: n.id,
  orderId: n.orderId,
  status: n.status,
  retryCount: n.attempts,
  errorMessage: n.lastError ?? undefined,
  nextAttempt: iso(n.nextAttemptAt),
  createdAt: iso(n.createdAt),
});
export const toAudit = (a: typeof auditLogs.$inferSelect): Audit => ({
  id: a.id,
  action: a.action,
  actor: a.actorId,
  entityId: a.entityId,
  createdAt: iso(a.createdAt),
});
