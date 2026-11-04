// Shared domain model: types and pure business rules.
// Safe to import from client components — no database or Node-only APIs here.
import { z } from "zod";

export type Role = "OWNER" | "MANAGER" | "CASHIER" | "KITCHEN";
export const ROLES: Role[] = ["OWNER", "MANAGER", "CASHIER", "KITCHEN"];
export type Status =
  | "NEW"
  | "ACCEPTED"
  | "PREPARING"
  | "READY"
  | "COMPLETED"
  | "CANCELLED"
  | "REJECTED";
export const STATUSES: Status[] = [
  "NEW",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "COMPLETED",
  "CANCELLED",
  "REJECTED",
];
export type Availability = "AVAILABLE" | "LOW_STOCK" | "SOLD_OUT";
export type PaymentMethod = "CASH" | "MOMO" | "ONLINE";
export type PaymentStatus = "PENDING" | "PAID";

// ---------- DTOs exchanged with the browser ----------

export type Variant = {
  id: string; // stable code, e.g. "large"
  name: string;
  price: number;
  extraIngredients?: Record<string, number>;
};
export type Option = { id: string; name: string; price: number };
export type Product = {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  prep: number;
  image: string;
  availability: Availability;
  options: Option[];
  variants: Variant[];
  /** Inventory item id → quantity consumed per unit. */
  ingredients: Record<string, number>;
};
export type Item = {
  productId: string;
  name: string;
  qty: number;
  price: number; // unit price including variant and options
  variant?: string;
  variantId?: string;
  options: Option[];
};
export type Order = {
  id: string;
  number: number;
  /** Raw receipt capability. Only populated in the checkout response. */
  token: string;
  requestId: string;
  customerId: string;
  customer: string;
  phone: string;
  items: Item[];
  total: number;
  status: Status;
  source: "ONLINE" | "WALK_IN";
  pickupAt: string;
  scheduled: boolean;
  payment: PaymentMethod;
  paymentStatus: PaymentStatus;
  reference: string;
  paymentUrl?: string;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
  preparingAt?: string;
  readyAt?: string;
  arrivedAt?: string;
  completedAt?: string;
  errorReported?: boolean;
};
export type Customer = { id: string; name: string; phone: string; createdAt: string };
export type Inventory = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  threshold: number;
};
export type Movement = {
  id: string;
  inventoryId: string;
  kind: "RESTOCK" | "WASTE" | "CONSUMPTION";
  quantity: number;
  reason: string;
  createdAt: string;
};
export type Notification = {
  id: string;
  orderId: string;
  status: "PENDING" | "SENDING" | "SENT" | "FAILED";
  retryCount: number;
  errorMessage?: string;
  nextAttempt: string;
  createdAt: string;
};
export type Audit = {
  id: string;
  action: string;
  actor: string;
  createdAt: string;
  entityId: string;
};
export type Settings = {
  open: number;
  close: number;
  interval: number;
  capacity: number;
  basePrep: number;
};
/** A role-filtered snapshot of one branch, as served to staff workspaces. */
export type State = {
  revision: number;
  nextNumber: number;
  settings: Settings;
  products: Product[];
  orders: Order[];
  customers: Customer[];
  inventory: Inventory[];
  movements: Movement[];
  notifications: Notification[];
  audits: Audit[];
};
export type Slot = { at: string; count: number; capacity: number; full: boolean };

// ---------- Formatting ----------

export const money = (n: number) => `GH₵${(n / 100).toFixed(2)}`;
export const time = (s: string) =>
  new Date(s).toLocaleTimeString("en-GH", {
    timeZone: "Africa/Accra",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Customer-facing wording for each order status. */
export const STATUS_LABEL: Record<Status, string> = {
  NEW: "Order received",
  ACCEPTED: "Accepted",
  PREPARING: "Being prepared",
  READY: "Ready for pickup",
  COMPLETED: "Collected",
  CANCELLED: "Cancelled",
  REJECTED: "Declined",
};

/** "Today, 12:30 pm" / "Tomorrow, 08:00 am" / "Wed 5 Nov, 08:00 am" in Accra time. */
export function pickupLabel(iso: string, now = new Date()) {
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Africa/Accra" });
  const target = new Date(iso);
  const tomorrow = new Date(now.getTime() + 86400000);
  const prefix =
    day(target) === day(now)
      ? "Today"
      : day(target) === day(tomorrow)
        ? "Tomorrow"
        : target.toLocaleDateString("en-GH", {
            timeZone: "Africa/Accra",
            weekday: "short",
            day: "numeric",
            month: "short",
          });
  return `${prefix}, ${time(iso)}`;
}

// ---------- Errors ----------

export class DomainError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

// ---------- Order predicates ----------

export const CLOSED: Status[] = ["COMPLETED", "CANCELLED", "REJECTED"];
export const VOIDED: Status[] = ["CANCELLED", "REJECTED"];
export const active = (o: Pick<Order, "status">) => !CLOSED.includes(o.status);
/** Online orders only reach the kitchen once the provider has verified payment. */
export const confirmed = (o: Pick<Order, "payment" | "paymentStatus">) =>
  o.payment !== "ONLINE" || o.paymentStatus === "PAID";

// ---------- Input validation ----------

export const phoneNumber = (s: string) => {
  const p = s.replace(/[\s()-]/g, "");
  return p.startsWith("0") ? "+233" + p.slice(1) : p;
};
export const orderInput = z.object({
  requestId: z.string().uuid(),
  customer: z.string().trim().min(2).max(80),
  phone: z
    .string()
    .transform(phoneNumber)
    .pipe(z.string().regex(/^\+233\d{9}$/, "Use a Ghana phone number, e.g. 0241234567")),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        qty: z.number().int().min(1).max(20),
        variant: z.string().optional(),
        options: z.array(z.string()).max(8).default([]),
      }),
    )
    .min(1)
    .max(30),
  pickup: z.string(),
  payment: z.enum(["CASH", "MOMO", "ONLINE"]),
  source: z.enum(["ONLINE", "WALK_IN"]).default("ONLINE"),
});
export type OrderInput = z.input<typeof orderInput>;
export type ParsedOrderInput = z.output<typeof orderInput>;

