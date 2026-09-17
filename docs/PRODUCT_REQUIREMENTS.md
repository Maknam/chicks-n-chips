# Chics & Chips pilot requirements

The pilot serves Pent Hall, University of Ghana. Guest ordering must remain possible; phone recognition must never expose another customer's history.

| Pain | Feature | User | Expected outcome | Metric |
|---|---|---|---|---|
| Long queues | Mobile cart, customization, pickup tracking | Student | Less waiting | Pickup arrival-to-completion minutes |
| Lunch overload | Atomic slot capacity and busy-time estimate | Student/kitchen | Spread demand | Late-order percentage |
| Mixed-up orders | One validated order engine and lifecycle | All staff | Accurate tickets | Reported order errors / orders |
| Unclear priorities | Urgency-sorted kitchen board | Kitchen | Prepare next due ticket | Order-to-ready minutes |
| Hidden bulk demand | Ingredient totals per pickup batch | Kitchen | Prepare enough portions | Orders served per peak hour |
| Disconnected walk-ins | POS using the same engine | Cashier | Complete demand picture | Online / walk-in share |
| Readiness questions | Private tracking link and notification outbox | Student | Fewer interruptions | Ready-to-collected minutes |
| Absent owner | Responsive live operations overview | Owner | Fast remote visibility | Active/late orders, paid revenue |
| Unknown sellers | Product, option, hourly and daily aggregates | Manager | Improve menu decisions | Product revenue, basket size |
| Ordering sold-out food | Shared availability and server revalidation | Student/kitchen | Fewer failed orders | Stockout events |
| Guessing preparation | Confirmed scheduled demand and historical totals | Kitchen | Evidence-based preparation | Scheduled demand, shortage |
| Waste and stockouts | Restock/waste ledger and recipe mapping | Manager | Reduce waste | Waste quantity and shortage |
| Low retention | Device-held order receipts, reorder, phone profiles | Student | Faster return visits | Repeat customer rate |
| Owner away | Same protected dashboard on every screen size | Owner | Understand health in 30 seconds | Revenue, queue, stock alerts |
| Growth chaos | Restaurant/branch scope and role enforcement | Owner | Consistent operations | Peak throughput |

## Acceptance and measurement

Prices and payment status are server-owned. Concurrent orders cannot exceed slot capacity. Payment events are signed and idempotent. Failed SMS cannot roll back an order. All staff reads and writes require a role; production never permits demo authentication. Order timestamps record acceptance, preparation, readiness, arrival and completion. Revenue counts paid, non-cancelled orders. Missing measurements are displayed as unavailable, never as zero performance.

## Delivery sequence

1. Schema, realistic seed, typed foundation and verification scripts.
2. Customer menu, customization, persistent cart, checkout and pickup slots.
3. Validated order engine, privacy, lifecycle, tracking and history.
4. Kitchen queue, urgency, sound opt-in and production batches.
5. Cashier POS and receipts through the shared engine.
6. Owner overview, orders, menu, customers, reports, staff and settings.
7. Inventory movements, waste and demand comparison.
8. Paystack verification and asynchronous notification outbox.
9. Install prompt, icons, service worker and offline fallback.
10. Security regression tests, build checks, CI and deployment guide.

After each implementation phase run lint, typecheck, tests and production build. External credentials and database migration deployment are separate environment configuration, not assumed complete by a successful local build.
