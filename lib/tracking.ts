// Public order tracking: code format, input normalisation and the customer-safe view.
// Safe on the client. Codes are generated server-side (server/tracking.ts).
//
// A tracking code is a bearer secret: whoever has it can see the order's status — nothing
// more. It never authorises payment, cancellation, changes or collection.
import { STATUS_LABEL, VOIDED, type Order, type Status } from "./domain";

/** 31 symbols: digits and capitals without the look-alikes 0/O, 1/I/L. */
export const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LENGTH = 10; // 31^10 ≈ 8.2 × 10^14 (≈ 49.5 bits)

/** "K4M2Q9RX7T" → "CC-K4M2Q-9RX7T" */
export const formatCode = (code: string) => `CC-${code.slice(0, 5)}-${code.slice(5)}`;

/**
 * Accepts what people actually type or paste: any case, spaces, dashes, a "CC" prefix,
 * or a whole tracking link. Returns the 10-character canonical code, or null.
 */
export function normalizeCode(input: string): string | null {
  let s = String(input ?? "").trim();
  const hash = s.lastIndexOf("#");
  if (hash >= 0) s = s.slice(hash + 1); // pasted link: …/orders#CC-XXXXX-XXXXX
  s = s.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (s.startsWith("CC") && s.length === CODE_LENGTH + 2) s = s.slice(2);
  if (s.length !== CODE_LENGTH) return null;
  for (const ch of s) if (!ALPHABET.includes(ch)) return null;
  return s;
}

/** Path of the public tracking page. The code sits in the fragment, so it never reaches server logs. */
export const trackingPath = (code: string) => `/orders#${formatCode(code)}`;

// ---------- Customer-safe view ----------

export const PROGRESS: Status[] = ["NEW", "ACCEPTED", "PREPARING", "READY", "COMPLETED"];
const STAMP: Partial<Record<Status, keyof Order>> = {
  NEW: "createdAt",
  ACCEPTED: "acceptedAt",
  PREPARING: "preparingAt",
  READY: "readyAt",
  COMPLETED: "completedAt",
};

export type TimelineStep = { status: Status; label: string; at: string | null; state: "done" | "current" | "upcoming" };

export type PublicOrder = {
  number: number;
  code: string;
  status: Status;
  statusLabel: string;
  closed: boolean;
  cancelled: boolean;
  createdAt: string;
  updatedAt: string;
  pickupAt: string;
  scheduled: boolean;
  source: "ONLINE" | "WALK_IN";
  payment: Order["payment"];
  paymentStatus: Order["paymentStatus"];
  /** Online orders reach the kitchen only after the provider verifies payment. */
  awaitingPayment: boolean;
  total: number;
  items: { name: string; qty: number; variant?: string; options: string[] }[];
  timeline: TimelineStep[];
};

/**
 * The only order data the public tracking endpoint returns.
 * Excludes: customer name and phone, internal ids, request id, payment reference, receipt token, staff notes.
 */
export function toPublicOrder(o: Order & { trackingCode: string }): PublicOrder {
  const cancelled = VOIDED.includes(o.status);
  const reached = PROGRESS.indexOf(o.status);
  const timeline: TimelineStep[] = PROGRESS.map((status, i) => {
    const key = STAMP[status];
    return {
      status,
      label: STATUS_LABEL[status],
      at: key ? ((o[key] as string | undefined) ?? null) : null,
      state: cancelled ? (i === 0 ? "done" : "upcoming") : i < reached ? "done" : i === reached ? "current" : "upcoming",
    };
  });
  return {
    number: o.number,
    code: o.trackingCode,
    status: o.status,
    statusLabel: STATUS_LABEL[o.status],
    closed: o.status === "COMPLETED" || cancelled,
    cancelled,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    pickupAt: o.pickupAt,
    scheduled: o.scheduled,
    source: o.source,
    payment: o.payment,
    paymentStatus: o.paymentStatus,
    awaitingPayment: o.payment === "ONLINE" && o.paymentStatus !== "PAID" && !cancelled,
    total: o.total,
    items: o.items.map((i) => ({ name: i.name, qty: i.qty, variant: i.variant, options: i.options.map((x) => x.name) })),
    timeline,
  };
}