export const settingsInput = z
  .object({
    open: z.number().int().min(0).max(23),
    close: z.number().int().min(1).max(24),
    interval: z.number().int().min(5).max(60),
    capacity: z.number().int().min(1).max(200),
    basePrep: z.number().int().min(5).max(120),
  })
  .refine((x) => x.close > x.open, "Closing time must be after opening time");

// ---------- Pricing ----------

/** Server-authoritative pricing. The client's displayed prices are never trusted. */
export function priceItems(
  products: Product[],
  lines: ParsedOrderInput["items"],
): { items: Item[]; total: number } {
  const byId = new Map(products.map((p) => [p.id, p]));
  const items = lines.map((line): Item => {
    const p = byId.get(line.productId);
    if (!p || p.availability === "SOLD_OUT")
      throw new DomainError("An item is sold out. Please review your cart.", 409);
    const variant = line.variant ? p.variants.find((v) => v.id === line.variant) : undefined;
    if (line.variant && !variant) throw new DomainError("Invalid variant");
    if (new Set(line.options).size !== line.options.length)
      throw new DomainError("Duplicate extras");
    const options = line.options.map((code) => {
      const option = p.options.find((o) => o.id === code);
      if (!option) throw new DomainError("Invalid extra");
      return option;
    });
    return {
      productId: p.id,
      name: p.name,
      qty: line.qty,
      price: p.price + (variant?.price ?? 0) + options.reduce((sum, o) => sum + o.price, 0),
      variant: variant?.name,
      variantId: variant?.id,
      options,
    };
  });
  return { items, total: items.reduce((sum, i) => sum + i.price * i.qty, 0) };
}

// ---------- Pickup slots ----------

/** Minutes until a new order could be ready, given how many confirmed tickets are queued. */
export function estimate(settings: Settings, queued: number) {
  return (
    settings.basePrep +
    Math.floor(queued / Math.max(1, settings.capacity)) * settings.interval
  );
}

/** Pickup slots for today and tomorrow. Africa/Accra is UTC+0 with no DST, so hours are UTC. */
export function buildSlots(
  settings: Settings,
  counts: ReadonlyMap<string, number>,
  queued: number,
  now = new Date(),
): Slot[] {
  const result: Slot[] = [];
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const earliest = now.getTime() + estimate(settings, queued) * 60000;
  for (let day = 0; day < 2; day++)
    for (let minute = settings.open * 60; minute < settings.close * 60; minute += settings.interval) {
      const time = start.getTime() + (day * 1440 + minute) * 60000;
      if (time < earliest) continue;
      const at = new Date(time).toISOString();
      const count = counts.get(at) ?? 0;
      result.push({ at, count, capacity: settings.capacity, full: count >= settings.capacity });
    }
  return result;
}
export const slotWindow = (now = new Date()) => {
  const from = new Date(now);
  from.setUTCHours(0, 0, 0, 0);
  return { from, to: new Date(from.getTime() + 2 * 86400000) };
};
export function chooseSlot(slots: Slot[], pickup: string) {
  const slot = pickup === "ASAP" ? slots.find((x) => !x.full) : slots.find((x) => x.at === pickup);
  if (!slot || slot.full)
    throw new DomainError("Pickup slot is full or unavailable. Choose the next available slot.", 409);
  return slot;
}

// ---------- Lifecycle ----------

