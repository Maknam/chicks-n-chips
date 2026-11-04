"use client";
// Reports: one filter bar (period, channel, payment, category) drives every section.
// The filter lives in the URL so a refresh or a shared link shows the same view.
import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Download, Minus } from "lucide-react";
import { money, time, STATUS_LABEL, type State, type Status } from "@/lib/domain";
import {
  PRESETS,
  addDays,
  change,
  clampRange,
  presetRange,
  report,
  toCsv,
  type Preset,
  type Report,
  type ReportFilter,
  type ReportPayment,
  type ReportSource,
} from "@/lib/reports";

const HISTORY_DAYS = 90; // matches REPORTS_HISTORY_DAYS on the server
const SECTIONS = [
  { id: "sales", label: "Sales" },
  { id: "menu", label: "Menu" },
  { id: "customers", label: "Customers" },
  { id: "service", label: "Service" },
  { id: "stock", label: "Stock" },
] as const;
type Section = (typeof SECTIONS)[number]["id"];

const today = () => new Date().toISOString().slice(0, 10);
const fmtDay = (day: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", ...opts });
const fmtRange = (from: string, to: string) =>
  from === to ? fmtDay(from, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : `${fmtDay(from)} – ${fmtDay(to, { day: "numeric", month: "short", year: "numeric" })}`;
const percent = (n: number) => `${n.toFixed(1)}%`;
const minutes = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)} min`);

type View = { preset: Preset; filter: ReportFilter; section: Section };

function initialView(): View {
  const t = today();
  return { preset: "7d", filter: { ...presetRange("7d", t), source: "ALL", payment: "ALL", category: "ALL" }, section: "sales" };
}

function readUrl(): View {
  const view = initialView();
  if (typeof window === "undefined") return view;
  const q = new URLSearchParams(window.location.search);
  const t = today();
  const preset = PRESETS.some((p) => p.id === q.get("period")) ? (q.get("period") as Preset) : view.preset;
  const range =
    preset === "custom"
      ? clampRange(q.get("from") || view.filter.from, q.get("to") || view.filter.to, addDays(t, -(HISTORY_DAYS - 1)), t)
      : presetRange(preset, t);
  const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T) =>
    allowed.includes(q.get(key) as T) ? (q.get(key) as T) : fallback;
  return {
    preset,
    section: pick("section", SECTIONS.map((s) => s.id), "sales"),
    filter: {
      ...range,
      source: pick<ReportSource>("channel", ["ALL", "ONLINE", "WALK_IN"], "ALL"),
      payment: pick<ReportPayment>("payment", ["ALL", "CASH", "MOMO", "ONLINE"], "ALL"),
      category: q.get("category") || "ALL",
    },
  };
}

function writeUrl(v: View) {
  const q = new URLSearchParams();
  q.set("period", v.preset);
  if (v.preset === "custom") {
    q.set("from", v.filter.from);
    q.set("to", v.filter.to);
  }
  if (v.filter.source !== "ALL") q.set("channel", v.filter.source);
  if (v.filter.payment !== "ALL") q.set("payment", v.filter.payment);
  if (v.filter.category !== "ALL") q.set("category", v.filter.category);
  if (v.section !== "sales") q.set("section", v.section);
  window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
}

function download(name: string, rows: (string | number)[][]) {
  const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- Small building blocks ----------

function Delta({ now, before, invert = false }: { now: number; before: number; invert?: boolean }) {
  const d = change(now, before);
  if (d === null)
    return <span className="delta flat">{now ? "No earlier data" : "No change"}</span>;
  const up = d > 0.05,
    down = d < -0.05;
  const good = invert ? down : up;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <span className={`delta ${up || down ? (good ? "good" : "bad") : "flat"}`}>
      <Icon size={14} aria-hidden /> {Math.abs(d).toFixed(0)}% vs previous
    </span>
  );
}

function Kpi({ label, value, children }: { label: string; value: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="kpi">
      <span>{label}</span>
      <b>{value}</b>
      {children}
    </div>
  );
}

/** Horizontal bars: one series, value labels in ink (never the bar colour). */
function HBars({ rows, format = String }: { rows: { label: string; value: number }[]; format?: (n: number) => string }) {
  if (!rows.some((r) => r.value)) return <p className="emptyNote">Nothing recorded for this filter.</p>;
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="barRow" key={r.label} title={`${r.label}: ${format(r.value)}`}>
          <span>{r.label}</span>
          <div className="barTrack">
            <span style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <b>{format(r.value)}</b>
        </div>
      ))}
    </div>
  );
}

/** Daily revenue columns with a hover readout; the table view below carries exact values. */
function DailyChart({ daily }: { daily: Report["daily"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...daily.map((d) => d.revenue));
  const shown = hover === null ? null : daily[hover];
  const step = Math.ceil(daily.length / 8);
  if (!daily.some((d) => d.revenue)) return <p className="emptyNote">No paid sales in this period.</p>;
  return (
    <div className="colChart" onMouseLeave={() => setHover(null)}>
      <p className="colReadout" aria-live="polite">
        {shown ? (
          <>
            <b>{fmtDay(shown.day, { weekday: "short", day: "numeric", month: "short" })}</b> · {money(shown.revenue)} · {shown.paidOrders} paid order{shown.paidOrders === 1 ? "" : "s"}
          </>
        ) : (
          <span className="quiet">Hover or tap a day for details. Peak: {money(max)}</span>
        )}
      </p>
      <div className="colPlot" role="img" aria-label="Paid revenue per day">
        {daily.map((d, i) => (
          <button
            type="button"
            key={d.day}
            className={`col ${hover === i ? "on" : ""}`}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onClick={() => setHover(i)}
            aria-label={`${d.day}: ${money(d.revenue)}`}
          >
            <span style={{ height: `${(d.revenue / max) * 100}%` }} />
          </button>
        ))}
      </div>
      <div className="colAxis" aria-hidden>
        {daily.map((d, i) => (
          <span key={d.day}>{i % step === 0 || i === daily.length - 1 ? fmtDay(d.day, daily.length > 1 ? { day: "numeric", month: "short" } : { weekday: "short" }) : ""}</span>
        ))}
      </div>
    </div>
  );
}

function Panel({ title, note, action, children, wide }: { title: string; note?: string; action?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`panel reportPanel ${wide ? "wide" : ""}`}>
      <header>
        <div>
          <h2>{title}</h2>
          {note && <p className="quiet">{note}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

const CsvButton = ({ onClick }: { onClick: () => void }) => (
  <button type="button" className="ghost small" onClick={onClick}>
    <Download size={14} aria-hidden /> CSV
  </button>
);

// ---------- Main ----------

export default function Reports({ state }: { state: State }) {
  // Rendered only after the workspace loads in the browser, so reading the URL here is hydration-safe.
  const [view, setView] = useState<View>(readUrl);
  useEffect(() => writeUrl(view), [view]);

  const { preset, filter, section } = view;
  const t = today();
  const earliest = addDays(t, -(HISTORY_DAYS - 1));
  const categories = useMemo(() => [...new Set(state.products.map((p) => p.category))], [state.products]);
  const r = useMemo(() => report(state, filter), [state, filter]);
  const tag = `${filter.from}_to_${filter.to}`;

  const setFilter = (patch: Partial<ReportFilter>) => setView((v) => ({ ...v, filter: { ...v.filter, ...patch } }));
  const choosePreset = (p: Preset) =>
    setView((v) => ({ ...v, preset: p, filter: p === "custom" ? v.filter : { ...v.filter, ...presetRange(p, t) } }));
  const setDates = (from: string, to: string) =>
    setView((v) => ({ ...v, preset: "custom", filter: { ...v.filter, ...clampRange(from || v.filter.from, to || v.filter.to, earliest, t) } }));
  const filtered = filter.source !== "ALL" || filter.payment !== "ALL" || filter.category !== "ALL";

  return (
    <div className="reports">
      <div className="reportFilters panel">
        <div className="presetRow" role="group" aria-label="Period">
          {PRESETS.map((p) => (
            <button type="button" key={p.id} className={preset === p.id ? "active" : ""} aria-pressed={preset === p.id} onClick={() => choosePreset(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="filterRow">
          <label>
            From
            <input type="date" value={filter.from} min={earliest} max={t} onChange={(e) => setDates(e.target.value, filter.to)} />
          </label>
          <label>
            To
            <input type="date" value={filter.to} min={earliest} max={t} onChange={(e) => setDates(filter.from, e.target.value)} />
          </label>
          <label>
            Channel
            <select value={filter.source} onChange={(e) => setFilter({ source: e.target.value as ReportSource })}>
              <option value="ALL">All channels</option>
              <option value="ONLINE">Online</option>
              <option value="WALK_IN">Walk-in</option>
            </select>
          </label>
          <label>
            Payment
            <select value={filter.payment} onChange={(e) => setFilter({ payment: e.target.value as ReportPayment })}>
              <option value="ALL">All methods</option>
              <option value="CASH">Cash</option>
              <option value="MOMO">Mobile money</option>
              <option value="ONLINE">Online (Paystack)</option>
            </select>
          </label>
          <label>
            Category
            <select value={filter.category} onChange={(e) => setFilter({ category: e.target.value })}>
              <option value="ALL">All categories</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          {filtered && (
            <button type="button" className="ghost small resetFilters" onClick={() => setFilter({ source: "ALL", payment: "ALL", category: "ALL" })}>
              Clear filters
            </button>
          )}
        </div>
        <p className="quiet rangeNote">
          <b>{fmtRange(r.range.from, r.range.to)}</b> · {r.range.days} day{r.range.days === 1 ? "" : "s"} · compared with{" "}
          {fmtRange(r.previousRange.from, r.previousRange.to)}. Reports cover the last {HISTORY_DAYS} days.
        </p>
      </div>

      <div className="kpiGrid">
        <Kpi label="Paid revenue" value={money(r.sales.revenue)}>
          <Delta now={r.sales.revenue} before={r.before.revenue} />
        </Kpi>
        <Kpi label="Paid orders" value={r.sales.orders}>
          <Delta now={r.sales.orders} before={r.before.orders} />
        </Kpi>
        <Kpi label="Average order" value={money(r.sales.aov)}>
          <Delta now={r.sales.aov} before={r.before.aov} />
        </Kpi>
        <Kpi label="Items sold" value={r.sales.items}>
          <Delta now={r.sales.items} before={r.before.items} />
        </Kpi>
      </div>

      <div className="reportTabs" role="tablist" aria-label="Report sections">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            role="tab"
            type="button"
            aria-selected={section === s.id}
            className={section === s.id ? "active" : ""}
            onClick={() => setView((v) => ({ ...v, section: s.id }))}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === "sales" && (
        <div className="reportGrid">
          <Panel title="Revenue by day" note="Paid, non-cancelled orders." wide action={<CsvButton onClick={() => download(`daily-sales_${tag}.csv`, [["Date", "Orders placed", "Paid orders", "Paid revenue (GHS)"], ...r.daily.map((d) => [d.day, d.orders, d.paidOrders, (d.revenue / 100).toFixed(2)])])} />}>
            <DailyChart daily={r.daily} />
          </Panel>
          <Panel title="Busiest hours" note="All orders placed, by hour (Accra time).">
            <HBars rows={r.hourly} />
          </Panel>
          <Panel title="Day of week" note="Paid orders per weekday in this period.">
            <HBars rows={r.weekday} />
          </Panel>
          <Panel title="Channels" note="Share of paid revenue.">
            <SplitTable rows={r.channels} total={r.sales.revenue} />
          </Panel>
          <Panel title="Payment methods" note="Share of paid revenue.">
            <SplitTable rows={r.payments} total={r.sales.revenue} />
          </Panel>
          <Panel
            title="Orders in this period"
            note={`${r.count} placed, including unpaid and cancelled.`}
            wide
            action={<CsvButton onClick={() => download(`orders_${tag}.csv`, [["Order", "Placed", "Customer", "Phone", "Channel", "Payment", "Payment status", "Status", "Items", "Total (GHS)"], ...r.orders.map((o) => [o.number, o.createdAt, o.customer, o.phone, o.source, o.payment, o.paymentStatus, o.status, o.items.map((i) => `${i.qty}x ${i.name}`).join("; "), (o.total / 100).toFixed(2)])])} />}
          >
            <OrdersTable orders={r.orders} />
          </Panel>
        </div>
      )}

      {section === "menu" && (
        <div className="reportGrid">
          <Panel
            title="Menu performance"
            note="Best to worst by revenue, including items that didn’t sell."
            wide
            action={<CsvButton onClick={() => download(`menu_${tag}.csv`, [["Product", "Category", "Sold", "Revenue (GHS)", "Share of revenue (%)"], ...r.products.map((p) => [p.name, p.category, p.quantity, (p.revenue / 100).toFixed(2), p.share.toFixed(1)])])} />}
          >
            <div className="tableScroll">
              <table className="dataTable reportTable">
                <thead>
                  <tr>
                    <th className="hideOnPhone">#</th>
                    <th>Product</th>
                    <th className="num">Sold</th>
                    <th className="num">Revenue</th>
                    <th className="hideOnPhone">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {r.products.map((p, i) => (
                    <tr key={p.id} className={p.quantity ? "" : "dim"}>
                      <td className="quiet hideOnPhone">{i + 1}</td>
                      <td>
                        {p.name}
                        <small>{p.category}</small>
                      </td>
                      <td className="num">{p.quantity}</td>
                      <td className="num">{money(p.revenue)}</td>
                      <td className="hideOnPhone">
                        <span className="shareBar" aria-label={percent(p.share)}>
                          <span style={{ width: `${p.share}%` }} />
                        </span>
                        <small>{percent(p.share)}</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Categories" note="Paid revenue per category.">
            <HBars rows={r.categories.map((c) => ({ label: c.label, value: c.revenue }))} format={money} />
          </Panel>
          <Panel title="Popular extras" note="Add-ons chosen with paid items.">
            {r.extras.length ? (
              <table className="dataTable reportTable">
                <thead>
                  <tr>
                    <th>Extra</th>
                    <th className="num">Times</th>
                    <th className="num">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {r.extras.map((x) => (
                    <tr key={x.label}>
                      <td>{x.label}</td>
                      <td className="num">{x.quantity}</td>
                      <td className="num">{money(x.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="emptyNote">No extras sold in this period.</p>
            )}
          </Panel>
        </div>
      )}

      {section === "customers" && (
        <div className="reportGrid">
          <div className="kpiGrid wide">
            <Kpi label="Customers" value={r.customers.unique} />
            <Kpi label="First-time" value={r.customers.new} />
            <Kpi label="Returning" value={r.customers.returning} />
            <Kpi label="Returning share" value={percent(r.customers.repeatRate)} />
          </div>
          <Panel
            title="Top customers"
            note="By paid spend in this period. Customers are recognised by phone number."
            wide
            action={<CsvButton onClick={() => download(`top-customers_${tag}.csv`, [["Customer", "Phone", "Paid orders", "Spend (GHS)"], ...r.customers.top.map((c) => [c.name, c.phone, c.orders, (c.revenue / 100).toFixed(2)])])} />}
          >
            {r.customers.top.length ? (
              <div className="tableScroll">
                <table className="dataTable reportTable">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th className="num">Paid orders</th>
                      <th className="num">Spend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.customers.top.map((c) => (
                      <tr key={c.id}>
                        <td>
                          {c.name}
                          <small>{c.phone}</small>
                        </td>
                        <td className="num">{c.orders}</td>
                        <td className="num">{money(c.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="emptyNote">No paying customers in this period.</p>
            )}
          </Panel>
        </div>
      )}

      {section === "service" && (
        <div className="reportGrid">
          <div className="kpiGrid wide">
            <Kpi label="Order → ready" value={minutes(r.service.prepMinutes)}>
              <small>Average from order to ready</small>
            </Kpi>
            <Kpi label="Pickup wait" value={minutes(r.service.waitingMinutes)}>
              <small>Arrival to handover</small>
            </Kpi>
            <Kpi label="Late orders" value={percent(r.service.lateRate)}>
              <small>{r.service.late} ready after promised time</small>
            </Kpi>
            <Kpi label="Cancelled / declined" value={percent(r.service.cancelRate)}>
              <small>{r.service.cancelled} orders</small>
            </Kpi>
            <Kpi label="Order errors" value={percent(r.service.errorRate)}>
              <small>{r.service.errors} recorded</small>
            </Kpi>
            <Kpi label="Scheduled ahead" value={percent(r.service.scheduledShare)}>
              <small>Ordered for a later slot</small>
            </Kpi>
            <Kpi label="Awaiting payment" value={r.service.unpaid}>
              <small>Open orders not yet paid</small>
            </Kpi>
            <Kpi label="Stockout events" value={r.stockouts}>
              <small>Items marked sold out</small>
            </Kpi>
          </div>
          <Panel title="Order outcomes" note="Every order placed in this period, by status." wide>
            <HBars rows={r.statuses.map((x) => ({ label: STATUS_LABEL[x.label as Status], value: x.value }))} />
          </Panel>
        </div>
      )}

      {section === "stock" && (
        <div className="reportGrid">
          <Panel
            title="Stock movement"
            note="Usage, restocks and waste recorded in this period. Not affected by channel, payment or category filters."
            wide
            action={<CsvButton onClick={() => download(`stock_${tag}.csv`, [["Item", "Unit", "Used", "Restocked", "Wasted", "On hand now"], ...r.stock.map((s) => [s.name, s.unit, s.used, s.restocked, s.wasted, s.onHand])])} />}
          >
            <div className="tableScroll">
              <table className="dataTable reportTable">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="num">Used</th>
                    <th className="num">Restocked</th>
                    <th className="num">Wasted</th>
                    <th className="num">On hand now</th>
                  </tr>
                </thead>
                <tbody>
                  {r.stock.map((s) => (
                    <tr key={s.id}>
                      <td>
                        {s.name}
                        <small>{s.unit}</small>
                      </td>
                      <td className="num">{s.used}</td>
                      <td className="num">{s.restocked}</td>
                      <td className={`num ${s.wasted ? "low" : ""}`}>{s.wasted}</td>
                      <td className="num">
                        {s.onHand}
                        {s.low && <small className="low">Low</small>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

function SplitTable({ rows, total }: { rows: { label: string; orders: number; revenue: number }[]; total: number }) {
  return (
    <table className="dataTable reportTable">
      <thead>
        <tr>
          <th />
          <th className="num">Orders</th>
          <th className="num">Revenue</th>
          <th className="num">Share</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((x) => (
          <tr key={x.label}>
            <td>{x.label}</td>
            <td className="num">{x.orders}</td>
            <td className="num">{money(x.revenue)}</td>
            <td className="num">{percent(total ? (x.revenue / total) * 100 : 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OrdersTable({ orders }: { orders: Report["orders"] }) {
  const [limit, setLimit] = useState(25);
  if (!orders.length) return <p className="emptyNote">No orders match this filter.</p>;
  const sorted = [...orders].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return (
    <>
      <div className="tableScroll">
        <table className="dataTable reportTable">
          <thead>
            <tr>
              <th>Order</th>
              <th>Placed</th>
              <th>Customer</th>
              <th>Status</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, limit).map((o) => (
              <tr key={o.id}>
                <td>
                  <b>#{o.number}</b>
                  <small>{o.source === "ONLINE" ? "Online" : "Walk-in"}</small>
                </td>
                <td>
                  {time(o.createdAt)}
                  <small>{fmtDay(o.createdAt.slice(0, 10))}</small>
                </td>
                <td>{o.customer}</td>
                <td>
                  <span className={`status ${o.status.toLowerCase()}`}>{STATUS_LABEL[o.status]}</span>
                </td>
                <td className="num">
                  {money(o.total)}
                  <small>{o.paymentStatus === "PAID" ? o.payment : "Unpaid"}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > limit && (
        <button type="button" className="ghost wide" onClick={() => setLimit((n) => n + 50)}>
          Show more ({sorted.length - limit} left)
        </button>
      )}
    </>
  );
}
