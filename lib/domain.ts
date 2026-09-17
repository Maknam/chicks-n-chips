import { z } from "zod";

export type Role = "OWNER" | "MANAGER" | "CASHIER" | "KITCHEN";
export type Status =
  | "NEW"
  | "ACCEPTED"
  | "PREPARING"
  | "READY"
  | "COMPLETED"
  | "CANCELLED"
  | "REJECTED";
export type Product = {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  prep: number;
  image: string;
  availability: "AVAILABLE" | "LOW_STOCK" | "SOLD_OUT";
  options: { id: string; name: string; price: number }[];
  variants: { id: string; name: string; price: number }[];
  ingredients: Record<string, number>;
};
export type Item = {
  productId: string;
  name: string;
  qty: number;
  price: number;
  variant?: string;
  variantId?: string;
  options: { id: string; name: string; price: number }[];
};
export type Order = {
  id: string;
  number: number;
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
  payment: "CASH" | "MOMO" | "ONLINE";
  paymentStatus: "PENDING" | "PAID";
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
export type Customer = {
  id: string;
  name: string;
  phone: string;
  createdAt: string;
};
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
export const money = (n: number) => `GH₵${(n / 100).toFixed(2)}`;
export const time = (s: string) =>
  new Date(s).toLocaleTimeString("en-GH", {
    timeZone: "Africa/Accra",
    hour: "2-digit",
    minute: "2-digit",
  });
export const active = (o: Order) =>
  !["COMPLETED", "CANCELLED", "REJECTED"].includes(o.status);
export const confirmed = (o: Order) =>
  o.payment !== "ONLINE" || o.paymentStatus === "PAID";
export const phoneNumber = (s: string) => {
  const p = s.replace(/[\s()-]/g, "");
  return p.startsWith("0") ? "+233" + p.slice(1) : p;
};
export class DomainError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const orderInput = z.object({
  requestId: z.string().uuid(),
  customer: z.string().trim().min(2).max(80),
  phone: z
    .string()
    .transform(phoneNumber)
    .pipe(
      z
        .string()
        .regex(/^\+233\d{9}$/, "Use a Ghana phone number, e.g. 0241234567"),
    ),
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
export function slots(state: State, now = new Date()) {
  const result: {
    at: string;
    count: number;
    capacity: number;
    full: boolean;
  }[] = [];
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const earliest = now.getTime() + estimate(state) * 60000;
  for (let day = 0; day < 2; day++)
    for (
      let minute = state.settings.open * 60;
      minute < state.settings.close * 60;
      minute += state.settings.interval
    ) {
      const at = new Date(
        start.getTime() + (day * 1440 + minute) * 60000,
      ).toISOString();
      if (Date.parse(at) < earliest) continue;
      const count = state.orders.filter(
        (o) =>
          o.pickupAt === at && !["CANCELLED", "REJECTED"].includes(o.status),
      ).length;
      result.push({
        at,
        count,
        capacity: state.settings.capacity,
        full: count >= state.settings.capacity,
      });
    }
  return result;
}
export function estimate(s: State) {
  return (
    s.settings.basePrep +
    Math.floor(
      s.orders.filter((o) => active(o) && confirmed(o) && o.status !== "READY")
        .length / Math.max(1, s.settings.capacity),
    ) *
      s.settings.interval
  );
}
export function createOrder(
  s: State,
  raw: unknown,
  id: () => string,
  now = new Date(),
): Order {
  const input = orderInput.parse(raw);
  const existing = s.orders.find((o) => o.requestId === input.requestId);
  if (existing) return existing;
  const items: Item[] = input.items.map((i) => {
    const p = s.products.find((p) => p.id === i.productId);
    if (!p || p.availability === "SOLD_OUT")
      throw new DomainError(
        "An item is sold out. Please review your cart.",
        409,
      );
    const variant = i.variant
      ? p.variants.find((v) => v.id === i.variant)
      : undefined;
    if (i.variant && !variant) throw new DomainError("Invalid variant");
    if (new Set(i.options).size !== i.options.length)
      throw new DomainError("Duplicate extras");
    const options = i.options.map((key) => {
      const option = p.options.find((o) => o.id === key);
      if (!option) throw new DomainError("Invalid extra");
      return option;
    });
    return {
      productId: p.id,
      name: p.name,
      qty: i.qty,
      price:
        p.price +
        (variant?.price ?? 0) +
        options.reduce((sum, o) => sum + o.price, 0),
      variant: variant?.name,
      variantId: variant?.id,
      options,
    };
  });
  const available = slots(s, now);
  const slot =
    input.pickup === "ASAP"
      ? available.find((x) => !x.full)
      : available.find((x) => x.at === input.pickup);
  if (!slot || slot.full)
    throw new DomainError(
      "Pickup slot is full or unavailable. Choose the next available slot.",
      409,
    );
  let customer = s.customers.find((c) => c.phone === input.phone);
  if (!customer) {
    customer = {
      id: id(),
      name: input.customer,
      phone: input.phone,
      createdAt: now.toISOString(),
    };
    s.customers.push(customer);
  }
  const order: Order = {
    id: id(),
    number: s.nextNumber++,
    token: id() + id(),
    requestId: input.requestId,
    customerId: customer.id,
    customer: input.customer,
    phone: input.phone,
    items,
    total: items.reduce((sum, i) => sum + i.price * i.qty, 0),
    status: "NEW",
    source: input.source,
    pickupAt: slot.at,
    scheduled: input.pickup !== "ASAP",
    payment: input.payment,
    paymentStatus: "PENDING",
    reference: `cc-${id()}`,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  s.orders.unshift(order);
  return order;
}
const transitions: Record<Status, Status[]> = {
  NEW: ["ACCEPTED", "CANCELLED", "REJECTED"],
  ACCEPTED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [],
};
export function changeStatus(
  s: State,
  order: Order,
  status: Status,
  now = new Date(),
) {
  if (!transitions[order.status].includes(status))
    throw new DomainError("This order changed. Refresh and try again.", 409);
  if (!confirmed(order) && !["CANCELLED", "REJECTED"].includes(status))
    throw new DomainError("Awaiting verified online payment", 409);
  if (status === "COMPLETED" && order.paymentStatus !== "PAID")
    throw new DomainError("Cashier must confirm payment before handover", 409);
  order.status = status;
  order.updatedAt = now.toISOString();
  if (status === "ACCEPTED") order.acceptedAt = order.updatedAt;
  if (status === "PREPARING") {
    const demand = production(s, [order]).filter((i) => i.required);
    if (demand.some((i) => i.required > i.quantity))
      throw new DomainError(
        "Insufficient recorded stock. Ask a manager to restock before preparation.",
        409,
      );
    for (const item of demand) {
      s.inventory.find((i) => i.id === item.id)!.quantity -= item.required;
      s.movements.push({
        id: crypto.randomUUID(),
        inventoryId: item.id,
        kind: "CONSUMPTION",
        quantity: item.required,
        reason: "Preparation for #" + order.number,
        createdAt: order.updatedAt,
      });
    }
    order.preparingAt = order.updatedAt;
  }
  if (status === "READY") {
    order.readyAt = order.updatedAt;
    s.notifications.push({
      id: order.id,
      orderId: order.id,
      status: "PENDING",
      retryCount: 0,
      nextAttempt: order.updatedAt,
      createdAt: order.updatedAt,
    });
  }
  if (status === "COMPLETED") order.completedAt = order.updatedAt;
}
export function production(
  s: State,
  orders = s.orders.filter(
    (o) => ["NEW", "ACCEPTED"].includes(o.status) && confirmed(o),
  ),
) {
  const totals: Record<string, number> = {};
  for (const o of orders)
    for (const i of o.items)
      for (const [key, amount] of Object.entries(
        s.products.find((p) => p.id === i.productId)?.ingredients ?? {},
      ))
        totals[key] =
          (totals[key] ?? 0) +
          amount *
            i.qty *
            (i.variantId === "large" &&
            key ===
              Object.keys(
                s.products.find((p) => p.id === i.productId)?.ingredients ?? {},
              ).at(-1)
              ? 2
              : 1);
  return s.inventory.map((i) => ({
    ...i,
    required: totals[i.id] ?? 0,
    shortage: Math.max(0, (totals[i.id] ?? 0) - i.quantity),
  }));
}
export function analytics(
  s: State,
  day = new Date().toISOString().slice(0, 10),
) {
  const orders = s.orders.filter((o) => o.createdAt.startsWith(day));
  const paid = orders.filter(
    (o) =>
      o.paymentStatus === "PAID" &&
      !["CANCELLED", "REJECTED"].includes(o.status),
  );
  const revenue = paid.reduce((sum, o) => sum + o.total, 0);
  const average = (values: number[]) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const customers = new Set(orders.map((o) => o.customerId));
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
    cancelled: orders.filter((o) =>
      ["CANCELLED", "REJECTED"].includes(o.status),
    ).length,
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
        .map(
          (o) =>
            Math.max(0, Date.parse(o.completedAt!) - Date.parse(o.arrivedAt!)) /
            60000,
        ),
    ),
    basket: average(orders.map((o) => o.items.reduce((n, i) => n + i.qty, 0))),
    repeatRate: customers.size
      ? ([...customers].filter(
          (id) => s.orders.filter((o) => o.customerId === id).length > 1,
        ).length /
          customers.size) *
        100
      : 0,
    hourly: Array.from({ length: 24 }, (_, h) => ({
      label: `${h}:00`,
      value: orders.filter((o) => new Date(o.createdAt).getUTCHours() === h)
        .length,
    })),
    products: s.products
      .map((p) => ({
        name: p.name,
        quantity: paid.reduce(
          (n, o) =>
            n +
            o.items
              .filter((i) => i.productId === p.id)
              .reduce((n, i) => n + i.qty, 0),
          0,
        ),
        revenue: paid.reduce(
          (n, o) =>
            n +
            o.items
              .filter((i) => i.productId === p.id)
              .reduce((n, i) => n + i.qty * i.price, 0),
          0,
        ),
      }))
      .sort((a, b) => b.quantity - a.quantity),
  };
}
