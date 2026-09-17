"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { money, time, type Order } from "@/lib/domain";
import { request, type CartLine } from "./customer";
export function reorder(order: Order) {
  const cart: CartLine[] = order.items.map((i, n) => ({
    key: `${i.productId}-${n}`,
    productId: i.productId,
    qty: i.qty,
    variant: i.variantId,
    options: i.options.map((o) => o.id),
  }));
  localStorage.setItem("cc-cart", JSON.stringify(cart));
}
export default function Tracking({ number }: { number: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null),
    [error, setError] = useState(""),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const receipts = JSON.parse(
      localStorage.getItem("cc-receipts") || "[]",
    ) as { number: number; token: string }[];
    setToken(
      window.location.hash.slice(1) ||
        receipts.find((r) => String(r.number) === number)?.token ||
        "",
    );
  }, [number]);
  useEffect(() => {
    if (!token) return;
    let live = true;
    const load = () =>
      request(`/api/orders/${number}`, { headers: { "x-order-token": token } })
        .then((d) => {
          if (live) {
            setOrder(d.order);
            setError("");
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    load();
    const timer = setInterval(load, 4000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [number, token]);
  async function arrive() {
    try {
      await request(`/api/orders/${number}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-order-token": token },
        body: JSON.stringify({ action: "arrive" }),
      });
      setOrder((o) =>
        o ? { ...o, arrivedAt: new Date().toISOString() } : null,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function pay(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const { url } = await request("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-order-token": token },
        body: JSON.stringify({
          number,
          email: new FormData(e.currentTarget).get("email"),
        }),
      });
      window.location.href = url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  const steps = ["NEW", "ACCEPTED", "PREPARING", "READY", "COMPLETED"];
  return (
    <main className="tracking">
      <a href="/menu">← Back to menu</a>
      <p className="eyebrow">YOUR PENT HALL PICKUP</p>
      <h1>Order #{number}</h1>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!order ? (
        <p>
          {token
            ? "Finding your order…"
            : "Open your private confirmation link, or find the receipt in My orders on the device you used to order."}
        </p>
      ) : (
        <>
          <div aria-live="polite">
            <h2>
              {order.status === "READY"
                ? "Fresh, hot, ready for you."
                : order.status === "COMPLETED"
                  ? "Enjoy your meal!"
                  : order.status.replace("_", " ")}
            </h2>
            <p>
              Pickup: <b>{time(order.pickupAt)}</b> ·{" "}
              {order.pickupAt.slice(0, 10)}
            </p>
            {!["CANCELLED", "REJECTED"].includes(order.status) && (
              <ol className="steps">
                {steps.map((s, i) => (
                  <li
                    key={s}
                    className={
                      i < steps.indexOf(order.status)
                        ? "done"
                        : s === order.status
                          ? "current"
                          : ""
                    }
                  >
                    {i < steps.indexOf(order.status) ? "✓" : i + 1}{" "}
                    {
                      [
                        "Received",
                        "Accepted",
                        "Preparing",
                        "Ready for pickup",
                        "Collected",
                      ][i]
                    }
                  </li>
                ))}
              </ol>
            )}
          </div>
          {order.payment === "ONLINE" && order.paymentStatus !== "PAID" && (
            <form className="formGrid panel" onSubmit={pay}>
              <h2>Complete your payment</h2>
              <p>
                Your kitchen ticket activates after Paystack verifies payment.
              </p>
              <label>
                Email for your payment receipt
                <input type="email" name="email" required />
              </label>
              <button className="primary" disabled={busy}>
                Pay {money(order.total)}
              </button>
            </form>
          )}
          <div className="receipt">
            <h2>Chics & Chips · #{order.number}</h2>
            <p>
              {order.customer} ·{" "}
              {order.source === "WALK_IN" ? "Walk-in" : "Online"} order
            </p>
            {order.items.map((i, n) => (
              <div className="receiptLine" key={n}>
                <span>
                  {i.qty} × {i.name}
                  <small className="quiet">
                    {" "}
                    {i.variant} {i.options.map((o) => o.name).join(", ")}
                  </small>
                </span>
                <b>{money(i.price * i.qty)}</b>
              </div>
            ))}
            <div className="receiptLine">
              <b>Total</b>
              <b>{money(order.total)}</b>
            </div>
            <p>
              {order.payment} · {order.paymentStatus}
            </p>
          </div>
          <div className="rowActions" style={{ marginTop: 20 }}>
            {!["COMPLETED", "CANCELLED", "REJECTED"].includes(order.status) && (
              <button disabled={!!order.arrivedAt} onClick={arrive}>
                {order.arrivedAt ? "Arrival recorded" : "I’m at Pent Hall"}
              </button>
            )}
            <button onClick={() => window.print()}>Print receipt</button>
            <button
              onClick={() => {
                reorder(order);
                router.push("/cart");
              }}
            >
              Order again
            </button>
          </div>
          <p className="quiet">
            Keep this receipt link private. Pickup is at Chics & Chips, Pent
            Hall.
          </p>
        </>
      )}
    </main>
  );
}
export function History({ profile = false }: { profile?: boolean }) {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const receipts = JSON.parse(
      localStorage.getItem("cc-receipts") || "[]",
    ) as { number: number; token: string }[];
    Promise.allSettled(
      receipts.map((r) =>
        request(`/api/orders/${r.number}`, {
          headers: { "x-order-token": r.token },
        }),
      ),
    ).then((results) => {
      setOrders(
        results.flatMap((r) =>
          r.status === "fulfilled" ? [r.value.order] : [],
        ),
      );
      if (results.some((r) => r.status === "rejected"))
        setError(
          "Some receipts could not be loaded. Try again when connected.",
        );
      setLoaded(true);
    });
  }, []);
  return (
    <main className="tracking">
      <a href="/menu">← Menu</a>
      <h1>{profile ? "Your campus favourites." : "Your orders."}</h1>
      <p className="muted">
        Private receipts saved on this device. No account needed.
      </p>
      {error && <p className="error">{error}</p>}
      {profile && (
        <section className="panel">
          <h2>{orders[0]?.customer ?? "Hello, food lover."}</h2>
          <p>
            {orders.length} saved orders ·{" "}
            {Math.floor(
              orders.filter((o) => o.status === "COMPLETED").length / 10,
            )}{" "}
            ten-order milestones
          </p>
          <p className="quiet">
            Rewards are not redeemable yet. Your order history is ready for a
            future loyalty programme.
          </p>
        </section>
      )}
      {!loaded ? (
        <p>Loading receipts…</p>
      ) : orders.length === 0 ? (
        <p className="empty">
          Your first good meal is waiting. <a href="/menu">Explore the menu</a>.
        </p>
      ) : (
        orders.map((o) => (
          <article className="panel" key={o.id}>
            <span className="badge">{o.status}</span>
            <h2>
              #{o.number} · {money(o.total)}
            </h2>
            <p>{o.items.map((i) => `${i.qty} × ${i.name}`).join(", ")}</p>
            <div className="rowActions">
              <a className="primary" href={`/order/${o.number}#${o.token}`}>
                View receipt
              </a>
              <button
                onClick={() => {
                  reorder(o);
                  router.push("/cart");
                }}
              >
                Order again
              </button>
            </div>
          </article>
        ))
      )}
    </main>
  );
}
