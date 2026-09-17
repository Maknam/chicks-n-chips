import { handle } from "@/lib/http";
import { readState, mutate } from "@/lib/repository";
import { DomainError } from "@/lib/domain";
import { MNotifyProvider } from "@/lib/notifications";
export async function POST(req: Request) {
  return handle(async () => {
    if (
      !process.env.WORKER_SECRET ||
      req.headers.get("authorization") !== `Bearer ${process.env.WORKER_SECRET}`
    )
      throw new DomainError("Unauthorized", 401);
    const jobs = await mutate((s) => {
      const jobs = s.notifications
        .filter(
          (n) =>
            n.status !== "SENT" &&
            n.retryCount < 5 &&
            Date.parse(n.nextAttempt) <= Date.now(),
        )
        .slice(0, 10);
      for (const n of jobs) {
        n.status = "SENDING";
        n.retryCount++;
        n.nextAttempt = new Date(Date.now() + 120000).toISOString();
      }
      return jobs;
    });
    const provider = new MNotifyProvider();
    for (const job of jobs) {
      let failure: string | undefined;
      try {
        const order = (await readState()).orders.find(
          (o) => o.id === job.orderId,
        );
        if (!order) throw new Error("Order missing");
        await provider.sendSMS(
          order.phone,
          `Chics & Chips: Order #${order.number} is ready! Collect at Pent Hall. Thank you.`,
        );
      } catch (e) {
        failure = (e as Error).message;
      }
      await mutate((s) => {
        const n = s.notifications.find((n) => n.id === job.id)!;
        n.status = failure ? "FAILED" : "SENT";
        n.errorMessage = failure;
        n.nextAttempt = new Date(
          Date.now() + Math.pow(2, n.retryCount) * 60000,
        ).toISOString();
      });
    }
    return { processed: jobs.length };
  });
}
