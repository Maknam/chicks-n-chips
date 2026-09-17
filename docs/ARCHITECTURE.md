# Architecture

Next.js App Router + React + TypeScript, Tailwind utilities and the existing warm yellow/ink design. Customer routes share a persistent cart. Kitchen, POS and management consume the same server-authoritative domain service.

## Boundaries

- `lib/domain.ts`: typed records, validation, prices, lifecycle, slots and analytics.
- `lib/seed.ts`: deterministic fictional pilot data and recipe quantities.
- `lib/repository.ts`: local durable demo or Supabase PostgreSQL repository with optimistic concurrency. Domain mutations retry on conflicts; no external side effects inside retry loops.
- `lib/auth.ts`: Supabase access-token verification and server-side staff membership; signed HttpOnly demo sessions only outside production.
- `app/api`: same-origin write validation, authorization, private tracking capabilities, errors and cache policy.
- `components`: customer, kitchen, POS and management views.
- `supabase/migrations`: tenant-scoped storage, RLS and atomic commit functions.

## Data and privacy

The server calculates money in integer pesewas. Order numbers are separate from UUIDs. A random tracking capability authorizes one guest receipt; knowing a phone or order number does not authorize reading history. Device history stores receipt capabilities; customer profiles are staff-only. Staff access is scoped to a configured restaurant and branch. Service credentials never enter browser bundles.

Production uses Supabase. Demo persistence is a local file, serialized in one process and explicitly unsuitable for horizontal hosting. PostgreSQL uses a revision lock to commit each branch mutation atomically. A realtime revision signal refreshes authorized views without publishing customer data; polling is a recovery path.

Payment initialization occurs after durable order creation. Verified Paystack webhooks confirm exact amount/currency/reference and unlock online-paid orders for kitchen work. Cash orders may enter the queue unpaid; completion requires a staff payment confirmation. Notification outbox writes are atomic with readiness; a separately authorized worker retries delivery.

## Deployment

Vercel Node runtime is the primary target. Cloudflare requires an OpenNext adapter and compatibility testing of Node crypto/filesystem imports; production must use the Supabase adapter. No demo filesystem writes are permitted in production. Run migrations, configure auth users and memberships, set secrets and schedule the notification worker before launch.

## Proposed file changes

Replace the public in-memory APIs and demo screens with typed services and shared views. Preserve the existing global style foundation. Add route aliases for menu/cart/checkout, private tracking, device history, staff login, POS and management subroutes. Add migrations, tests, PWA assets, CI, environment example and operational documentation.
