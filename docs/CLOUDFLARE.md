# Cloudflare Workers

Wrangler and the OpenNext adapter are installed locally. Run commands from the app folder containing `wrangler.jsonc`.

```bash
npx wrangler login
npm run build:worker
npm run preview
npm run deploy
```

`deploy` publishes to `chics-and-chips-mvp.<your-subdomain>.workers.dev`. Normal local development remains `npm run dev`.

## Database configuration

Vercel is the primary target. Workers need `DATABASE_URL` (Neon) and `BETTER_AUTH_SECRET`; see `docs/OPERATIONS.md`.

Set `DATABASE_URL`, `APP_ORIGIN` and secrets with `npx wrangler secret put DATABASE_URL` / `BETTER_AUTH_SECRET` / `WORKER_SECRET`.

Paystack and mNotify keys are optional until those integrations are enabled. Never paste secrets into `wrangler.jsonc`. For local Worker preview, copy `.dev.vars.example` to `.dev.vars` and fill in the values.

After deploying, check `/api/health` for `database: "ok"`. Apply the migrations, seed the menu, and create the first owner membership before testing staff routes.

Native Windows OpenNext support can be limited; if adapter builds fail on Windows, run the same commands in WSL or a Linux CI runner.

Setup follows the [OpenNext Cloudflare guide](https://opennext.js.org/cloudflare/get-started).
