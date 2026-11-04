// Filterable reporting: pure functions over the workspace snapshot.
// Safe on the client. Africa/Accra is UTC+0 with no DST, so a UTC date (YYYY-MM-DD) is the local day.
import { VOIDED, active, type Order, type State, type Status, STATUSES } from "./domain";

export type ReportSource = "ALL" | "ONLINE" | "WALK_IN";
export type ReportPayment = "ALL" | "CASH" | "MOMO" | "ONLINE";
export type ReportFilter = {
  from: string; // YYYY-MM-DD, inclusive
  to: string; // YYYY-MM-DD, inclusive
  source: ReportSource;
  payment: ReportPayment;
  category: string; // "ALL" or a category name
};
export type Preset = "today" | "yesterday" | "7d" | "30d" | "month" | "custom";
export const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "month", label: "This month" },
  { id: "custom", label: "Custom" },
];

const DAY = 86400000;
export const dayOf = (iso: string) => iso.slice(0, 10);
export const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1;

/** Date range for a preset, relative to `today` (YYYY-MM-DD). */
export function presetRange(preset: Exclude<Preset, "custom">, today: string) {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "month":
      return { from: `${today.slice(0, 8)}01`, to: today };
  }
}

/** Ensures from ≤ to and that the range lies within the loaded history. */
export function clampRange(from: string, to: string, earliest: string, today: string) {
  let a = from < earliest ? earliest : from > today ? today : from;
  let b = to > today ? today : to < earliest ? earliest : to;
  if (a > b) [a, b] = [b, a];
  return { from: a, to: b };
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LABEL: Record<string, string> = {
  ONLINE: "Online",
  WALK_IN: "Walk-in",
  CASH: "Cash",
  MOMO: "Mobile money",
};

const average = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const pct = (part: number, whole: number) => (whole ? (part / whole) * 100 : 0);
/** Percentage change, or null when there is nothing to compare against. */
export const change = (now: number, before: number) =>
  before ? ((now - before) / before) * 100 : null;

type Sliced = ReturnType<typeof slice>;

/** Orders matching the filter for [from, to], with line items narrowed to the category. */
function slice(s: Pick<State, "orders" | "products">, f: ReportFilter, from: string, to: string) {
  const categoryOf = new Map(s.products.map((p) => [p.id, p.category]));
  const inCategory = (productId: string) => f.category === "ALL" || categoryOf.get(productId) === f.category;
  const orders = s.orders.filter((o) => {
    const day = dayOf(o.createdAt);
    return (
      day >= from &&
      day <= to &&
      (f.source === "ALL" || o.source === f.source) &&
      (f.payment === "ALL" || o.payment === f.payment) &&
      o.items.some((i) => inCategory(i.productId))
    );
  });
  const paid = orders.filter((o) => o.paymentStatus === "PAID" && !VOIDED.includes(o.status));
  // With a category selected, sales count only that category's lines.
  const value = (o: Order) =>
    f.category === "ALL"
      ? o.total
      : o.items.filter((i) => inCategory(i.productId)).reduce((n, i) => n + i.qty * i.price, 0);
  const lines = paid.flatMap((o) => o.items.filter((i) => inCategory(i.productId)));
  return { orders, paid, value, lines, inCategory };
}

function sales(x: Sliced) {
  const revenue = x.paid.reduce((n, o) => n + x.value(o), 0);
  return {
    revenue,
    orders: x.paid.length,
    aov: x.paid.length ? revenue / x.paid.length : 0,
    items: x.lines.reduce((n, i) => n + i.qty, 0),
  };
}

function group<K extends string>(orders: Order[], key: (o: Order) => K, value: (o: Order) => number) {
  const out = new Map<K, { orders: number; revenue: number }>();
  for (const o of orders) {
    const g = out.get(key(o)) ?? { orders: 0, revenue: 0 };
    g.orders++;
    g.revenue += value(o);
    out.set(key(o), g);
  }
  return out;
}

export function report(
  s: Pick<State, "orders" | "products" | "customers" | "inventory" | "movements" | "audits" | "settings">,
  f: ReportFilter,
  now = new Date(),
) {
  const days = daysBetween(f.from, f.to);
  const current = slice(s, f, f.from, f.to);
  const previous = slice(s, f, addDays(f.from, -days), addDays(f.from, -1));
  const { orders, paid, value, lines } = current;

  // ----- Sales -----
  const totals = sales(current);
  const before = sales(previous);

  // ----- Trends -----
  const byDay = group(paid, (o) => dayOf(o.createdAt), value);
  const allByDay = group(orders, (o) => dayOf(o.createdAt), () => 0);
  const daily = Array.from({ length: days }, (_, i) => {
    const day = addDays(f.from, i);
    return {
      day,
      orders: allByDay.get(day)?.orders ?? 0,
      paidOrders: byDay.get(day)?.orders ?? 0,
      revenue: byDay.get(day)?.revenue ?? 0,
    };
  });
  const hourly = Array.from({ length: 24 }, (_, h) => ({
    label: `${String(h).padStart(2, "0")}:00`,
    hour: h,
    value: orders.filter((o) => new Date(o.createdAt).getUTCHours() === h).length,
  })).filter((h) => (h.hour >= s.settings.open && h.hour < s.settings.close) || h.value > 0);
  const weekday = WEEKDAYS.map((label, i) => {
    const matching = paid.filter((o) => (new Date(o.createdAt).getUTCDay() + 6) % 7 === i);
    return { label, value: matching.length, revenue: matching.reduce((n, o) => n + value(o), 0) };
  });

  // ----- Menu -----
  const productRows = s.products
    .filter((p) => current.inCategory(p.id))
    .map((p) => {
      const sold = lines.filter((i) => i.productId === p.id);
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        quantity: sold.reduce((n, i) => n + i.qty, 0),
        revenue: sold.reduce((n, i) => n + i.qty * i.price, 0),
      };
    })
    .map((p) => ({ ...p, share: pct(p.revenue, totals.revenue) }))
    .sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity || a.name.localeCompare(b.name));
  const categories = [...new Set(productRows.map((p) => p.category))]
    .map((name) => {
      const rows = productRows.filter((p) => p.category === name);
      return {
        label: name,
        quantity: rows.reduce((n, p) => n + p.quantity, 0),
        revenue: rows.reduce((n, p) => n + p.revenue, 0),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
  const extrasMap = new Map<string, { quantity: number; revenue: number }>();
  for (const i of lines)
    for (const x of i.options) {
      const e = extrasMap.get(x.name) ?? { quantity: 0, revenue: 0 };
      e.quantity += i.qty;
      e.revenue += i.qty * x.price;
      extrasMap.set(x.name, e);
    }
  const extras = [...extrasMap].map(([label, e]) => ({ label, ...e })).sort((a, b) => b.quantity - a.quantity);

  // ----- Channels & payments -----
  const split = (map: Map<string, { orders: number; revenue: number }>, keys: string[]) =>
    keys.map((k) => ({ label: LABEL[k] ?? k, key: k, ...(map.get(k) ?? { orders: 0, revenue: 0 }) }));
  const channels = split(group(paid, (o) => o.source, value), ["ONLINE", "WALK_IN"]);
  const payments = split(group(paid, (o) => o.payment, value), ["CASH", "MOMO", "ONLINE"]);
  const statuses = STATUSES.map((status: Status) => ({
    label: status,
    value: orders.filter((o) => o.status === status).length,
  })).filter((x) => x.value);

  // ----- Customers -----
  // "New" = first order ever (within the loaded history) falls inside the range.
  const firstOrder = new Map<string, string>();
  for (const o of s.orders) {
    const d = dayOf(o.createdAt);
    if (!firstOrder.has(o.customerId) || d < firstOrder.get(o.customerId)!) firstOrder.set(o.customerId, d);
  }
  const people = group(paid, (o) => o.customerId, value);
  const ids = [...new Set(orders.map((o) => o.customerId))];
  const newCustomers = ids.filter((id) => (firstOrder.get(id) ?? "") >= f.from).length;
  const names = new Map(orders.map((o) => [o.customerId, { name: o.customer, phone: o.phone }]));
  const topCustomers = [...people]
    .map(([id, g]) => ({ id, ...names.get(id)!, ...g }))
    .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders)
    .slice(0, 8);

  // ----- Service -----
  const late = orders.filter((o) =>
    o.readyAt ? Date.parse(o.readyAt) > Date.parse(o.pickupAt) : active(o) && Date.parse(o.pickupAt) < now.getTime(),
  ).length;
  const cancelled = orders.filter((o) => VOIDED.includes(o.status)).length;
  const service = {
    prepMinutes: average(
      orders.filter((o) => o.readyAt).map((o) => (Date.parse(o.readyAt!) - Date.parse(o.createdAt)) / 60000),
    ),
    waitingMinutes: average(
      orders
        .filter((o) => o.arrivedAt && o.completedAt)
        .map((o) => Math.max(0, Date.parse(o.completedAt!) - Date.parse(o.arrivedAt!)) / 60000),
    ),
    late,
    lateRate: pct(late, orders.length),
    cancelled,
    cancelRate: pct(cancelled, orders.length),
    errors: orders.filter((o) => o.errorReported).length,
    errorRate: pct(orders.filter((o) => o.errorReported).length, orders.length),
    scheduledShare: pct(orders.filter((o) => o.scheduled).length, orders.length),
    unpaid: orders.filter((o) => o.paymentStatus !== "PAID" && !VOIDED.includes(o.status)).length,
  };

  // ----- Stock (not affected by channel/payment/category filters) -----
  const inRange = (iso: string) => dayOf(iso) >= f.from && dayOf(iso) <= f.to;
  const movements = s.movements.filter((m) => inRange(m.createdAt));
  const stock = s.inventory
    .map((i) => {
      const sum = (kind: string) =>
        movements.filter((m) => m.inventoryId === i.id && m.kind === kind).reduce((n, m) => n + Math.abs(m.quantity), 0);
      return {
        id: i.id,
        name: i.name,
        unit: i.unit,
        onHand: i.quantity,
        low: i.quantity <= i.threshold,
        used: sum("CONSUMPTION"),
        restocked: sum("RESTOCK"),
        wasted: sum("WASTE"),
      };
    })
    .sort((a, b) => b.used - a.used || a.name.localeCompare(b.name));
  const stockouts = s.audits.filter((a) => a.action === "MENU_SOLD_OUT" && inRange(a.createdAt)).length;

  return {
    range: { from: f.from, to: f.to, days },
    previousRange: { from: addDays(f.from, -days), to: addDays(f.from, -1) },
    count: orders.length,
    sales: totals,
    before,
    daily,
    hourly,
    weekday,
    products: productRows,
    categories,
    extras,
    channels,
    payments,
    statuses,
    customers: {
      unique: ids.length,
      new: newCustomers,
      returning: ids.length - newCustomers,
      repeatRate: pct(ids.length - newCustomers, ids.length),
      top: topCustomers,
    },
    service,
    stock,
    stockouts,
    orders,
  };
}
export type Report = ReturnType<typeof report>;

/** RFC 4180 CSV text (quotes doubled; leading formula characters neutralised for spreadsheets). */
export function toCsv(rows: (string | number)[][]) {
  const cell = (v: string | number) => {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}
