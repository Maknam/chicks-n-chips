"use client";
import { useState } from "react";
import Customer from "./customer";
import { useOperations } from "./operations";
import { money, time } from "@/lib/domain";
export default function POS() {
  const [tab, setTab] = useState("order");
  const { data, error, busy, action } = useOperations("pos");
  return (
    <>
      <div className="top">
        <b>Cashier workspace</b>
        <div className="rowActions">
          <button onClick={() => setTab("order")}>New walk-in</button>
          <button onClick={() => setTab("payments")}>Payments & pickup</button>
          <a className="ghost" href="/kitchen">
            Kitchen
          </a>
        </div>
      </div>
      {tab === "order" ? (
        <Customer pos />
      ) : (
        <main className="dash">
          <h1>Payments & pickup</h1>
          <p className="muted">
            Check the cash received or the merchant MoMo receipt before
            confirming payment.
          </p>
          {error && <p className="error">{error}</p>}
          <div className="grid">
            {data?.state.orders
              .filter(
                (o) =>
                  !["COMPLETED", "CANCELLED", "REJECTED"].includes(o.status),
              )
              .map((o) => (
                <article className="panel" key={o.id}>
                  <span className="badge">{o.status}</span>
                  <h2>
                    #{o.number} · {o.customer}
                  </h2>
                  <p>
                    {time(o.pickupAt)} · {o.source}
                  </p>
                  {o.items.map((i, n) => (
                    <p key={n}>
                      {i.qty} × {i.name}
                    </p>
                  ))}
                  <h3>{money(o.total)}</h3>
                  <p>
                    {o.payment} · {o.paymentStatus}
                  </p>
                  <div className="rowActions">
                    {o.paymentStatus !== "PAID" && o.payment !== "ONLINE" && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          action(
                            `/api/orders/${o.id}`,
                            { action: "pay" },
                            "PATCH",
                          )
                        }
                      >
                        Confirm{" "}
                        {o.payment === "MOMO"
                          ? "verified MoMo receipt"
                          : "cash received"}
                      </button>
                    )}
                    {o.status === "READY" && (
                      <button
                        disabled={busy || o.paymentStatus !== "PAID"}
                        onClick={() =>
                          action(
                            `/api/orders/${o.id}`,
                            { status: "COMPLETED" },
                            "PATCH",
                          )
                        }
                      >
                        Hand over
                      </button>
                    )}
                    <button onClick={() => window.print()}>Print</button>
                  </div>
                </article>
              ))}
          </div>
        </main>
      )}
    </>
  );
}
