# UI implementation report — Milestones 1–3

Spec: `CHICS_AND_CHIPS_UI_DESIGN.md`. Audit: [`UI_AUDIT.md`](UI_AUDIT.md). Date: 2026-11-04.
Status: **ready for visual review.** Milestones 4–6 have not started, as the brief requires.

## Completed

### Milestone 1 — Foundations
- **Font:** Inter, self-hosted at build time via `next/font/google` (it had been named in CSS but never loaded).
- **Tokens** (`app/tokens.css`): brand, surface, text, border, status colours; type scale; 4-based spacing; radii (10/14/18); elevation; focus ring; layout sizes (248 px sidebar, 64 px top bar, 44 px controls, 1000/1440 px content widths).
- **Primitives** (`components/ui/index.tsx`, styles in `tokens.css`):
  - `Button` with primary, secondary, ghost and danger variants, plus loading and disabled states.
  - `Card`, and `Field` (label above the control, help text below, error wired with `aria-describedby`).
  - Form controls: `TextInput`, `NumberInput` (with a unit suffix), `Select` (custom chevron), `Textarea`, `Switch` (`role="switch"`), and `Segmented` (a radio group).
  - `Badge`.
  - `ConfirmDialog`, built on native `<dialog>`, which gives focus trapping, Escape to close and focus restore.
  - `ToastProvider`/`useToast`, using a polite live region; error toasts use `role="alert"`.
  - All primitives use native elements underneath, and no component library was added.
- **Draft state** (`components/ui/use-draft.ts`):
  - Each form keeps a saved baseline, a draft, a dirty flag, discard, and a mark-saved step that runs only after the server confirms.
  - Background refreshes update the form only while it has no unsaved edits. Otherwise the change is flagged with "Changed elsewhere".

### Milestone 2 — Shell & navigation
- **Navigation config** (`lib/navigation.ts`): typed and role-aware, with groups *Overview · Operations · Management · Workspaces* and a footer item (Settings for owners, My account for others). A unit test keeps it equal to the server's `permissions` map.
- **Admin shell** (`components/layout/admin-shell.tsx`, `app/shell.css`):
  - Brand block, and a scrolling navigation area with the footer pinned (Settings plus an account block with avatar, role and sign-out).
  - The active page gets a 4 px accent bar on a tinted background instead of the old solid yellow slab.
  - Workspace links (Kitchen, POS, Customer ordering) carry a "›" marker and a tooltip saying they open a separate interface.
  - The Orders badge is a real count of NEW orders.
- **Top bar:** breadcrumb, a **Demo data** badge, and a separate connection badge (Live / Updating… / Stale · n min ago / Offline / Can't reach server) driven by real fetch results and `navigator.onLine`.
- **Page header:** title, description and actions for every admin area. The old one-liner taglines and the "Fictional pilot data · Live operations" sentence are gone.
- **Responsive:** fixed sidebar at 1024 px and up. Below that, a 56 px sticky top bar opens a modal drawer that traps focus, closes on Escape or a backdrop click, and returns focus to the menu button.

### Milestone 3 — Settings (`components/settings.tsx`, `app/settings.css`)
- **Section navigation:** a left rail on wide screens and a segmented scroller below 900 px. Deep links `?section=business|operations|receipts|account` still work, and Back/Forward switch sections.
- **Business profile:** an identity card (name, branch) and a contact & location card (phone with validation, read-only time zone, address).
- **Hours & capacity:**
  - Opening hours card: Opens at and Closes at, with an inline error if closing isn't after opening (overnight hours aren't supported by the backend, and the message says so).
  - Pickup scheduling card: slot length from the supported values, maximum orders per slot (1–200) and base preparation time (5–120 min), each with its unit and help text.
  - **Capacity preview:** slots per day, maximum orders per hour, and bookable orders per day, labelled as a *theoretical ceiling*. It uses the new `slotsPerDay`, the same rule as `buildSlots`, including a final partial slot, which is disclosed. It warns above 120 orders an hour, and when no slots are available.
  - The reservations note states actual behaviour: existing orders keep their pickup times, and new limits apply only to new orders.
- **Receipts & printing:** paper and text size, grouped switches for what prints, messages, the auto-print option, a test print, and a live preview.
- **My account:** profile, password change (with validation), and sign-out.
- **Save behaviour, every section:**
  - Save is disabled until something changes and everything is valid.
  - A spinner shows while saving, and double submits are blocked.
  - The success toast appears only after the server confirms. On failure, an error toast shows and the edits are kept.
  - Submitting while invalid moves focus to the first invalid field.
  - The save bar sticks to the bottom of the screen only while there are unsaved changes.
