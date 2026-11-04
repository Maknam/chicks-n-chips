"use client";
// /orders — track any order by code (any device, no login), plus orders saved in this browser.
// Deep link: /orders#CC-XXXXX-XXXXX (the code stays in the fragment, never sent to the server in a URL).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, RefreshCw, Search } from "lucide-react";
import { money, pickupLabel, STATUS_LABEL, type Order } from "@/lib/domain";
import { formatCode, normalizeCode } from "@/lib/tracking";
import BottomNav from "./bottom-nav";
import CustomerHeader from "./customer-header";
import { request } from "./customer";
import { OrderProgress, TrackingCodeCard, useOrderTracking } from "./order-progress";
import { reorder } from "./tracking";

const codeFromHash = () => (typeof window === "undefined" ? null : normalizeCode(window.location.hash.slice(1)));

export default function TrackOrders() {
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const { state, retry } = useOrderTracking(code);
  const resultRef = useRef<HTMLDivElement>(null);

  // Open a shared link or QR code: /orders#CC-…
  useEffect(() => {
    const sync = () => {
      const c = codeFromHash();
      if (c) {
        setCode(c);
        setInput(formatCode(c));
      }
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  function track(raw: string) {
    const c = normalizeCode(raw);
    if (!c) {
      setInputError("That doesn’t look like a tracking code. It looks like CC-K4M2Q-9RX7T — 10 letters and numbers after CC.");
      return;
    }
    setInputError("");
    setInput(formatCode(c));
    window.history.replaceState(null, "", `#${formatCode(c)}`);
    if (c === code) retry();
    else setCode(c);
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  return (
    <main className="custPage">
      <CustomerHeader />
      <div className="custContainer narrow">
        <a href="/menu" className="backLink">
          ← Back to menu
        </a>
        <h1 className="custTitle">Track your order</h1>
        <p className="custLead">Enter the tracking code from your confirmation. It works on any phone or laptop — no account needed.</p>

        <section className="custCard" aria-labelledby="track-heading">
          <h2 id="track-heading" className="custCardTitle">
            Track an order
          </h2>
          <form
            className="trackForm"
            onSubmit={(e) => {
              e.preventDefault();
              track(input);
            }}
            noValidate
          >
            <label htmlFor="tracking-code" className="custLabel">
              Tracking code
            </label>
            <div className="trackRow">
              <input
                id="tracking-code"
                className="custInput codeInput"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  if (inputError) setInputError("");
                }}
                placeholder="CC-XXXXX-XXXXX"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                inputMode="text"
                maxLength={120}
                aria-invalid={!!inputError || undefined}
                aria-describedby={inputError ? "code-error" : "code-help"}
              />
              <button className="primary" disabled={state.phase === "loading"}>
                {state.phase === "loading" ? (
                  <>
                    <span className="ui-spinner" aria-hidden /> Checking…
                  </>
                ) : (
                  <>
                    <Search size={18} aria-hidden /> Track order
                  </>
                )}
              </button>
            </div>
            {inputError ? (
              <p id="code-error" className="fieldError" role="alert">
                {inputError}
              </p>
            ) : (
              <p id="code-help" className="fieldHelp">
                Letters and numbers only; dashes and spaces are optional. You can also paste the whole tracking link.
              </p>
            )}
          </form>

          <div ref={resultRef} className="trackResult">
            {state.phase === "loading" && (
              <p className="trackStatusLine" role="status">
                Looking up your order…
              </p>
            )}
            {state.phase === "notfound" && (
              <p className="trackMessage" role="alert">
                {state.message}
              </p>
            )}
            {state.phase === "error" && (
              <div className="trackMessage" role="alert">
                {state.message}
                <button type="button" className="ghost" onClick={retry}>
                  <RefreshCw size={16} aria-hidden /> Try again
                </button>
              </div>
            )}
            {state.phase === "found" && (
              <>
                <OrderProgress order={state.order} />
                <p className="trackStatusLine">
                  {state.paused ? (
                    <>
                      Live updates paused — connection problem.{" "}
                      <button type="button" className="linkBtn" onClick={retry}>
                        Retry
                      </button>
                    </>
                  ) : state.order.closed ? (
                    "This order is closed."
                  ) : (
                    `Updates automatically · last checked ${new Date(state.updatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Africa/Accra" })}`
                  )}
                </p>
                <TrackingCodeCard code={state.order.code} number={state.order.number} />
              </>
            )}
          </div>
        </section>

        <RecentOrders onTrack={track} />
      </div>
      <BottomNav />
    </main>
  );
}

type Saved = { number: number; token: string };

function RecentOrders({ onTrack }: { onTrack: (code: string) => void }) {
  const router = useRouter();
  const [orders, setOrders] = useState<(Order & { token: string })[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let saved: Saved[] = [];
    try {
      saved = JSON.parse(localStorage.getItem("cc-receipts") || "[]");
    } catch {
      saved = [];
    }
    if (!saved.length) {
      setOrders([]);
      return;
    }
    Promise.allSettled(saved.slice(0, 20).map((r) => request(`/api/orders/${r.number}`, { headers: { "x-order-token": r.token } }))).then((results) => {
      setOrders(results.flatMap((r, i) => (r.status === "fulfilled" ? [{ ...r.value.order, token: saved[i].token }] : [])));
      if (results.some((r) => r.status === "rejected")) setError("Some saved orders couldn’t be loaded. Try again when you’re connected.");
    });
  }, []);

  return (
    <section className="recentOrders" aria-labelledby="recent-heading">
      <div className="recentHead">
        <h2 id="recent-heading" className="custCardTitle">
          Recent orders on this device
        </h2>
        <p className="fieldHelp">Saved in this browser only, for convenience. Your tracking code works everywhere.</p>
      </div>
      {error && <p className="trackMessage">{error}</p>}
      {orders === null ? (
        <p className="trackStatusLine">Loading saved orders…</p>
      ) : orders.length === 0 ? (
        <div className="emptyCard">
          <p>No orders saved in this browser yet.</p>
          <a className="primary" href="/menu">
            Explore the menu <ArrowRight size={16} aria-hidden />
          </a>
        </div>
      ) : (
        <ul className="recentList">
          {orders.map((o) => (
            <li key={o.id} className="recentItem">
              <div className="recentMain">
                <span className={`status ${o.status.toLowerCase()}`}>{STATUS_LABEL[o.status]}</span>
                <b>
                  #{o.number} · {money(o.total)}
                </b>
                <small>
                  {o.items.map((i) => `${i.qty} × ${i.name}`).join(", ")} · Pickup {pickupLabel(o.pickupAt)}
                </small>
              </div>
              <div className="recentActions">
                {o.trackingCode && (
                  <button type="button" className="primary small" onClick={() => onTrack(o.trackingCode)}>
                    Track
                  </button>
                )}
                <a className="ghost small" href={`/order/${o.number}#${o.token}`}>
                  Receipt
                </a>
                <button
                  type="button"
                  className="ghost small"
                  onClick={() => {
                    reorder(o);
                    router.push("/cart");
                  }}
                >
                  Order again
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
