"use client";
import { useEffect, useState } from "react";
import Inventory from "./inventory";
import StaffPanel from "./staff";
import FoodPhoto from "./food-photo";
import Reports from "./reports";
import SettingsPanel from "./settings";
import { printReceipt } from "@/lib/receipt";
import { Printer, RefreshCw } from "lucide-react";
import AdminShell, { PageHeader, type Connection } from "./layout/admin-shell";
import { Button, ToastProvider } from "./ui";
import { useOperations } from "./operations";
import { request } from "./customer";
import {
  analytics,
  production,
  money,
  time,
  active,
  confirmed,
  type Product,
  type Order,
} from "@/lib/domain";
const PAGES: Record<string, { title: string; description: string }> = {
  overview: { title: "Overview", description: "How the restaurant is doing today." },
  orders: { title: "Orders", description: "Every order across online and walk-in, newest first." },
  menu: { title: "Menu", description: "Products, prices, photos and availability." },
  customers: { title: "Customers", description: "Regulars recognised by phone number." },
  inventory: { title: "Inventory", description: "Stock on hand and what upcoming orders need." },
  reports: { title: "Reports", description: "Sales, menu performance and service, by period." },
  staff: { title: "Staff & access", description: "Invite your team and control what each role can do." },
  settings: { title: "Settings", description: "Business details, operating hours, receipts and your account." },
};
export function Bars({
  values,
}: {
  values: { label: string; value: number }[];
}) {
  const max = Math.max(1, ...values.map((v) => v.value));
  return (
    <div className="bars">
      {values.map((v) => (
        <div className="barRow" key={v.label}>
          <span>{v.label}</span>
          <div className="barTrack">
            <span style={{ width: `${(v.value / max) * 100}%` }} />
          </div>
          <b>{v.value}</b>
        </div>
      ))}
    </div>
  );
}
/** Connection state from real fetch results and the browser's network status. */
function useConnection(updatedAt: number | null, failed: boolean): Connection {
  const [online, setOnline] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    on();
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
      clearInterval(t);
    };
  }, []);
  if (!online) return "offline";
  if (failed) return "error";
  if (!updatedAt) return "updating";
  // Full refresh runs every 30 s; two missed refreshes means the data is stale.
  return now - updatedAt > 75000 ? "stale" : "live";
}

export default function Admin({ area }: { area: string }) {
  return (
    <ToastProvider>
      <AdminPage area={area} />
    </ToastProvider>
  );
}

