# Student ordering & universal order tracking

Audit, plan and implementation report. Date: 2026-11-04. Status: implemented and verified on the dev branch; **not deployed**.

## 1. Audit — before this work

**Journey:** `/` or `/menu` → product sheet (size, extras) → cart bar → checkout sheet (name, phone, pickup slot, payment) → `POST /api/orders` → confirmation sheet → `/order/{number}#{token}`.

| Area | Finding |
|---|---|
| Menu | `components/customer.tsx`, shared with the POS. Search matched product **names only**; category chips; 4-column grid; the add button was an unlabelled “+”. |
| Cart | `localStorage` key `cc-cart`; prices recomputed client-side for display only; the server prices every order (`priceItems`). |
| Checkout | Idempotent on `requestId`; slot capacity is atomic (branch row lock); payment CASH, MOMO (POS only), ONLINE (Paystack). |
| Kitchen lifecycle | `NEW → ACCEPTED → PREPARING → READY → COMPLETED`, plus `CANCELLED` and `REJECTED`; timestamps per step; online orders reach the kitchen only after Paystack verification. |
| Receipt link | `/order/{n}#{token}`. The token is an HMAC of the order id (43 characters), sent in the `x-order-token` header. It returns the **full** order, including name and phone, and also allows *start payment* and *I’m here*. It already worked on any device, but it can’t be typed. |
| Order history (`/orders`) | **Only `localStorage`** (`cc-receipts`: order number and token per order). No cookie, session or IP is involved. A browser with no history had nothing to show and no way to look an order up. |
| Real-time | None for guests: the receipt page polled every 4 s with no visibility handling, back-off or stop. |

**Gaps:** no typable tracking credential; no public read-only lookup; `/orders` was useless on a new device; polling never stopped.

## 2. Plan (as executed)

1. Backend — a random, unique, indexed `tracking_code` per order; a read-only `POST /api/track`; the customer-safe view; rate limits.
2. `/orders` — a track form and live result, plus the existing local history.
3. Journey — the confirmation screen shows the code, Track, copy link and QR; the receipt page shows the same; one shared progress component.
4. Menu — header, hero, search, grouped grid, cards, cart bar.
5. QR — on screen and optionally on printed receipts.
6. Verification — unit and integration tests, plus an end-to-end browser journey.

## 3. What was built

### Tracking code
- **Format:** `CC-XXXXX-XXXXX`. That is 10 characters from a 31-symbol alphabet that leaves out the look-alikes 0, O, 1, I and L, giving 31¹⁰ ≈ 8.2 × 10¹⁴ possible codes (≈ 49.5 bits).
- **Generation:** server-side by `server/tracking.ts`, using `crypto.randomBytes` with rejection sampling so every symbol is equally likely. It is never derived from the order number.
- **Storage:** `orders.tracking_code`, `NOT NULL`, with a unique index `orders_tracking_code`. The code never changes during the order's life. An idempotent checkout retry returns the same code.
- **Migration `0003_order_tracking_code`:** adds the column, backfills existing orders with per-row random bytes, then adds `NOT NULL` and the unique index. Applied to the **dev** branch: 70/70 orders got distinct, valid codes.
- **Input normalisation** (`lib/tracking.ts`): accepts any case, spaces, dashes, a `CC` prefix or a whole pasted link.

### Public endpoint — `POST /api/track` `{ code }`
- **POST, not GET:** the code travels in the request body. Tracking links put it after `#`, so it never reaches server logs, access logs or analytics.
- **Read-only:** a tracking code can't pay, cancel, change or collect an order. Those still need staff access, or the private receipt link for payment.
- **Fields returned** (`toPublicOrder`):
  - order number, code, status and label;
  - created, updated and pickup times, and whether the order was scheduled;
  - channel, payment method and status, and whether it's awaiting payment;
  - total, item names and quantities;
  - a five-step timeline with timestamps.
- **Never returned:** customer name or phone, internal ids, request id, payment reference, payment URL, receipt token.
- **Abuse limits** (per client IP, in Postgres, so they hold across serverless instances):
  - 60 lookups per minute;
  - 10 unknown codes per minute (429 after that);
  - unknown and malformed codes get an identical 404;
  - requests from other origins are refused.
- **Headers:** `Cache-Control: no-store` and `Referrer-Policy: no-referrer` (existing `json()` helper).

### `/orders`
- **Track an order:** input with validation, a loading state, an invalid-code message, a not-found message, a network-error message with retry, the live progress and the code card.
- **Deep link:** `/orders#CC-…`, which is also what the QR code encodes. Tracking updates the address so it can be shared.
- **Live updates** (`useOrderTracking`):
  - checks every 5 s, only while the tab is visible, and immediately when the tab becomes visible again;
  - stops once the order is completed or cancelled;
  - network errors back off from 5 s to 40 s and pause after 5 in a row, with a Retry button.
- **Recent orders on this device:** the existing `cc-receipts` history with Track, Receipt and Order again. It's marked as browser-only convenience.

### Journey
- **Confirmation screen:**
  - order number, status, pickup time and total;
  - the payment line says "Pay at pickup", "Cashier confirms MoMo" or "Not paid yet" — never "paid" unless the server says so;
  - the tracking code with copy, copy-link, share (where the device supports it) and a QR code on request.
  - **Buttons:** Track order (public page), View receipt (private) and Back to the menu. Unpaid online orders get **Pay now** first.
- **Receipt page `/order/{n}#token`:** the shared progress component and code card. Payment, "I'm at Pent Hall" and Order again are unchanged.
- **Navigation:** the header (Menu, Track order, bag) and the phone tab bar link the menu, bag and orders in both directions.

