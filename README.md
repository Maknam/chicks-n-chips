# Chics & Chips

Mobile-first campus food ordering for Chics & Chips at Pent Hall, Legon: guest ordering with pickup slots, a kitchen board, cashier POS and an owner dashboard.

**Stack:** Next.js 16 (App Router) · Neon Postgres · Drizzle ORM · Better Auth (staff) · Vercel.

## Quick start

Requires Node 24 and the Neon CLI (`npm i -g neon`, then `neon login`).

```bash
npm install
neon checkout dev --create     # personal Neon branch; writes DATABASE_URL to .env.local
# add app values to .env.local — see .env.example (BETTER_AUTH_SECRET, APP_ORIGIN, DEMO_MODE=true)
npm run db:migrate
npm run db:seed -- --demo      # menu + fictional orders + four demo staff logins
npm run dev
```

- `/` customer app · `/kitchen` kitchen board · `/pos` cashier · `/admin` owner dashboard
- Demo logins: `owner|manager|cashier|kitchen@demo.local`, password `demo-password`

## Client onboarding (no email service needed)

1. Issue a one-time owner setup code for the database: `npm run setup:code` (valid 7 days, single use).
2. Give the owner the app URL and the code. They open `/setup` and create their own owner login.
3. The owner invites staff from **Admin → Staff**. Each invite is a private link (`/join#…`, valid 72 h, single use) where the person chooses their own password.
4. Forgotten password: the owner clicks **Reset link** next to the member (valid 24 h). Everyone can change their own password at `/account`.

Only hashes of codes and links are stored. `/setup` closes permanently once an owner exists.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Domain + service tests (in-process Postgres via PGlite — no network) |
| `npm run test:e2e` | Playwright against a seeded Neon branch |
| `npm run verify` | lint, typecheck, tests, build |
| `npm run db:generate` | Create a migration after editing `db/schema/*` |
| `npm run db:migrate` | Apply migrations to the branch in `.env.local` |
| `npm run db:seed [-- --demo]` | Seed menu/inventory (`--demo`: fictional data — never production) |
| `npm run setup:code` | One-time code for the owner to create their own account at `/setup` |
| `npm run staff:create -- --email … --name … --role OWNER --password …` | Fallback: create an account from the CLI |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DATABASE.md](docs/DATABASE.md) and [docs/OPERATIONS.md](docs/OPERATIONS.md).