- **Unsaved-change protection:**
  - Switching section or pressing Refresh opens a dialog: Save changes, Discard or Stay.
  - Closing the tab or following a sidebar link triggers the browser's leave-page prompt.

## Files

| New | Purpose |
|---|---|
| `app/tokens.css` | Tokens + primitive styles |
| `app/shell.css` | Admin shell styles |
| `app/settings.css` | Settings styles |
| `components/ui/index.tsx` | Primitives |
| `components/ui/use-draft.ts` | Draft / dirty-state hook |
| `components/layout/admin-shell.tsx` | Shell, sidebar, top bar, drawer, `PageHeader`, `ConnectionBadge` |
| `lib/navigation.ts` | Role-aware navigation config |
| `tests/design-system.test.ts` | Capacity rule = slot generator; navigation = server permissions |
| `docs/design/*` | Audit, this report, screenshots |

| Changed | Change |
|---|---|
| `app/layout.js` | Inter via `next/font`, new stylesheets |
| `components/admin.tsx` | Uses `AdminShell`/`PageHeader`; settings mutations surface server messages |
| `components/operations.tsx` | `useOperations` also returns `loading`, `updatedAt`, `failed` (additive) |
| `components/settings.tsx` | Rebuilt |
| `lib/domain.ts` | `slotsPerDay` helper (pure, additive) |

**Routes:** unchanged. **API contracts, RBAC, database, order lifecycle:** unchanged by these milestones.

## Tests run

- `tsc --noEmit`: pass. `eslint .`: pass, with no warnings.
- `npm test`: **25/25 pass**, including 2 new tests.
- `next build` with no database URL: pass.
- **Playwright** (Edge, against the local dev server and dev-branch demo data): **39/39 checks pass**, run twice in a row.
  - **No horizontal overflow** on all four Settings sections and the Overview, at 390, 768, 1280 and 1440 px.
  - **Drawer at 390 px:** focus moves into the drawer, and Escape closes it and returns focus to the menu button.
  - **Hours & capacity checks from spec §23**, all passing:
    - the deep link highlights the section;
    - the preview shows 56 slots and 840 orders, and recalculates to 42 slots at 20 minutes;
    - "Unsaved changes" appears, and Save enables only when the form is dirty and valid;
    - invalid hours show an inline error, mark the field `aria-invalid` and disable Save;
    - Refresh with edits opens the dialog, and Stay keeps the edit;
    - switching section, then Discard, works;
    - browser Back returns to the saved value;
    - saving shows the toast and the value survives a reload (the original value was restored afterwards);
    - Tab reaches every control and every section link.
  - Zero page errors or console errors.
- **Contrast:** computed for every token pair. Four spec colours were darkened slightly to reach WCAG AA (≥4.5:1): muted text `#636d7d`, success `#127052`, warning `#8c5306`, danger `#b23434`.

Screenshots: `docs/design/screenshots/` (`before-*` from the previous Settings, `after-*` from this build).

## Deviations from the spec

| Spec | Implemented | Why |
|---|---|---|
| 72 px icon rail at 1024–1279 px | Full sidebar at 1024 px and up, drawer below | Simpler, and labels stay visible; a rail can be added later |
| Workspace selector ▾ | Static "Pent Hall · Workspace" | Single branch; a non-working dropdown would invent a feature |
| Help & support item | Omitted | No help content exists |
| Global search in the top bar | Omitted | Spec: no non-functional search |
| Leave-page prompt with Save/Discard/Stay | In-app dialog for section switches and Refresh; the browser's own prompt for sidebar links and tab close | Sidebar links are full page loads; browsers only allow their native prompt there |
| Status colour hexes | Darkened (see Tests) | WCAG AA |

## Known limitations

- **Mixed styles inside the new shell:** the remaining admin pages (Overview, Orders, Menu, Customers, Inventory, Reports, Staff) keep their old internals until Milestone 4. A small bridge stylesheet aligns their cards with the new palette, but fonts, weights and some cream accents still differ.
- **Unused legacy CSS:** older sheets (`globals.css`, `system.css`) still contain rules for the previous sidebar and settings, now unused. They are kept for safety and will be removed as each page migrates.
- **Untested printer:** printing hasn't been tried on a physical thermal printer.
- **One unreproduced failure:** in one Playwright run, a save that restores the original value didn't show its toast within 20 s. It didn't happen again in two full runs or in an isolated run; the logs point to slow responses from the dev server.

## Next (after review)

- **Milestone 4:** Orders, then Overview, Menu, Inventory, Customers, Reports and Staff, moved onto the primitives (tables, filters, drawers, empty states, a confirm dialog for removing staff).
- **Milestone 5:** Kitchen display, POS, customer ordering.
- **Milestone 6:** accessibility audit, device testing, removal of legacy CSS.
