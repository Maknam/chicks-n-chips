# UI audit — Chics & Chips

Baseline for the redesign in `CHICS_AND_CHIPS_UI_DESIGN.md`. Recorded 2026-11-04, before Milestones 1–3.

## 1. What the frontend is

| Topic | Finding |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript. Root layout `app/layout.js`. |
| Routes | Customer: `/`, `/menu`, `/cart`, `/checkout`, `/order/[number]`, `/orders`, `/profile`. Staff: `/admin` + `/admin/[area]` (overview, orders, menu, customers, inventory, reports, staff, settings), `/kitchen`, `/pos`. Auth: `/login`, `/setup`, `/join`, `/account`. |
| Styling | Two hand-written global sheets: `app/globals.css` (≈780 lines) and `app/system.css` (≈1,700 lines, appended in layers, later rules override earlier ones). Tailwind v4 is imported but barely used. No design tokens beyond 4 ad-hoc variables (`--ink`, `--yellow`, `--line`, `--muted`). |
| Fonts | `font-family: Inter, …` is declared but **Inter is never loaded**, so every device renders its system font. |
| Components | No component library. Buttons are CSS classes (`.primary`, `.ghost`, `.secondary`), inputs are native elements styled per screen (`.formGrid input`, `.login input`, `.filterRow input`, `.settingsForm input`). Icons: `lucide-react`. |
| Admin shell | One 600-line client component (`components/admin.tsx`) renders the sidebar, header and every admin area. |
| Data & state | `useOperations(area)` fetches `/api/operations?area=…`, polls `/api/revision` every 2.5 s and refreshes fully every 30 s. Mutations POST to `/api/operations` or PATCH `/api/orders/[id]`. No global state library. |
| RBAC | Server-side in `server/staff.ts` (`permissions` map, `requireStaff`), pages guarded by `server/guard.ts`. The sidebar repeats the rules by hand. |
| Kitchen / POS / customer | Already separate screens (`components/operations.tsx` kitchen board, `components/pos.tsx`, `components/customer.tsx`) with their own headers — not the admin sidebar. |

## 2. Why it feels unfinished

| # | Problem | Where | Fix | Priority |
|---|---|---|---|---|
| 1 | Sidebar is one flat list mixing admin pages with separate workspaces (Kitchen, POS, Customer menu); active state is a heavy solid-yellow slab; tiny "C&C" mark; account/demo/sign-out squeezed at the bottom and overlapped on short screens | `admin.tsx`, `system.css .sidebar` | Grouped, role-aware nav (Overview · Operations · Management · Workspaces), 4 px accent indicator, fixed footer with Settings and an account block, independently scrolling nav | P0 |
| 2 | No real page header: title, a muddled "Fictional pilot data · Live operations" line and a lone Refresh button | `admin.tsx` | Top bar with breadcrumb + data-status badges; page header with title, description and actions | P0 |
| 3 | "Demo data" and "live" are conflated in one sentence | `admin.tsx` | Separate **Demo data** badge from a connection badge (**Live / Updating / Stale / Offline**) driven by real fetch state | P0 |
| 4 | Browser-default selects/inputs with inconsistent heights, borders and focus rings, re-styled differently on every screen | all forms | One field system: label above, 44 px controls, custom chevron, unit suffixes, help and error text | P0 |
| 5 | Settings forms remount on every background refresh (keyed on server data), silently wiping unsaved edits; no dirty state, no unsaved warning, no saving state, success shown as a generic banner | `components/settings.tsx` | Draft/baseline hook, unsaved bar, Save/Discard/Stay dialog, spinner while saving, toast only after the server confirms | P0 |
| 6 | Capacity text uses `floor`, but the slot generator includes a final partial slot (`ceil`) — numbers can disagree with reality | `settings.tsx` vs `lib/domain.ts buildSlots` | Compute with the same rule as `buildSlots`, label as theoretical ceiling | P1 |
| 7 | Font weights 750–900 everywhere, ALL-CAPS eyebrows on every page, mixed 11–36 px sizes | `globals.css`, `system.css` | Type scale + weights 400–700, tabular numbers for money/time | P1 |
| 8 | Hard-coded hex values (≈120 distinct) and warm cream canvas everywhere | both sheets | Semantic tokens (`app/tokens.css`) and a neutral app canvas for staff screens | P1 |
| 9 | Phones: sidebar becomes a horizontal scroller of links above the page; no drawer | `system.css` | 56 px sticky top bar + modal drawer (focus trap, Escape, focus restore) | P0 |
| 10 | No toast/confirm primitives; destructive actions (remove staff) are one click | `staff.tsx` | Shared `ConfirmDialog` + `Toast` (Staff adoption in Milestone 4) | P1 |

## 3. Plan

1. **Foundations** — load Inter via `next/font`; `app/tokens.css` (semantic colour, spacing, radius, type, elevation tokens + primitives CSS); `components/ui/*` primitives.
2. **Shell & navigation** — `lib/navigation.ts` (typed, role-aware, mirrors `server/staff.ts` permissions); `components/layout/admin-shell.tsx` (sidebar, top bar, status badges, mobile drawer). Routes unchanged.
3. **Settings** — rebuild all four sections on the primitives; Operations as three cards (hours, scheduling, capacity preview) with validation, dirty state, unsaved-change protection and confirmed saves. API contract unchanged.
4. Later milestones (after review): Orders, Overview, Menu, Inventory, Customers, Reports, Staff; then Kitchen, POS and customer ordering.

Known constraint: the remaining admin pages keep their current internals until Milestone 4; they sit inside the new shell, so expect some visual mismatch between shell and page content until then.
