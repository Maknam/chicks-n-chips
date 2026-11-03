// Builds the role-filtered snapshot that staff screens render.
// Bounded by time window and row limits so it stays fast as history grows.
import { and, desc, eq, gte, notInArray, or, sql } from "drizzle-orm";
import {
  auditLogs,
  customers,
  inventoryItems,
  notifications,
  orders,
  stockMovements,
} from "@/db/schema";
import { CLOSED, type Role, type State } from "@/lib/domain";
import {
  toAudit,
  toCustomer,
  toInventory,
  toMovement,
  toNotification,
} from "../mappers";
import type { Ctx } from "../context";
import type { Area } from "../staff";
import { listMembers } from "../staff";
import { getBranch, toSettings } from "./branch";
import { listProducts } from "./catalog";
import { findOrders } from "./orders";

const REPORT_DAYS = 30;
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);

function orderScope(area: Area) {
  const open = notInArray(orders.status, CLOSED);
  // Kitchen sees only actionable tickets; online orders appear once payment is verified.
  if (area === "kitchen")
    return and(open, or(sql`${orders.paymentMethod} <> 'ONLINE'`, eq(orders.paymentStatus, "PAID")));
  if (area === "pos") return or(open, gte(orders.createdAt, daysAgo(1)));
  return or(open, gte(orders.createdAt, daysAgo(REPORT_DAYS)));
}

export async function buildWorkspace(c: Ctx, area: Area, role: Role) {
  const management = role === "OWNER" || role === "MANAGER";
  const [branch, products, orderList, inventory] = await Promise.all([
    getBranch(c),
    listProducts(c),
    findOrders(c, orderScope(area), 3000),
    c.db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.branchId, c.branchId))
      .orderBy(inventoryItems.name),
  ]);

  const [customerRows, movements, outbox, audits, members] = management
    ? await Promise.all([
        c.db
          .select()
          .from(customers)
          .where(eq(customers.branchId, c.branchId))
          .orderBy(desc(customers.updatedAt))
          .limit(1000),
        c.db
          .select()
          .from(stockMovements)
          .where(and(eq(stockMovements.branchId, c.branchId), gte(stockMovements.createdAt, daysAgo(REPORT_DAYS))))
          .orderBy(stockMovements.createdAt)
          .limit(2000),
        c.db
          .select()
          .from(notifications)
          .where(eq(notifications.branchId, c.branchId))
          .orderBy(desc(notifications.createdAt))
          .limit(200),
        c.db
          .select()
          .from(auditLogs)
          .where(and(eq(auditLogs.branchId, c.branchId), gte(auditLogs.createdAt, daysAgo(REPORT_DAYS))))
          .orderBy(auditLogs.createdAt)
          .limit(2000),
        area === "staff" ? listMembers(c) : Promise.resolve([]),
      ])
    : [[], [], [], [], []];

  const state: State = {
    revision: branch.revision,
    nextNumber: branch.nextOrderNumber,
    settings: toSettings(branch),
    products,
    // Kitchen never needs customer phone numbers.
    orders: area === "kitchen" ? orderList.map((o) => ({ ...o, phone: "" })) : orderList,
    customers: customerRows.map(toCustomer),
    inventory: inventory.map(toInventory),
    movements: movements.map(toMovement),
    notifications: outbox.map(toNotification),
    audits: audits.map(toAudit),
  };
  return { state, role, members };
}
