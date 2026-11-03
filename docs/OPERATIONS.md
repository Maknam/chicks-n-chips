# Running the pilot

## Production setup (Vercel + Neon)

1. **Database.** The Neon `production` branch already has the schema. Seed the menu once, using production's URL:
   `DATABASE_URL=<production pooled url> npx tsx scripts/seed.ts` (without `--demo`).
2. **First owner.** Send the owner the app URL straight away: the first person to complete `/setup` becomes the owner, and the page then closes for good. To reserve it, set `OWNER_EMAIL` in Vercel; only that address can create the owner account. The owner then invites staff from `/admin/staff` with private single-use links.
3. **Vercel project.** Root directory: the repository root. Connect the Neon integration (or set `DATABASE_URL` / `DATABASE_URL_UNPOOLED` by hand). Set `APP_ORIGIN` to the exact HTTPS URL, `BETTER_AUTH_SECRET` (32+ random characters), and `CRON_SECRET`.
4. **Migrations on deploy.** Run `npm run db:migrate` before promoting a build that includes new migrations (for example as a CI step using `DATABASE_URL_UNPOOLED`).
5. **Check.** `/api/health` returns `{"database":"ok"}`. A missing database or uninitialized branch returns 503.

## Payments (Paystack)

Set `PAYSTACK_SECRET_KEY` (a test key in staging) and the webhook URL `/api/webhooks/paystack`. The webhook verifies the raw-body HMAC, then re-verifies the transaction with Paystack. Amount, GHS currency and reference must match. Duplicate webhooks are no-ops. A payment for a cancelled order is recorded and audited as `PAID_CANCELLED_REVIEW_REFUND` for a manual refund. Cash and merchant MoMo are confirmed by a cashier.

## SMS notifications (mNotify)

Marking an order READY queues an SMS in the same transaction, and the app sends it immediately after responding. The worker `/api/workers/notifications` retries failures with exponential backoff (5 attempts). `vercel.json` schedules it once a day, which works on every Vercel plan. For prompt retries, add an external scheduler that POSTs every minute with `Authorization: Bearer $WORKER_SECRET` (for example cron-job.org), or on Vercel Pro change the schedule to `* * * * *`. Delivery is at-least-once. Set `MNOTIFY_API_KEY` and a provisioned sender.

## Stock and metrics

Starting preparation deducts recipe quantities and is blocked if recorded stock is short. Cancelling after preparation does not restore stock. Revenue counts paid, non-cancelled orders. Pickup wait is measured from the customer's "I'm at Pent Hall" tap. Missing measurements show as unavailable, not zero. Dashboards load the last 30 days plus all open orders.

## Security checklist

- Keep `BETTER_AUTH_SECRET`, `CRON_SECRET`, `WORKER_SECRET` and provider keys only in Vercel environment variables or `.env.local` (git-ignored).
- Vercel sets `x-forwarded-for`, which the rate limiter relies on. Do not expose the app behind another proxy without overwriting it.
- Logs avoid request bodies, receipt tokens and credentials. `instrumentation.ts` is the hook point for Sentry.
