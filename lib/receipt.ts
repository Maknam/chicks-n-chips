// Thermal receipt rendering. One HTML template serves both the Settings preview
// and printing, so what staff preview is exactly what prints.
// Printing uses a hidden iframe: the receipt gets its own page size (58/80 mm) and
// none of the app's styles or chrome.
import { money, type Business, type Order, type ReceiptSettings } from "./domain";
import { formatCode, trackingPath } from "./tracking";
import { qrSvg } from "./qr";

export type ReceiptOrder = Pick<
  Order,
  "number" | "customer" | "phone" | "items" | "total" | "source" | "pickupAt" | "createdAt" | "payment" | "paymentStatus" | "scheduled"
> & { trackingCode?: string };

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const stamp = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Accra", ...opts });
const dateTime = (iso: string) =>
  stamp(iso, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const clock = (iso: string) => stamp(iso, { hour: "2-digit", minute: "2-digit" });

const PAYMENT: Record<string, string> = { CASH: "Cash", MOMO: "Mobile money", ONLINE: "Online (Paystack)" };
/** "0241234567" → "024•••4567": enough to match a customer, not enough to harvest. */
export const maskPhone = (p: string) => (p.length > 6 ? `${p.slice(0, 3)}•••${p.slice(-4)}` : p);

/** `origin` (e.g. https://chicks-n-chips.vercel.app) is needed for the tracking QR code. */
export function receiptHtml(order: ReceiptOrder, business: Business, cfg: ReceiptSettings, origin = "") {
  const row = (left: string, right = "") =>
    `<div class="row"><span>${left}</span>${right ? `<span>${right}</span>` : ""}</div>`;
  const head: string[] = [];
  if (cfg.showBusinessName && business.name) head.push(`<div class="name">${esc(business.name)}</div>`);
  if (cfg.showBranch && business.branch) head.push(`<div>${esc(business.branch)}</div>`);
  if (cfg.showAddress && business.address) head.push(`<div>${esc(business.address)}</div>`);
  if (cfg.showPhone && business.phone) head.push(`<div>Tel: ${esc(business.phone)}</div>`);
  if (cfg.header) head.push(`<div class="note">${esc(cfg.header)}</div>`);

  const meta: string[] = [`<div class="order">ORDER #${order.number}</div>`];
  if (cfg.showOrderTime) meta.push(row("Date", esc(dateTime(order.createdAt))));
  if (cfg.showOrderSource) meta.push(row("Type", order.source === "WALK_IN" ? "Walk-in" : "Online"));
  if (cfg.showCustomerName && order.customer) meta.push(row("Customer", esc(order.customer)));
  if (cfg.showCustomerPhone && order.phone) meta.push(row("Phone", esc(maskPhone(order.phone))));
  if (cfg.showPickupTime) meta.push(row("Pickup", `${order.scheduled ? "" : "ASAP · "}${esc(clock(order.pickupAt))}`));

  const items = order.items
    .map((i) => {
      const extras = [i.variant, ...(cfg.showItemOptions ? i.options.map((o) => `+ ${o.name}`) : [])].filter(Boolean);
      return (
        row(`${i.qty} × ${esc(i.name)}`, money(i.qty * i.price)) +
        (extras.length ? `<div class="sub">${extras.map((e) => esc(String(e))).join("<br>")}</div>` : "")
      );
    })
    .join("");

  const pay: string[] = [];
  if (cfg.showPaymentMethod) pay.push(row("Payment", PAYMENT[order.payment] ?? order.payment));
  if (cfg.showPaymentStatus) pay.push(row("Status", order.paymentStatus === "PAID" ? "PAID" : "NOT PAID"));

  const track: string[] = [];
  if (order.trackingCode && cfg.showTrackingCode)
    track.push(`<div>Track your order</div><div class="code">${formatCode(order.trackingCode)}</div>`);
  if (order.trackingCode && cfg.showTrackingQr && origin)
    track.push(`<div class="qr">${qrSvg(origin + trackingPath(order.trackingCode), { size: cfg.paperWidth === "58" ? 110 : 140, label: "Tracking QR code" })}</div><div>Scan to follow your order live</div>`);

  const width = cfg.paperWidth === "58" ? 58 : 80;
  const base = (cfg.paperWidth === "58" ? 11 : 12.5) * (cfg.textSize === "large" ? 1.18 : 1);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt #${order.number}</title><style>
@page { size: ${width}mm auto; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #fff; color: #000; }
body { width: ${width}mm; padding: 3mm ${width === 58 ? 2 : 4}mm 6mm; font: ${base.toFixed(1)}px/1.35 "Courier New", ui-monospace, monospace; }
.center { text-align: center; }
.name { font-size: 1.45em; font-weight: 700; letter-spacing: .02em; }
.note { margin-top: 4px; font-style: italic; }
.order { font-size: 1.3em; font-weight: 700; text-align: center; margin: 2px 0 4px; }
.row { display: flex; justify-content: space-between; gap: 8px; }
.row span:last-child { text-align: right; white-space: nowrap; }
.sub { padding-left: 1.6em; font-size: .9em; }
.total { font-size: 1.25em; font-weight: 700; }
hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
.code { font-size: 1.2em; font-weight: 700; letter-spacing: .06em; }
.qr { margin: 4px auto 0; width: fit-content; }
.qr svg { display: block; }
</style></head><body>
${head.length ? `<div class="center">${head.join("")}</div><hr>` : ""}
${meta.join("")}
<hr>${items}<hr>
<div class="row total"><span>TOTAL</span><span>${money(order.total)}</span></div>
${pay.length ? `<hr>${pay.join("")}` : ""}
${track.length ? `<hr><div class="center">${track.join("")}</div>` : ""}
${cfg.footer ? `<hr><div class="center">${esc(cfg.footer)}</div>` : ""}
</body></html>`;
}

/** Prints one receipt through the browser's print dialog (choose the thermal printer there). */
export function printReceipt(order: ReceiptOrder, business: Business, cfg: ReceiptSettings) {
  const origin = window.location.origin;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const win = frame.contentWindow!;
  win.document.open();
  win.document.write(receiptHtml(order, business, cfg, origin));
  win.document.close();
  const cleanup = () => setTimeout(() => frame.remove(), 500);
  win.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(() => {
    win.focus();
    win.print();
    // Some browsers never fire afterprint inside iframes.
    setTimeout(cleanup, 60000);
  }, 50);
}

/** A believable order for previews and test prints. */
export const SAMPLE_ORDER: ReceiptOrder = {
  number: 1042,
  customer: "Ama Mensah",
  phone: "0241234567",
  items: [
    { productId: "a", name: "Classic Chips & Chicken", qty: 2, price: 4100, variant: "Large (+ extra side)", options: [{ id: "sauce", name: "Extra house sauce", price: 300 }] },
    { productId: "b", name: "Fresh Sobolo", qty: 1, price: 800, options: [] },
  ],
  total: 9000,
  source: "WALK_IN",
  pickupAt: new Date(Date.now() + 20 * 60000).toISOString(),
  createdAt: new Date().toISOString(),
  payment: "CASH",
  paymentStatus: "PAID",
  scheduled: false,
  trackingCode: "K4M2Q9RX7T",
};
