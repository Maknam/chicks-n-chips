# Database

Neon Postgres (project `spring-violet-36207625`). Schema is defined in TypeScript in `db/schema/` and versioned as SQL in `db/migrations/` (Drizzle Kit).

## Conventions

- Money: integer pesewas. Quantities: `numeric(12,3)`. Timestamps: `timestamptz` (UTC; Africa/Accra is UTC+0).
- Every operational row has a `branch_id`; a branch belongs to one restaurant.
- Order lines snapshot product name, variant and unit price, so receipts survive menu edits.

## Tables

| Area | Tables |
|---|---|
| Tenancy | `restaurants`, `branches` (settings, next order number, revision) |
| Staff auth | `user`, `session`, `account`, `verification` (Better Auth), `staff_members` (role per branch) |
| Catalog | `categories`, `products`, `product_variants`, `product_options`, `product_ingredients` |
| Inventory | `inventory_items`, `stock_movements` (restock / waste / consumption ledger) |
| Orders | `customers`, `orders`, `order_items`, `order_item_options`, `payments` |
| Operations | `notifications` (outbox), `audit_logs`, `rate_limits` |

The `neon_auth` schema on this project belongs to Neon Managed Auth, which the app does not use.

## Changing the schema

1. Edit `db/schema/*.ts`.
2. `npm run db:generate -- --name <change>` and review the SQL in `db/migrations/`.
3. `npm run db:migrate` against your dev branch, then `npm test`.
4. Commit the migration. Production is migrated during deploy (see OPERATIONS.md).

## Branches

`production` holds live data. Develop on your own branch (`neon checkout <name> --create`); new branches inherit production's schema and data copy-on-write and expire after 7 days (policy in `neon.ts`). Never seed `--demo` data into production.

## Retention

Agree retention for customer phone numbers with the owner before launch. Enable point-in-time restore on the Neon plan, and rehearse a restore to a branch.
