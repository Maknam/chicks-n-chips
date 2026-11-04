"use client";
// Shared order-tracking pieces for the customer side:
// - OrderProgress: status, headline, pickup and timeline (used by /orders and the receipt page)
// - TrackingCodeCard: the code with copy/share/QR (used by confirmation, receipt and /orders)
// - useOrderTracking: polls the public endpoint with visibility awareness and bounded retries
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, QrCode, Share2 } from "lucide-react";
import { money, pickupLabel, time } from "@/lib/domain";
import { formatCode, trackingPath, type PublicOrder } from "@/lib/tracking";
import { qrSvg } from "@/lib/qr";

const HEADLINE: Record<string, string> = {
  NEW: "We’ve got your order.",
  ACCEPTED: "The kitchen has accepted it.",
  PREPARING: "Your food is on the grill.",
  READY: "Fresh, hot, ready for you.",
  COMPLETED: "Enjoy your meal!",
  CANCELLED: "This order was cancelled.",
  REJECTED: "We couldn’t take this order.",
};

export function OrderProgress({ order, compact = false }: { order: PublicOrder; compact?: boolean }) {
  const headline = order.awaitingPayment ? "Waiting for your payment." : HEADLINE[order.status];
  return (
    <div className="orderProgress" aria-live="polite">
      <div className="orderProgressHead">
        <span className={`status ${order.awaitingPayment ? "new" : order.status.toLowerCase()}`}>
          {order.awaitingPayment ? "Payment pending" : order.statusLabel}
        </span>
        <span className="orderNo">Order #{order.number}</span>
      </div>
      <h2 className="trackHeadline">{headline}</h2>
      {!order.cancelled && (
        <p className="pickupWhen">
          {order.status === "COMPLETED" ? "Collected" : "Pickup"} <b>{pickupLabel(order.pickupAt)}</b> · Pent Hall
        </p>
      )}
      {order.awaitingPayment && (
        <p className="progressNote">
          Online orders go to the kitchen once Paystack confirms your payment. Open your receipt on the phone you ordered with to pay.
        </p>
      )}
      {order.cancelled ? (
        <p className="progressNote">
          {order.status === "REJECTED" ? "The restaurant declined this order." : "This order was cancelled."} If you paid, speak to the cashier at Pent Hall.
        </p>
      ) : (
        <ol className="timeline">
          {order.timeline.map((s) => (
            <li key={s.status} className={s.state}>
              <span className="timelineDot" aria-hidden>
                {s.state === "done" ? <Check size={14} strokeWidth={3} /> : null}
              </span>
              <span className="timelineText">
                <b>{s.label}</b>
                {s.at && <small>{time(s.at)}</small>}
                {s.state === "current" && <span className="srOnly"> (current step)</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
      {!compact && (
        <details className="orderItems">
          <summary>
            {order.items.reduce((n, i) => n + i.qty, 0)} item{order.items.reduce((n, i) => n + i.qty, 0) === 1 ? "" : "s"} · {money(order.total)}
          </summary>
          <ul>
            {order.items.map((i, n) => (
              <li key={n}>
                {i.qty} × {i.name}
                {(i.variant || i.options.length > 0) && <small> {[i.variant, ...i.options].filter(Boolean).join(", ")}</small>}
              </li>
            ))}
          </ul>
          <p className="quiet">
            {order.payment === "ONLINE" ? "Online payment" : order.payment === "MOMO" ? "Mobile money" : "Cash at pickup"} ·{" "}
            {order.paymentStatus === "PAID" ? "Paid" : "Not paid yet"}
          </p>
        </details>
      )}
    </div>
  );
}

export function TrackingCodeCard({ code, number }: { code: string; number?: number }) {
  const [copied, setCopied] = useState<"" | "code" | "link">("");
  const [showQr, setShowQr] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const link = origin ? origin + trackingPath(code) : "";
  const svg = useMemo(() => (showQr && link ? qrSvg(link, { size: 176, label: `QR code to track order ${number ?? ""}` }) : ""), [showQr, link, number]);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  async function copy(what: "code" | "link") {
    try {
      await navigator.clipboard.writeText(what === "code" ? formatCode(code) : link);
      setCopied(what);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      /* clipboard blocked: the code stays visible to copy by hand */
    }
  }

  return (
    <div className="codeCard">
      <span className="codeLabel">Tracking code</span>
      <div className="codeRow">
        <code className="trackingCode">{formatCode(code)}</code>
        <button type="button" className="codeCopy" onClick={() => copy("code")} aria-label="Copy tracking code">
          {copied === "code" ? <Check size={18} /> : <Copy size={18} />}
        </button>
      </div>
      <p className="codeHelp">Use it to check this order on any phone or laptop. Anyone with the code can see the order’s status, so share it only with people you trust.</p>
      <div className="codeActions">
        <button type="button" className="ghost" onClick={() => copy("link")} disabled={!link}>
          {copied === "link" ? <Check size={16} /> : <Copy size={16} />} {copied === "link" ? "Link copied" : "Copy tracking link"}
        </button>
        {canShare && (
          <button type="button" className="ghost" onClick={() => navigator.share({ title: `Chics & Chips order #${number ?? ""}`, url: link }).catch(() => {})}>
            <Share2 size={16} /> Share
          </button>
        )}
        <button type="button" className="ghost" aria-expanded={showQr} onClick={() => setShowQr((v) => !v)}>
          <QrCode size={16} /> {showQr ? "Hide QR code" : "Show QR code"}
        </button>
      </div>
      {showQr && svg && (
        <figure className="codeQr">
          <span dangerouslySetInnerHTML={{ __html: svg }} />
          <figcaption>Scan with another phone to open live tracking.</figcaption>
        </figure>
      )}
    </div>
  );
}

type TrackState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "found"; order: PublicOrder; updatedAt: number; paused?: boolean }
  | { phase: "notfound"; message: string }
  | { phase: "error"; message: string };

/**
 * Looks up `code` and keeps it fresh: every 5 s while the tab is visible and the order is open,
 * immediately when the tab becomes visible again, never after it closes. Network failures back
 * off (5 s → 40 s) and pause after 5 in a row until the user retries.
 */
export function useOrderTracking(code: string | null) {
  const [state, setState] = useState<TrackState>({ phase: "idle" });
  const failures = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closed = useRef(false);
  const [nonce, setNonce] = useState(0);

  const fetchOnce = useCallback(async (c: string) => {
    const r = await fetch("/api/track", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: c }),
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  }, []);

  useEffect(() => {
    if (!code) {
      setState({ phase: "idle" });
      return;
    }
    let live = true;
    failures.current = 0;
    closed.current = false;
    setState({ phase: "loading" });

    const schedule = (ms: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(tick, ms);
    };
    async function tick() {
      if (!live || closed.current) return;
      if (document.hidden) return; // resumes on visibilitychange
      try {
        const r = await fetchOnce(code!);
        if (!live) return;
        if (r.ok) {
          failures.current = 0;
          closed.current = r.data.order.closed;
          setState({ phase: "found", order: r.data.order, updatedAt: Date.now() });
          if (!closed.current) schedule(5000);
        } else if (r.status === 404) {
          setState({ phase: "notfound", message: r.data.error ?? "No order matches that code." });
        } else {
          throw new Error(r.data.error ?? "Tracking is unavailable right now.");
        }
      } catch (e) {
        if (!live) return;
        failures.current++;
        const message = (e as Error).message || "Connection problem.";
        setState((s) =>
          s.phase === "found"
            ? { ...s, paused: failures.current >= 5 }
            : { phase: "error", message: failures.current >= 5 ? message : `${message} Retrying…` },
        );
        if (failures.current < 5) schedule(Math.min(40000, 5000 * 2 ** (failures.current - 1)));
      }
    }
    const onVisible = () => {
      if (!document.hidden && !closed.current) schedule(0);
    };
    document.addEventListener("visibilitychange", onVisible);
    tick();
    return () => {
      live = false;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [code, nonce, fetchOnce]);

  return { state, retry: () => setNonce((n) => n + 1) };
}
