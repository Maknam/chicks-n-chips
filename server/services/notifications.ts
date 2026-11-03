// Notification outbox delivery. Jobs are claimed with SKIP LOCKED leases so
// concurrent workers never double-claim. Delivery is at-least-once.
import { and, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { notifications, orders, rateLimits } from "@/db/schema";
import { config } from "../config";
import type { Ctx } from "../context";

export interface NotificationProvider {
  sendSMS(to: string, message: string): Promise<void>;
}

export class MNotifyProvider implements NotificationProvider {
  async sendSMS(to: string, message: string) {
    const { key, sender } = config.mnotify();
    if (!key) throw new Error("mNotify credentials not configured");
    const response = await fetch(
      `https://api.mnotify.com/api/sms/quick?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: [to.replace("+", "")],
          sender,
          message,
          is_schedule: false,
          schedule_date: "",
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok || String(result.code) !== "2000")
      throw new Error("mNotify did not accept the message");
  }
}

const MAX_ATTEMPTS = 5;
const LEASE_SECONDS = 120;
const backoffMinutes = (attempts: number) => 2 ** attempts; // 2, 4, 8, 16 …

export const readyMessage = (number: number) =>
  `Chics & Chips: Order #${number} is ready! Collect at Pent Hall. Thank you.`;

/** Claims and sends due notifications across all branches. Returns delivery counts. */
export async function deliverDue(
  c: Pick<Ctx, "db">,
  provider: NotificationProvider = new MNotifyProvider(),
  limit = 10,
) {
  // Claim: lease the rows by pushing next_attempt_at forward. A crashed worker's lease simply expires.
  const due = c.db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        inArray(notifications.status, ["PENDING", "SENDING", "FAILED"]),
        lt(notifications.attempts, MAX_ATTEMPTS),
        lte(notifications.nextAttemptAt, sql`now()`),
      ),
    )
    .orderBy(notifications.nextAttemptAt)
    .limit(limit)
    .for("update", { skipLocked: true });
  const jobs = await c.db
    .update(notifications)
    .set({
      status: "SENDING",
      attempts: sql`${notifications.attempts} + 1`,
      nextAttemptAt: sql`now() + make_interval(secs => ${LEASE_SECONDS})`,
    })
    .where(inArray(notifications.id, due))
    .returning();

  let sent = 0;
  let failed = 0;
  for (const job of jobs) {
    let error: string | undefined;
    try {
      const [order] = await c.db
        .select({ number: orders.number, phone: orders.customerPhone })
        .from(orders)
        .where(eq(orders.id, job.orderId));
      if (!order) throw new Error("Order missing");
      await provider.sendSMS(order.phone, readyMessage(order.number));
    } catch (e) {
      error = (e as Error).message.slice(0, 500);
    }
    await c.db
      .update(notifications)
      .set(
        error
          ? {
              status: "FAILED",
              lastError: error,
              nextAttemptAt: sql`now() + make_interval(mins => ${backoffMinutes(job.attempts)})`,
            }
          : { status: "SENT", lastError: null, sentAt: new Date() },
      )
      .where(eq(notifications.id, job.id));
    if (error) failed++;
    else sent++;
  }
  // Housekeeping piggybacks on the worker schedule.
  await c.db.delete(rateLimits).where(lt(rateLimits.windowStart, sql`now() - interval '1 day'`));
  return { claimed: jobs.length, sent, failed };
}
