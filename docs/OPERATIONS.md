# Running the pilot

## Local development

Use Node 24. Run commands in the nested `chics-and-chips-mvp` application folder. `npm install`, then `npm run dev`. On Windows PowerShell use `npm.cmd` if execution policy blocks npm.ps1. Restart any old development server after updating dependencies.

Without external configuration the development server uses fictional demo data in `.data/demo.json`. All four roles can be selected at `/login`. Demo writes survive a restart. This file must never be used for real customer records, shared across processes or committed. Production mode refuses this fallback.

## Supabase production setup

1. Create a separate Supabase project for staging. Apply `supabase/migrations/001_initial.sql` in the SQL editor or with your migration tooling.
2. Copy `.env.example` to `.env.local`. Set `DATA_MODE=supabase`, Supabase URL, anon key, service-role key, restaurant/branch IDs and exact HTTPS `APP_ORIGIN`. Keep service and provider keys private.
3. Run `npm run db:seed` for the menu and inventory only. Use `npm run db:seed -- --demo` only in a disposable staging project. The script refuses to overwrite initialized data.
4. Create the first staff user through Supabase Auth. Insert its UUID into `staff_roles` with OWNER, the configured restaurant ID and branch ID. Subsequent users can be assigned from `/admin/staff`. Configure Supabase password policy and recovery before staff onboarding.
5. Production staff sessions last one hour and require signing in again. Cookies are HttpOnly, Secure and SameSite=Strict. Authorization is checked against membership for every protected API request and page.
6. Deploy the app folder to Vercel using Node runtime. Set production environment variables there. Run `/api/health`; an unconfigured/unreachable database produces HTTP 503 rather than a false healthy response.

## Payments and notification worker

Set Paystack's test key in staging and configure the webhook URL `/api/webhooks/paystack`. The endpoint verifies the raw-body HMAC and then independently verifies the transaction with Paystack. Amount, GHS currency and reference must match. Test success, duplicate webhook, invalid signature, amount mismatch and provider timeout before changing to live keys. No browser action can confirm an online payment.

Cash and merchant MoMo receipts are explicitly confirmed by an authorized cashier. Cancellation after online payment is flagged in audit logs for manual refund review; this MVP does not automatically refund. Review pending unpaid online reservations and cancel abandoned ones from Orders; they retain capacity until cancelled. Do not enable online payment until staff understand this procedure.

Run an external scheduler every minute to POST `/api/workers/notifications` with `Authorization: Bearer <WORKER_SECRET>`. Use a long random secret. Jobs use a two-minute lease, exponential retry and a five-attempt limit. mNotify requires a provisioned sender and account credit. Provider failures never undo order readiness. SMS is at-least-once delivery: a worker crash after sending can cause a duplicate message. Monitor failed jobs in the notifications table. WhatsApp/push are extension interfaces, not enabled channels.

## Stock and metrics

Starting preparation deducts the configured recipe quantities. Record restocks before starting a ticket if recorded stock is insufficient. Cancellation after preparation does not restore ingredients automatically: the meal has already consumed stock. Waste entries reduce remaining stock; do not record the same consumed meal again as a stock loss. Review menu recipe quantities against actual portions before launch.

All times use Africa/Accra. Revenue counts paid non-cancelled orders; cancellation therefore excludes sales pending manual refund. Pickup wait starts only when the customer taps “I’m at Pent Hall”; missing arrival data stays unavailable. Report order mistakes with “Record order error”. Availability changes capture stockout events. Metrics are pilot indicators, not statutory accounting reports.

## Security, backups and retention

- Hosting must overwrite `x-forwarded-for`; PostgreSQL-backed rate limits assume a trusted proxy. Add provider-level WAF limits for payload sizes and traffic spikes.
- Guest receipt capabilities are private bearer links. They are stored on the ordering device; phone numbers alone cannot retrieve history. Guest receipts are not cached by the service worker.
- Supabase RLS denies direct public operational reads/writes. Backend service-role calls are protected by route authorization. Only safe revision signals are published to realtime.
- Back up daily; enable point-in-time recovery when available. Before launch, restore a backup into a separate project and verify orders, payments and memberships. Record backup owner, retention and restore time.
- Agree customer-data retention with the owner. Restrict staff access to phones, anonymize expired profiles and remove associated receipt capabilities. No card data is stored.
- Structured logs avoid request bodies. `instrumentation.ts` is the Sentry hook point; `SENTRY_DSN` alone does not enable an SDK integration.

## Scope and scaling

PostgreSQL serializes branch writes using a revision lock. This is suitable for a small-vendor pilot, not a high-volume SaaS launch. Reporting entities use relational IDs/scope with typed JSON data and transactional projections. Before substantial growth, replace aggregate branch rewrites with dedicated SQL command functions, pagination and database reporting views.

Vercel is the validated build target. Cloudflare requires OpenNext configuration and staging validation; use Supabase, never local demo storage. Stock imagery is illustrative and should be replaced with the eatery's own product photographs in Supabase Storage before a public launch.

References: [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps), [Paystack webhooks](https://paystack.com/docs/payments/webhooks/), [Paystack transactions](https://paystack.com/docs/api/transaction/), [mNotify API](https://readthedocs.mnotify.com/).