### Menu
- **Header:** sticky, with brand and pickup location. On desktop it shows Menu, Track order and the bag; on phones, brand, a track icon and the bag with a count badge.
- **Hero:** keeps the "Campus hunger? Skip the queue." concept. Type is tightened, the image is responsive (`srcset`, high fetch priority), and there are two calls to action: "See the menu" and "Track an order". On phones it's compact.
- **Discovery:**
  - search matches name, description and category, with an empty state that has a reset;
  - chips have `aria-pressed` and are 40 px tall;
  - browsing "All" shows a heading per category.
- **Cards:**
  - consistent photo ratio, name, two-line description, a prominent price and prep time;
  - a labelled **Add** button (44 px) with an accessible name, and sold-out shown as text;
  - auto-fill columns on wide screens; on phones, horizontal cards (photo left, details right) so more dishes fit on screen.
- **Cart bar:** item count, total and a "Review order" button; it sits above the phone tab bar.
- **Checkout:** pickup slots read "Today, 12:15 pm · 9 left" instead of "11-04 · 12:15 · 6/15".

### Printed receipts
- Two new Settings switches: **Tracking code** (default on) and **Tracking QR code** (default off).
- The QR code encodes the public tracking link and is rendered locally, so nothing is stored.

## 4. Files

| New | |
|---|---|
| `db/migrations/0003_order_tracking_code.sql` | Column, backfill, unique index |
| `lib/tracking.ts` | Alphabet, format/normalise, `toPublicOrder` |
| `server/tracking.ts` | Code generator |
| `lib/qr.ts` | QR → inline SVG (sync; used on screen and receipts) |
| `app/api/track/route.ts` | Public endpoint |
| `components/order-progress.tsx` | `OrderProgress`, `TrackingCodeCard`, `useOrderTracking` |
| `components/track-orders.tsx` | `/orders` page |
| `components/customer-header.tsx` | Customer header |
| `app/customer.css` | Customer styles |
| `tests/tracking.test.ts` | 9 tests |

| Changed | |
|---|---|
| `db/schema/app.ts` | `trackingCode` + index |
| `lib/domain.ts` | `Order.trackingCode`; receipt settings `showTrackingCode`/`showTrackingQr` |
| `server/mappers.ts`, `server/services/orders.ts` | Code on create; `trackOrder` |
| `server/services/workspace.ts` | Kitchen view strips tracking codes, like phone numbers |
| `server/seed.ts` | Demo orders get codes |
| `components/customer.tsx` | Header, hero, search, grouped grid, cards, cart bar, slots, confirmation |
| `components/tracking.tsx` | Receipt page uses the shared components |
| `lib/receipt.ts`, `components/settings.tsx` | Tracking code and QR on receipts |
| `app/orders/page.tsx`, `app/layout.js` | New page; stylesheet |
| `package.json` | `qrcode` 1.5.4 (+ `@types/qrcode`). `npm audit` shows 36 advisories that were already there; none involve `qrcode` or its dependencies |

## 5. Verification

- `tsc`, `eslint` and `next build` pass. `npm test`: **34/34** pass.
- **`tests/tracking.test.ts`** (real migrations on PGlite, calling the real route handler):
  - code randomness and uniformity, and input normalisation;
  - tracking from a "second device" with only a casually typed code, and kitchen updates appearing in the timeline;
  - the same code after an idempotent retry;
  - **no name, phone, ids, reference or token in the response**;
  - cancelled orders handled;
  - unknown, malformed and missing codes all answer identically, and the order number alone never works;
  - **rate limiting: 404 ×10, then 429**;
  - cross-origin requests refused (403);
  - the migration backfill gives unique, valid codes per row.
- **Browser journey** (Playwright + Edge, local dev server, dev-branch data): **40/40 checks pass**.
  1. **Phone (390 px):** search, filters, add to cart, cart bar and badge, checkout total, order placed.
  2. **Confirmation:** number and code shown, "Pay at pickup" wording, the Track link points to the public page, the QR code renders, and copy-link copies the right URL.
  3. **Fresh desktop browser, no history, no login:** the shared link tracks the order, and no name or phone is shown.
  4. **Kitchen moves the order to Accepted, then Preparing:** the desktop updated to "Being prepared" in **4 s without a reload**, and the timeline was correct.
  5. **New tablet session:** a lowercase code with spaces works, the address updates, a malformed code shows an inline error, and an unknown code shows a safe message.
  6. **The phone's `/orders`:** recent order listed, Track from the list works, and the receipt shows the code.
  7. **Layout sweep:** no sideways scrolling at 360, 390, 768, 1280 and 1440 px.
  8. **Cancelled:** shown as cancelled, and checking stopped.
- The only console entry was the browser logging the expected 404 for the deliberately unknown code.
- The test orders created on the dev branch (#1070–#1072) were cancelled.

Screenshots: `docs/customer/screenshots/`.

## 6. Limitations & notes

- **Before deploying:** apply migrations **0002** and **0003** to the target branch (maurice) *before* the code reaches Vercel. Code that expects `tracking_code` fails on an unmigrated database.
- **Live updates use polling.** There's no real-time infrastructure in the app; polling is bounded and pauses when the tab is hidden.
- **Rate limits are per IP.** Students on one campus network (NAT) share limits. 60 lookups and 10 misses a minute per IP is generous for real use, but heavy shared networks could hit it. Tune in `app/api/track/route.ts`.
- **Items and totals are public to code holders.** The tracking view shows item names and the total (no personal data), so students can confirm it's their order. Remove them in `toPublicOrder` if the owner prefers.
- **Desktop browser prompt:** the browser's own leave-page prompt (from Settings) is unchanged.
- **QR scan untested:** QR codes were generated and rendered, but not scanned with a physical phone in this run; check one by hand before relying on printed QR receipts.
- **Not done:** no SMS change. The ready-SMS could include the tracking link later.
