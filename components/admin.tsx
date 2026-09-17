"use client";
import { useState } from "react";
import Inventory from "./inventory";
import { useRouter } from "next/navigation";
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
const areas = [
  "overview",
  "orders",
  "menu",
  "customers",
  "inventory",
  "reports",
  "staff",
  "settings",
];
const title: Record<string, string> = {
  overview: "Your eatery, at a glance.",
  orders: "Every order. One place.",
  menu: "Keep the menu fresh.",
  customers: "Know your regulars.",
  inventory: "Enough for the next rush.",
  reports: "What’s working?",
  staff: "Your team.",
  settings: "Make room for the rush.",
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
export default function Admin({ area }: { area: string }) {
  const router = useRouter();
  const { data, error, busy, action, load } = useOperations(area);
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
    if (ok) setNotice("Changes saved.");
    return ok;
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
      })
    )
      setEditing(null);
  }
  const visibleAreas =
    data?.role === "KITCHEN"
      ? ["menu"]
      : data?.role === "CASHIER"
        ? ["orders"]
        : areas.filter(
            (x) => data?.role === "OWNER" || !["staff", "settings"].includes(x),
          );
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
  return (
    <div className="staffShell">
      <aside className="sidebar">
        <a href="/admin" className="brandLink">
          <span className="brandMark">C&C</span>
          <h3>Chics & Chips</h3>
          <small>Pent Hall workspace</small>
        </a>
        <nav>
          {visibleAreas.map((x) => (
            <a
              key={x}
              className={area === x ? "active" : ""}
              href={x === "overview" ? "/admin" : `/admin/${x}`}
            >
              {x[0].toUpperCase() + x.slice(1)}
            </a>
          ))}
          <a href="/kitchen">Kitchen display ↗</a>
          {data?.role !== "KITCHEN" && <a href="/pos">Point of sale ↗</a>}
          <a href="/menu">Customer menu ↗</a>
        </nav>
        <small>
          {data?.role} · {data?.demo ? "DEMO DATA" : "LIVE WORKSPACE"}
        </small>
        <button
          className="ghost"
          onClick={async () => {
            await request("/api/session", { method: "DELETE" });
            router.push("/login");
            router.refresh();
          }}
        >
          Sign out
        </button>
      </aside>
      <main className="workspace">
        <header className="workspaceHead">
          <div>
            <span className="eyebrow">{area.toUpperCase()} · PENT HALL</span>
            <h1>{title[area]}</h1>
            <p className="muted">
              {data?.demo ? "Fictional pilot data · " : ""}Live operations,
              Africa/Accra time
            </p>
          </div>
          <button className="ghost" onClick={load}>
            Refresh
          </button>
        </header>
        {error && (
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
                      <img src={p.image} alt={p.name} />
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
            {area === "reports" && (
              <>
                <div className="metricGrid">
                  {[
                    [
                      "Order → ready",
                      a.prepMinutes === null
                        ? "No data"
                        : `${a.prepMinutes.toFixed(1)} min`,
                    ],
                    [
                      "Pickup waiting",
                      a.waitingMinutes === null
                        ? "No arrival data"
                        : `${a.waitingMinutes.toFixed(1)} min`,
                    ],
                    [
                      "Late order rate",
                      `${(a.count ? (a.late / a.count) * 100 : 0).toFixed(1)}%`,
                    ],
                    [
                      "Cancellation rate",
                      `${(a.count ? (a.cancelled / a.count) * 100 : 0).toFixed(1)}%`,
                    ],
                    [
                      "Order error rate",
                      `${(a.count ? (a.errors / a.count) * 100 : 0).toFixed(1)}%`,
                    ],
                    ["Repeat customers", `${a.repeatRate.toFixed(1)}%`],
                    ["Average basket", a.basket?.toFixed(1) ?? "No data"],
                    [
                      "Scheduled share",
                      `${(a.count ? (a.scheduled / a.count) * 100 : 0).toFixed(1)}%`,
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <b>{value}</b>
                      <small>Today’s orders</small>
                    </div>
                  ))}
                </div>
                <div className="twoColumns">
                  <section className="panel">
                    <h2>Menu performance · today</h2>
                    <p className="quiet">
                      Best to worst, including zero sellers. Paid, non-cancelled
                      orders.
                    </p>
                    <table className="dataTable">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Sold</th>
                          <th>Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.products.map((p) => (
                          <tr key={p.name}>
                            <td>{p.name}</td>
                            <td>{p.quantity}</td>
                            <td>{money(p.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                  <section className="panel">
                    <h2>Peak periods · today</h2>
                    <Bars values={a.hourly.filter((v) => v.value)} />
                    <h2>Orders by day</h2>
                    <Bars
                      values={[
                        ...new Set(
                          s.orders.map((o) => o.createdAt.slice(0, 10)),
                        ),
                      ]
                        .sort()
                        .slice(-7)
                        .map((day) => ({
                          label: day,
                          value: s.orders.filter((o) =>
                            o.createdAt.startsWith(day),
                          ).length,
                        }))}
                    />
                  </section>
                  <section className="panel">
                    <h2>Popular extras · all recorded orders</h2>
                    <Bars
                      values={Object.entries(
                        s.orders
                          .filter(
                            (o) =>
                              o.paymentStatus === "PAID" &&
                              !["CANCELLED", "REJECTED"].includes(o.status),
                          )
                          .reduce(
                            (totals, o) => {
                              o.items.forEach((i) =>
                                i.options.forEach(
                                  (x) =>
                                    (totals[x.name] =
                                      (totals[x.name] || 0) + i.qty),
                                ),
                              );
                              return totals;
                            },
                            {} as Record<string, number>,
                          ),
                      ).map(([label, value]) => ({ label, value }))}
                    />
                    <h3>Waste recorded</h3>
                    {s.inventory.map((i) => (
                      <p key={i.id}>
                        {i.name}:{" "}
                        {s.movements
                          .filter(
                            (m) => m.inventoryId === i.id && m.kind === "WASTE",
                          )
                          .reduce((n, m) => n + m.quantity, 0)}{" "}
                        {i.unit}
                      </p>
                    ))}
                  </section>
                  <section className="panel">
                    <h2>Revenue by day</h2>
                    {[...new Set(s.orders.map((o) => o.createdAt.slice(0, 10)))]
                      .sort()
                      .slice(-7)
                      .map((day) => (
                        <div className="receiptLine" key={day}>
                          <span>{day}</span>
                          <b>{money(analytics(s, day).revenue)}</b>
                        </div>
                      ))}
                    <h3>Stockout events</h3>
                    <p>
                      {
                        s.audits.filter((a) => a.action === "MENU_SOLD_OUT")
                          .length
                      }{" "}
                      recorded availability changes
                    </p>
                    <h3>Peak lunch revenue · today, 12–3 PM</h3>
                    <b>
                      {money(
                        s.orders
                          .filter(
                            (o) =>
                              o.createdAt.startsWith(
                                new Date().toISOString().slice(0, 10),
                              ) &&
                              o.paymentStatus === "PAID" &&
                              !["CANCELLED", "REJECTED"].includes(o.status) &&
                              new Date(o.createdAt).getUTCHours() >= 12 &&
                              new Date(o.createdAt).getUTCHours() < 15,
                          )
                          .reduce((n, o) => n + o.total, 0),
                      )}
                    </b>
                  </section>
                </div>
              </>
            )}
            {area === "settings" && (
              <section className="panel">
                <h2>Opening hours & pickup capacity</h2>
                <p className="muted">
                  Times use Africa/Accra. Existing reservations remain valid
                  when settings change.
                </p>
                <form
                  className="formGrid"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    update({
                      action: "settings",
                      ...Object.fromEntries(
                        [
                          "open",
                          "close",
                          "interval",
                          "capacity",
                          "basePrep",
                        ].map((k) => [k, Number(f.get(k))]),
                      ),
                    });
                  }}
                >
                  {(
                    [
                      "open",
                      "close",
                      "interval",
                      "capacity",
                      "basePrep",
                    ] as const
                  ).map((k) => (
                    <label key={k}>
                      {
                        {
                          open: "Opening hour (0–23)",
                          close: "Closing hour (1–24)",
                          interval: "Pickup interval, minutes",
                          capacity: "Maximum orders per slot",
                          basePrep: "Base preparation, minutes",
                        }[k]
                      }
                      <input
                        name={k}
                        type="number"
                        defaultValue={s.settings[k]}
                        required
                      />
                    </label>
                  ))}
                  <button className="primary" disabled={busy}>
                    Save operating settings
                  </button>
                </form>
              </section>
            )}
            {area === "staff" && (
              <section className="panel">
                <h2>Staff access</h2>
                <p>
                  Owner: all areas. Manager: orders, menu, reports and
                  inventory. Cashier: POS and orders. Kitchen: preparation and
                  availability.
                </p>
                {data.demo ? (
                  <p className="notice">
                    The demo uses four fixed roles. Sign out and select a role
                    to test its permissions.
                  </p>
                ) : (
                  <>
                    <table className="dataTable">
                      <thead>
                        <tr>
                          <th>Supabase user</th>
                          <th>Role</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.members.map((m) => (
                          <tr key={m.user_id}>
                            <td>{m.user_id}</td>
                            <td>{m.role}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <form
                      className="formGrid"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        update({
                          action: "staff",
                          userId: f.get("userId"),
                          role: f.get("role"),
                        });
                      }}
                    >
                      <p>
                        Create the staff login in Supabase Auth, then assign its
                        user UUID here.
                      </p>
                      <label>
                        User UUID
                        <input name="userId" required />
                      </label>
                      <label>
                        Role
                        <select name="role">
                          {["OWNER", "MANAGER", "CASHIER", "KITCHEN"].map(
                            (r) => (
                              <option key={r}>{r}</option>
                            ),
                          )}
                        </select>
                      </label>
                      <button className="primary" disabled={busy}>
                        Save branch role
                      </button>
                    </form>
                  </>
                )}
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
                <button className="primary" disabled={busy}>
                  Save product
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
