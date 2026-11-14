# Production on Cloudflare Workers + Supabase

| Environment | Git branch | Host | Database |
|---|---|---|---|
| Development | `development` | Vercel | Neon `Development` |
| Production | `main` | Cloudflare Workers (OpenNext) | Supabase PostgreSQL, through Hyperdrive |

## How the Worker connects

Workers forbid reusing a socket opened by one request in another, so `db/client.ts` creates a new
`pg` pool **per request** from the `HYPERDRIVE` binding and never caches a connection globally
(Better Auth instances are per request too, in `server/auth.ts`). Hyperdrive holds the warm
connections to Supabase and verifies Supabase's certificate. There is no `DATABASE_URL` on Workers;
a missing binding is an error, never a fallback.

## One-time setup

1. Supabase: download the CA certificate (Project Settings → Database → SSL Configuration) and
   disable the Data API (Project Settings → Data API). `db/supabase/harden.sql` also revokes Data
   API grants and enables RLS; `db:migrate:prod` runs it after every migration.
2. Hyperdrive (origin = Supabase **session pooler**, port 5432):
   ```bash
   npx wrangler cert upload certificate-authority --ca-cert certs/supabase-prod-ca.crt --name supabase-prod-ca
   npx wrangler hyperdrive create chicks-n-chips-prod --connection-string="<session pooler URL>" \
     --sslmode=verify-full --ca-certificate-id=<certificate id> --caching-disabled
   ```
   Put the returned id in `wrangler.jsonc` → `hyperdrive[0].id`.
3. Runtime configuration lives only in the GitHub `cloudflare-production` environment (never in the repo,
   never typed into the Cloudflare dashboard). The deploy workflow pushes it to Cloudflare as
   encrypted Worker secrets with `scripts/sync-worker-secrets.mjs` (`wrangler secret bulk` over stdin).
   - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `BETTER_AUTH_SECRET`, `RECEIPT_SECRET`,
     `WORKER_SECRET` (each 32+ random characters), `OWNER_EMAIL`; optional `MNOTIFY_API_KEY`,
     `PAYSTACK_SECRET_KEY`, `SENTRY_DSN`.
   - Variables: `APP_ORIGIN` (`https://host`, no trailing slash); optional `DATABASE_ENDPOINT`
     (Supabase project ref).
   - `wrangler.jsonc` → `vars` holds only harmless constants. Never add a var with the same name as
     a secret: the deploy fails.
4. GitHub: give the `cloudflare-production` environment a required reviewer. Deploy with GitHub Actions
   only: disconnect Cloudflare Workers Builds so pushes are not deployed twice.

## Database administration (from one trusted machine, `.env.prod`)

```bash
npm run db:status:prod                                         # read-only
CONFIRM_DRY_RUN=<ref> npm run db:verify:prod                   # apply in a transaction, roll back
CONFIRM_PRODUCTION_MIGRATION=<ref> npm run db:migrate:prod     # after a backup
npm run db:seed:prod                                           # menu + inventory, once
```

## Deploying

Pushes to `main` run `.github/workflows/deploy-production.yml` on Linux after reviewer approval,
then check `/api/health`. Do not deploy from Windows: OpenNext cannot package there (symlink
EPERM), and `npm run deploy` refuses to build while any Next.js `.env*` file exists because
OpenNext would bundle it into the Worker.

Check a deployment without exposing secrets:

```bash
curl -s -H "Authorization: Bearer $WORKER_SECRET" https://<production>/api/health
# → environment: production, provider: supabase, connection: hyperdrive, migrationsApplied: 5
```