export const TRANSITIONS: Record<Status, Status[]> = {
  NEW: ["ACCEPTED", "CANCELLED", "REJECTED"],
  ACCEPTED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [],
};
export function assertTransition(
  order: Pick<Order, "status" | "payment" | "paymentStatus">,
  next: Status,
) {
  if (!TRANSITIONS[order.status].includes(next))
    throw new DomainError("This order changed. Refresh and try again.", 409);
  if (!confirmed(order) && !VOIDED.includes(next))
    throw new DomainError("Awaiting verified online payment", 409);
  if (next === "COMPLETED" && order.paymentStatus !== "PAID")
    throw new DomainError("Cashier must confirm payment before handover", 409);
}
export const timestampFor: Partial<Record<Status, keyof Order>> = {
  ACCEPTED: "acceptedAt",
  PREPARING: "preparingAt",
  READY: "readyAt",
  COMPLETED: "completedAt",
};

// ---------- Ingredient demand ----------

/** Total ingredient quantities required for a set of order lines, keyed by inventory id. */
export function ingredientDemand(
  products: Pick<Product, "id" | "ingredients" | "variants">[],
  items: Pick<Item, "productId" | "qty" | "variantId">[],
) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const totals: Record<string, number> = {};
  for (const i of items) {
    const p = byId.get(i.productId);
    if (!p) continue;
    const extra = p.variants.find((v) => v.id === i.variantId)?.extraIngredients ?? {};
    for (const [id, amount] of Object.entries(p.ingredients))
      totals[id] = (totals[id] ?? 0) + (amount + (extra[id] ?? 0)) * i.qty;
  }
  return totals;
}

/** Inventory with required/shortage for confirmed, not-yet-started orders (or a given subset). */
export function production(
  s: Pick<State, "products" | "inventory" | "orders">,
  orders = s.orders.filter((o) => ["NEW", "ACCEPTED"].includes(o.status) && confirmed(o)),
) {
  const totals = ingredientDemand(s.products, orders.flatMap((o) => o.items));
  return s.inventory.map((i) => ({
    ...i,
    required: totals[i.id] ?? 0,
    shortage: Math.max(0, (totals[i.id] ?? 0) - i.quantity),
  }));
}

// ---------- Analytics ----------

export function analytics(s: Pick<State, "orders" | "products">, day = new Date().toISOString().slice(0, 10)) {
  const orders = s.orders.filter((o) => o.createdAt.startsWith(day));
  const paid = orders.filter((o) => o.paymentStatus === "PAID" && !VOIDED.includes(o.status));
  const revenue = paid.reduce((sum, o) => sum + o.total, 0);
  const average = (values: number[]) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const customers = new Set(orders.map((o) => o.customerId));
  const orderCount = new Map<string, number>();
  for (const o of s.orders) orderCount.set(o.customerId, (orderCount.get(o.customerId) ?? 0) + 1);
  return {
    revenue,
    count: orders.length,
    aov: paid.length ? revenue / paid.length : 0,
    online: orders.filter((o) => o.source === "ONLINE").length,
    walkIn: orders.filter((o) => o.source === "WALK_IN").length,
    scheduled: orders.filter((o) => o.scheduled).length,
    active: orders.filter(active).length,
    late: orders.filter((o) =>
      o.readyAt
        ? Date.parse(o.readyAt) > Date.parse(o.pickupAt)
        : active(o) && Date.parse(o.pickupAt) < Date.now(),
    ).length,
    cancelled: orders.filter((o) => VOIDED.includes(o.status)).length,
    errors: orders.filter((o) => o.errorReported).length,
    preparing: orders.filter((o) => o.status === "PREPARING").length,
    ready: orders.filter((o) => o.status === "READY").length,
    prepMinutes: average(
      orders
        .filter((o) => o.readyAt)
        .map((o) => (Date.parse(o.readyAt!) - Date.parse(o.createdAt)) / 60000),
    ),
    waitingMinutes: average(
      orders
        .filter((o) => o.arrivedAt && o.completedAt)
        .map((o) => Math.max(0, Date.parse(o.completedAt!) - Date.parse(o.arrivedAt!)) / 60000),
    ),
    basket: average(orders.map((o) => o.items.reduce((n, i) => n + i.qty, 0))),
    repeatRate: customers.size
      ? ([...customers].filter((id) => (orderCount.get(id) ?? 0) > 1).length / customers.size) * 100
      : 0,
    hourly: Array.from({ length: 24 }, (_, h) => ({
      label: `${h}:00`,
      value: orders.filter((o) => new Date(o.createdAt).getUTCHours() === h).length,
    })),
    products: s.products
      .map((p) => {
        const lines = paid.flatMap((o) => o.items.filter((i) => i.productId === p.id));
        return {
          name: p.name,
          quantity: lines.reduce((n, i) => n + i.qty, 0),
          revenue: lines.reduce((n, i) => n + i.qty * i.price, 0),
        };
      })
      .sort((a, b) => b.quantity - a.quantity),
  };
}