function AdminPage({ area }: { area: string }) {
  const { data, error, busy, action, load, loading, updatedAt, failed } = useOperations(area);
  const connection = useConnection(updatedAt, failed);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  useEffect(() => {
    request("/api/session")
      .then((d) => setUser(d.user ?? null))
      .catch(() => setUser(null));
  }, []);
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("ALL"),
    [editing, setEditing] = useState<Product | null>(null),
    [notice, setNotice] = useState("");
  const s = data?.state,
    a = s ? analytics(s) : null;
  const patchOrder = (o: Order, input: unknown) =>
    action(`/api/orders/${o.id}`, input, "PATCH");
  const update = async (input: unknown) => {
    const ok = await action("/api/operations", input);
    if (ok) {
      setNotice("Changes saved.");
      setTimeout(() => setNotice(""), 4000);
    }
    return ok;
  };
  /** Settings writes: throws the server's message so forms can show it. */
  const mutate = async (input: Record<string, unknown>) => {
    await request("/api/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    await load();
  };
  async function saveProduct(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (
      await update({
        action: "product",
        id: editing?.id,
        name: f.get("name"),
        description: f.get("description"),
        price: Math.round(Number(f.get("price")) * 100),
        prep: Number(f.get("prep")),
        image: String(f.get("image") ?? ""),
      })
    )
      setEditing(null);
  }
  const metrics = a
    ? [
        ["Paid revenue", money(a.revenue), "Today · GHS"],
        ["Orders", a.count, "All channels"],
        ["Average order value", money(a.aov), "Paid orders"],
        ["Active orders", a.active, "In the kitchen"],
        ["Online / walk-in", `${a.online} / ${a.walkIn}`, "Unified demand"],
        ["Scheduled", a.scheduled, "Order ahead"],
        [
          "Preparing / ready",
          `${a.preparing} / ${a.ready}`,
          "Current workload",
        ],
        ["Late orders", a.late, "Past promised pickup"],
      ]
    : [];
  const page = PAGES[area] ?? { title: area, description: "" };
  // Real count: new orders waiting for someone to accept them.
  const counts = s ? { orders: s.orders.filter((o) => o.status === "NEW").length } : undefined;
  return (
    <AdminShell
      area={area}
      role={data?.role}
      user={user}
      business={s?.business}
      demo={data?.demo}
      connection={connection}
      updatedAt={updatedAt}
      counts={counts}
    >
        {area === "settings" ? (
          s ? (
            <SettingsPanel state={s} save={mutate} reload={load} reloading={loading} page={page} />
          ) : null
        ) : (
          <PageHeader
            title={page.title}
            description={page.description}
            actions={
              <Button variant="secondary" onClick={load} loading={loading} aria-label="Refresh data">
                {!loading && <RefreshCw size={16} aria-hidden />} Refresh
              </Button>
            }
          />
        )}
        {error && area !== "settings" && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        {!s || !a ? (
          <div className="skeleton" />
        ) : (
          <>
            {area === "overview" && (
              <>
                <div className="metricGrid">
                  {metrics.map(([label, value, detail]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <b>{value}</b>
                      <small>{detail}</small>
                    </div>
                  ))}
                </div>
                <div className="twoColumns">
                  <section className="panel">
                    <span className="eyebrow">TODAY’S RHYTHM</span>
                    <h2>Orders by hour</h2>
                    <Bars
                      values={a.hourly.filter(
                        (x) =>
                          Number(x.label.split(":")[0]) >= s.settings.open &&
                          Number(x.label.split(":")[0]) < s.settings.close,
                      )}
                    />
                  </section>
                  <section className="panel">
                    <span className="eyebrow">PREPARE WITH CONFIDENCE</span>
                    <h2>Confirmed upcoming demand</h2>
                    <p>
                      {
                        s.orders.filter(
                          (o) => active(o) && confirmed(o) && o.scheduled,
                        ).length
                      }{" "}
                      active scheduled orders
                    </p>
                    {production(s)
                      .filter((i) => i.required || i.quantity <= i.threshold)
                      .map((i) => (
                        <div className="receiptLine" key={i.id}>
                          <span>
                            {i.name}
                            <small className="quiet">
                              {" "}
                              {i.quantity} in stock · {i.required} needed
                            </small>
                          </span>
                          <b className={i.shortage ? "low" : ""}>
                            {i.shortage ? `Short ${i.shortage}` : "Covered"}
                          </b>
                        </div>
                      ))}
                    <p>
                      <a href="/admin/inventory">Manage stock →</a>
                    </p>
                    <h3>Sold out</h3>
                    <p>
                      {s.products
                        .filter((p) => p.availability === "SOLD_OUT")
                        .map((p) => p.name)
                        .join(", ") || "All products available"}
                    </p>
                  </section>
                </div>
              </>
            )}
            {area === "orders" && (
              <section className="panel">
                <div className="rowActions">
                  <input
                    aria-label="Search orders"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Order number or customer"
                  />
                  <select
                    aria-label="Filter status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    {[
                      "ALL",
                      "NEW",
                      "ACCEPTED",
                      "PREPARING",
                      "READY",
                      "COMPLETED",
                      "CANCELLED",
                      "REJECTED",
                    ].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </div>
                <div className="tableScroll">
                  <table className="dataTable">
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Customer</th>
                        <th>Pickup</th>
                        <th>Status</th>
                        <th>Payment</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.orders
                        .filter(
                          (o) =>
                            (status === "ALL" || o.status === status) &&
                            `${o.number} ${o.customer}`
                              .toLowerCase()
                              .includes(query.toLowerCase()),
                        )
                        .sort(
                          (a, b) =>
                            Date.parse(b.createdAt) - Date.parse(a.createdAt),
                        )
                        .map((o) => (
                          <tr key={o.id}>
                            <td>
                              <b>#{o.number}</b>
                              <small>{o.source}</small>
                            </td>
                            <td>
                              {o.customer}
                              <small>{o.phone}</small>
                              <details>
                                <summary>Items</summary>
                                {o.items.map((i, n) => (
                                  <p key={n}>
                                    {i.qty} × {i.name} {i.variant}{" "}
                                    {i.options.map((x) => x.name).join(", ")}
                                  </p>
                                ))}
                              </details>
                            </td>
                            <td>
                              {time(o.pickupAt)}
                              <small>{o.pickupAt.slice(0, 10)}</small>
                            </td>
                            <td>
                              <span
                                className={`status ${o.status.toLowerCase()}`}
                              >
                                {o.status}
                              </span>
                            </td>
                            <td>
                              {money(o.total)}
                              <small>{o.paymentStatus}</small>
                            </td>
                            <td>
                              <div className="rowActions">
                                {o.paymentStatus !== "PAID" &&
                                  o.payment !== "ONLINE" && (
                                    <button
                                      disabled={busy}
                                      onClick={() =>
                                        patchOrder(o, { action: "pay" })
                                      }
                                    >
                                      Confirm payment
                                    </button>
                                  )}
                                {["NEW", "ACCEPTED", "PREPARING"].includes(
                                  o.status,
                                ) && (
                                  <button
                                    disabled={busy}
                                    onClick={() =>
                                      patchOrder(o, { status: "CANCELLED" })
                                    }
                                  >
                                    Cancel
                                  </button>
                                )}
                                {o.status === "NEW" && (
                                  <button
                                    disabled={busy}
                                    onClick={() =>
                                      patchOrder(o, { status: "REJECTED" })
                                    }
                                  >
                                    Reject
                                  </button>
                                )}
                                <button
                                  onClick={() =>
                                    printReceipt(o, s.business, s.receipt)
                                  }
                                >
                                  <Printer size={14} aria-hidden /> Receipt
                                </button>
                                <button
                                  disabled={busy || o.errorReported}
                                  onClick={() =>
                                    patchOrder(o, { action: "error" })
                                  }
                                >
                                  {o.errorReported
                                    ? "Error recorded"
                                    : "Record order error"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            {area === "menu" && (
              <div className="grid">
                {s.products.map((p) => (
                  <article className="food" key={p.id}>
                    <div className="foodImg">
                      <FoodPhoto src={p.image} alt={p.name} />
                      <span>{p.prep} min</span>
                    </div>
                    <div className="foodBody">
                      <h3>{p.name}</h3>
                      <p>{p.description}</p>
                      <b>{money(p.price)}</b>
                      <label className="formGrid">
                        Availability
                        <select
                          value={p.availability}
                          disabled={busy}
                          onChange={(e) =>
                            update({
                              action: "availability",
                              id: p.id,
                              availability: e.target.value,
                            })
                          }
                        >
                          {["AVAILABLE", "LOW_STOCK", "SOLD_OUT"].map((x) => (
                            <option key={x}>{x}</option>
                          ))}
                        </select>
                      </label>
                      {data.role !== "KITCHEN" && (
                        <button
                          className="ghost wide"
                          onClick={() => setEditing(p)}
                        >
                          Edit product
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
            {area === "customers" && (
              <section className="panel">
                <p className="muted">
                  Automatically recognized by phone. Customer data stays in this
                  staff workspace.
                </p>
                <div className="tableScroll">
                  <table className="dataTable">
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Orders</th>
                        <th>Total paid</th>
                        <th>Favourite</th>
                        <th>Last order</th>
                        <th>Loyalty points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.customers.map((c) => {
                        const orders = s.orders.filter(
                          (o) => o.customerId === c.id,
                        );
                        const paid = orders.filter(
                          (o) =>
                            o.paymentStatus === "PAID" &&
                            !["CANCELLED", "REJECTED"].includes(o.status),
                        );
                        const tally: Record<string, number> = {};
                        paid.forEach((o) =>
                          o.items.forEach(
                            (i) =>
                              (tally[i.name] = (tally[i.name] || 0) + i.qty),
                          ),
                        );
                        return (
                          <tr key={c.id}>
                            <td>
                              {c.name}
                              <small>{c.phone}</small>
                            </td>
                            <td>{orders.length}</td>
                            <td>
                              {money(paid.reduce((n, o) => n + o.total, 0))}
                            </td>
                            <td>
                              {Object.entries(tally).sort(
                                (a, b) => b[1] - a[1],
                              )[0]?.[0] ?? "—"}
                            </td>
                            <td>
                              {orders
                                .map((o) => o.createdAt)
                                .sort()
                                .at(-1)
                                ?.slice(0, 10) ?? "—"}
                            </td>
                            <td>
                              {
                                orders.filter((o) => o.status === "COMPLETED")
                                  .length
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            {area === "reports" && <Reports state={s} />}
            {area === "staff" && (
              <section className="panel">
                <h2>Staff access</h2>
                <p>
                  Owner: all areas. Manager: orders, menu, reports and
                  inventory. Cashier: POS and orders. Kitchen: preparation and
                  availability.
                </p>
                <StaffPanel members={data.members} reload={load} />
                <h3>Recent audit events</h3>
                {s.audits
                  .slice(-15)
                  .reverse()
                  .map((a) => (
                    <p className="quiet" key={a.id}>
                      {a.createdAt.slice(0, 16)} · {a.action} · {a.actor}
                    </p>
                  ))}
              </section>
            )}
            {area === "inventory" && (
              <Inventory state={s} busy={busy} update={update} />
            )}
          </>
        )}
        {editing && (
          <div className="overlay">
            <div className="sheet">
              <button
                className="close"
                aria-label="Close product editor"
                onClick={() => setEditing(null)}
              >
                ×
              </button>
              <h2>Edit product</h2>
              <form className="formGrid" onSubmit={saveProduct}>
                <label>
                  Name
                  <input name="name" defaultValue={editing.name} required />
                </label>
                <label>
                  Description
                  <input
                    name="description"
                    defaultValue={editing.description}
                    required
                  />
                </label>
                <label>
                  Price in GHS
                  <input
                    name="price"
                    type="number"
                    step="0.01"
                    min="1"
                    defaultValue={editing.price / 100}
                    required
                  />
                </label>
                <label>
                  Preparation minutes
                  <input
                    name="prep"
                    type="number"
                    min="1"
                    max="120"
                    defaultValue={editing.prep}
                    required
                  />
                </label>
                <label>
                  Photo link
                  <input
                    name="image"
                    type="url"
                    inputMode="url"
                    placeholder="https://… (leave empty for a placeholder)"
                    defaultValue={editing.image}
                  />
                  <small className="quiet">
                    Use your own photos for the best results — upload them to
                    any image host and paste the https link here.
                  </small>
                </label>
                <button className="primary" disabled={busy}>
                  Save product
                </button>
              </form>
            </div>
          </div>
        )}
    </AdminShell>
  );
}
