# Chics & Chips MVP

Mobile-first campus food ordering MVP for Chics & Chips at Pent Hall, Legon.

## Included
- Customer menu, search/category filters, cart and checkout
- ASAP / scheduled pickup
- Demo MoMo / cash selection
- Install-style prompt
- Next.js server API routes
- Live-ish kitchen board (polls every 3s)
- Admin dashboard
- In-memory demo order store

## Run
```bash
npm install
npm run dev
```
Open:
- `/` customer app
- `/kitchen` kitchen queue
- `/admin` owner dashboard

## Production next steps
Replace the in-memory store with Supabase/Postgres, add authentication/RBAC, Paystack webhook verification, mNotify notifications, persistent menu management, capacity-aware time slots, observability, backups, and CI/CD.
