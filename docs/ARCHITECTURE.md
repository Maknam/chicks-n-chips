# Architecture

Next.js App Router on Vercel (Node runtime), Neon Postgres via Drizzle ORM, staff authentication with self-hosted Better Auth. Customers never sign in.

## Layers

```
app/            Pages and thin API route handlers: parse → authorize → call a service → respond
components/     Client UI (customer, kitchen, POS, admin)
lib/domain.ts   Shared types and pure business rules (pricing, slots, lifecycle, demand, analytics).
                Imported by both server and browser; no I/O.
server/         Server-only code
  config.ts     Environment access
  context.ts    Ctx = { db, branchId } and transaction()
  http.ts       Error mapping, same-origin check, body limits, Postgres-backed rate limiting
  auth.ts       Better Auth instance (email + password, sign-up disabled)
  staff.ts      Branch membership, role permissions, staff management
  guard.ts      Page-level redirects for staff routes
  receipts.ts   Guest receipt capability tokens
  mappers.ts    Row → DTO conversion
  seed.ts       Menu/inventory and optional demo history
  services/     One module per area: orders, catalog, inventory, payments,
                notifications, branch (settings/revision/audit), workspace (staff snapshot)
db/             Drizzle schema, relations, client and generated SQL migrations
scripts/        migrate, seed, create-staff
tests/          Unit + service tests (PGlite) and Playwright e2e
```

Rule of thumb: business rules go in `lib/domain.ts`, anything touching the database goes in `server/services`, and routes stay thin.

## Consistency

Every command is one short Postgres transaction with explicit row locks:

- **Checkout** locks the branch row, so order numbers are sequential and slot capacity is never exceeded under concurrent checkouts. It is idempotent on the client's `requestId`.
- **Status changes** lock the order (then the inventory rows, then the branch). `PREPARING` deducts recipe stock; `READY` writes a notification row in the same transaction (transactional outbox).
- **Payments** lock the order by its reference; the unique `payments.reference` makes webhooks idempotent.

Each write bumps `branches.revision`. Staff screens poll `/api/revision` every 2.5 s and reload the full workspace only when it changes, with a 30 s refresh as a fallback.

## Security model

- Prices, totals and payment status are computed on the server; client values are ignored.
- Staff: Better Auth session cookie (HttpOnly, SameSite=Strict, Secure in production), plus a `staff_members` role check on every request. Kitchen responses never include customer phone numbers.
- Guests: a receipt link carries an HMAC token bound to the order id. Order numbers and phone numbers alone reveal nothing.
- Cookie-authenticated writes require a matching `Origin`. Rate limits are stored in Postgres, so they hold across serverless instances.
- Online payments are confirmed only by a signed Paystack webhook followed by an independent verify call.
