"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ShoppingBag,
  Search,
  Plus,
  Minus,
  X,
  Clock3,
  MapPin,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import {
  money,
  time,
  pickupLabel,
  type Product,
  type Order,
  type OrderInput,
  type Business,
  type ReceiptSettings,
} from "@/lib/domain";
import { printReceipt } from "@/lib/receipt";
import { trackingPath } from "@/lib/tracking";
import FoodPhoto from "./food-photo";
import BottomNav from "./bottom-nav";
import CustomerHeader from "./customer-header";
import { TrackingCodeCard } from "./order-progress";
export type CartLine = {
  key: string;
  productId: string;
  qty: number;
  variant?: string;
  options: string[];
};
type Menu = {
  products: Product[];
  slots: { at: string; full: boolean; count: number; capacity: number }[];
  estimate: number;
  demo: boolean;
  onlinePayment: boolean;
};
export function saveReceipt(order: Order) {
  const receipts = JSON.parse(localStorage.getItem("cc-receipts") || "[]") as {
    number: number;
    token: string;
    code?: string;
  }[];
  localStorage.setItem(
    "cc-receipts",
    JSON.stringify(
      [
        { number: order.number, token: order.token, code: order.trackingCode },
        ...receipts.filter((r) => r.number !== order.number),
      ].slice(0, 50),
    ),
  );
}
export async function request(url: string, options?: RequestInit) {
  const r = await fetch(url, { cache: "no-store", ...options });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}
export default function Customer({
  view = "menu",
  pos = false,
  printer,
}: {
  view?: string;
  pos?: boolean;
  /** POS only: business details and receipt layout for printing. */
  printer?: { business: Business; receipt: ReceiptSettings };
}) {
  const [menu, setMenu] = useState<Menu | null>(null),
    [error, setError] = useState(""),
    [cart, setCart] = useState<CartLine[]>([]),
    [loaded, setLoaded] = useState(false);
  const [category, setCategory] = useState("All"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<Product | null>(null),
    [variant, setVariant] = useState(""),
    [options, setOptions] = useState<string[]>([]);
  const [checkout, setCheckout] = useState(
      view === "cart" || view === "checkout",
    ),
    [busy, setBusy] = useState(false),
    [placed, setPlaced] = useState<Order | null>(null),
    [pickup, setPickup] = useState("ASAP"),
    [requestId, setRequestId] = useState("");
  useEffect(() => {
    try {
      setCart(
        JSON.parse(
          localStorage.getItem(pos ? "cc-pos-cart" : "cc-cart") || "[]",
        ),
      );
    } catch {}
    setLoaded(true);
    setRequestId(crypto.randomUUID());
  }, [pos]);
  useEffect(() => {
    if (loaded)
      localStorage.setItem(
        pos ? "cc-pos-cart" : "cc-cart",
        JSON.stringify(cart),
      );
  }, [cart, loaded, pos]);
  useEffect(() => {
    let mounted = true;
    const load = () =>
      request("/api/menu")
        .then((data) => {
          if (mounted) setMenu(data);
        })
        .catch((e) => {
          if (mounted) setError(e.message);
        });
    load();
    const timer = setInterval(load, 10000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);
  const lines = useMemo(
    () =>
      cart.map((line) => {
        const product = menu?.products.find((p) => p.id === line.productId);
        const price = product
          ? product.price +
            (product.variants.find((v) => v.id === line.variant)?.price ?? 0) +
            product.options
              .filter((o) => line.options.includes(o.id))
              .reduce((n, o) => n + o.price, 0)
          : 0;
        return { ...line, product, price };
      }),
    [cart, menu],
  );
  const total = lines.reduce((n, i) => n + i.price * i.qty, 0),
    count = cart.reduce((n, i) => n + i.qty, 0);
  function add() {
    if (!selected) return;
    const key = [selected.id, variant, ...options.slice().sort()].join(":");
    setCart((c) =>
      c.some((i) => i.key === key)
        ? c.map((i) =>
            i.key === key ? { ...i, qty: Math.min(20, i.qty + 1) } : i,
          )
        : [
            ...c,
            {
              key,
              productId: selected.id,
              qty: 1,
              variant: variant || undefined,
              options,
            },
          ],
    );
    setSelected(null);
    setRequestId(crypto.randomUUID());
  }
  function quantity(key: string, delta: number) {
    setCart((c) =>
      c
        .map((i) =>
          i.key === key ? { ...i, qty: Math.min(20, i.qty + delta) } : i,
        )
        .filter((i) => i.qty > 0),
    );
    setRequestId(crypto.randomUUID());
  }
  async function place(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const input: OrderInput = {
        requestId,
        customer: String(fd.get("name")),
        phone: String(fd.get("phone")),
        source: pos ? "WALK_IN" : "ONLINE",
        payment: fd.get("payment") as OrderInput["payment"],
        pickup,
        items: cart.map(({ productId, qty, options, variant }) => ({
          productId,
          qty,
          options,
          variant,
        })),
      };
      const { order } = await request("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      saveReceipt(order);
      setPlaced(order);
      if (pos && printer?.receipt.autoPrint) printReceipt(order, printer.business, printer.receipt);
      setCart([]);
      setCheckout(false);
      setRequestId(crypto.randomUUID());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const categories = ["All", ...new Set(menu?.products.map((p) => p.category))];
  const q = query.trim().toLowerCase();
  const visible = (menu?.products ?? []).filter(
    (p) =>
      (category === "All" || p.category === category) &&
      (!q || `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(q)),
  );
  // Browsing everything: one heading per category. Filtering or searching: a single grid.
  const groups: [string, Product[]][] =
    category === "All" && !q
      ? categories
          .slice(1)
          .map((c) => [c, visible.filter((p) => p.category === c)] as [string, Product[]])
          .filter(([, items]) => items.length > 0)
      : [[category === "All" ? "Results" : category, visible]];
  return (
    <main>
      {!pos ? (
        <CustomerHeader count={count} onBag={() => setCheckout(true)} />
      ) : (
      <header className="top">
        <a className="brand brandLink" href="/">
          <span className="brandMark">C&C</span>
          <div>
            <b>Chics & Chips</b>
            <small>
              <MapPin size={13} /> Pent Hall · Legon
            </small>
          </div>
        </a>
        <nav>
          <a href="/orders" className="hideOnPhone">
            My orders
          </a>
          <a href={pos ? "/kitchen" : "/login"}>{pos ? "Kitchen" : "Staff"}</a>
        </nav>
      </header>
      )}
      {menu?.demo && (
        <div className="demoBanner">
          Demo workspace · fictional orders · no real payments
        </div>
      )}
      {!pos && view === "menu" && (
        <section className="hero">
          <div>
            <span className="pill">
              Pent Hall pickup · from {menu?.estimate ?? 15} min
            </span>
            <h1>
              Campus hunger?
              <br />
              <em>Skip the queue.</em>
            </h1>
            <p>
              Your favourites, freshly made. Choose a pickup time and we’ll keep
              you posted.
            </p>
            <div className="heroActions">
              <a className="primary" href="#menu">
                See the menu <ArrowRight size={18} aria-hidden />
              </a>
              <a className="heroLink" href="/orders">
                Track an order
              </a>
            </div>
          </div>
          <div className="heroPhoto">
            <img
              src="https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=900&q=80"
              srcSet="https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=600&q=75 600w, https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=900&q=80 900w"
              sizes="(max-width: 760px) 100vw, 45vw"
              alt="Crispy chicken served fresh"
              fetchPriority="high"
            />
            <span>
              Good food.
              <br />
              More campus time.
            </span>
          </div>
        </section>
      )}
      <section id="menu" className="menu">
        <div className="sectionTitle">
          <div>
            <span className="eyebrow">
              {pos ? "CASHIER · WALK-IN ORDER" : "FRESH FROM OUR KITCHEN"}
            </span>
            <h2>{pos ? "Let’s take that order." : "What are you eating?"}</h2>
          </div>
          <span className="muted">
            <Clock3 size={16} /> Pickup at Pent Hall
          </span>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="Dismiss error">
              ×
            </button>
          </div>
        )}
        <div className="search">
          <Search size={18} />
          <input
            type="search"
            aria-label="Search menu"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chicken, chips, something refreshing…"
          />
        </div>
        <div className="cats">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className={category === c ? "active" : ""}
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        {!menu ? (
          <div className="grid" aria-label="Loading menu">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="empty">
            No meals match your search. Try another word or{" "}
            <button
              type="button"
              className="linkBtn"
              onClick={() => {
                setQuery("");
                setCategory("All");
              }}
            >
              show everything
            </button>
            .
          </p>
        ) : (
          groups.map(([group, items], g) => (
            <section key={group} className="menuGroup" aria-label={group}>
              {groups.length > 1 && <h3 className="menuGroupTitle">{group}</h3>}
              <div className="grid">
                {items.map((p, index) => (
                  <article
                    className={`food${p.availability === "SOLD_OUT" ? " soldOut" : ""}`}
                    key={p.id}
                  >
                    <div className="foodImg">
                      <FoodPhoto src={p.image} alt={p.name} eager={g === 0 && index < 2} />
                      {p.availability !== "AVAILABLE" && (
                        <span className="alert">{p.availability === "SOLD_OUT" ? "Sold out" : "Few left"}</span>
                      )}
                    </div>
                    <div className="foodBody">
                      <h3>{p.name}</h3>
                      <p>{p.description}</p>
                      <div className="price">
                        <span className="priceTag">
                          <b>{money(p.price)}</b>
                          <small>
                            <Clock3 size={12} aria-hidden /> {p.prep} min
                          </small>
                        </span>
                        <button
                          type="button"
                          className="addBtn"
                          disabled={p.availability === "SOLD_OUT"}
                          aria-label={p.availability === "SOLD_OUT" ? `${p.name} is sold out` : `Add ${p.name}`}
                          onClick={() => {
                            setSelected(p);
                            setVariant(p.variants[0]?.id ?? "");
                            setOptions([]);
                          }}
                        >
                          {p.availability === "SOLD_OUT" ? (
                            "Sold out"
                          ) : (
                            <>
                              <Plus size={18} aria-hidden /> Add
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))
        )}
      </section>
      {count > 0 && (
        <button type="button" className="cartbar" onClick={() => setCheckout(true)}>
          <span className="cartbarCount">
            <ShoppingBag size={18} aria-hidden /> {count} item{count === 1 ? "" : "s"}
          </span>
          <span className="cartbarTotal">{money(total)}</span>
          <b>
            Review order <ArrowRight size={16} aria-hidden />
          </b>
        </button>
      )}
      {selected && (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Customize meal"
        >
          <div className="sheet">
            <button
              className="close"
              aria-label="Close"
              onClick={() => setSelected(null)}
            >
              <X />
            </button>
            <div className="customImage">
              <FoodPhoto src={selected.image} alt={selected.name} eager />
            </div>
            <h2>{selected.name}</h2>
            <p>{selected.description}</p>
            {selected.variants.length > 0 && (
              <fieldset>
                <legend>Choose your size</legend>
                {selected.variants.map((v) => (
                  <label className="option" key={v.id}>
                    <span>
                      <input
                        type="radio"
                        name="variant"
                        checked={variant === v.id}
                        onChange={() => setVariant(v.id)}
                      />{" "}
                      {v.name}
                    </span>
                    <b>{money(v.price)}</b>
                  </label>
                ))}
              </fieldset>
            )}
            <fieldset>
              <legend>Make it yours</legend>
              {selected.options.length === 0 && (
                <p>No extras needed. Ready to go.</p>
              )}
              {selected.options.map((o) => (
                <label className="option" key={o.id}>
                  <span>
                    <input
                      type="checkbox"
                      checked={options.includes(o.id)}
                      onChange={() =>
                        setOptions((x) =>
                          x.includes(o.id)
                            ? x.filter((v) => v !== o.id)
                            : [...x, o.id],
                        )
                      }
                    />{" "}
                    {o.name}
                  </span>
                  <b>+{money(o.price)}</b>
                </label>
              ))}
            </fieldset>
            <button className="primary wide" onClick={add}>
              Add to order ·{" "}
              {money(
                selected.price +
                  (selected.variants.find((v) => v.id === variant)?.price ??
                    0) +
                  selected.options
                    .filter((o) => options.includes(o.id))
                    .reduce((n, o) => n + o.price, 0),
              )}
            </button>
          </div>
        </div>
      )}
      {checkout && (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Checkout"
        >
          <div className="sheet checkout">
            <button
              className="close"
              aria-label="Close checkout"
              onClick={() => setCheckout(false)}
            >
              <X />
            </button>
            <span className="eyebrow">PICKUP · PENT HALL</span>
            <h2>Your next good meal.</h2>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {!cart.length ? (
              <p>Your bag is empty. Add a favourite from the menu.</p>
            ) : (
              <>
                <div className="cartItems">
                  {lines.map((i) => (
                    <div key={i.key}>
                      <span>
                        {i.product?.name ?? "Unavailable item"}
                        <small>
                          {
                            i.product?.variants.find((v) => v.id === i.variant)
                              ?.name
                          }{" "}
                          {i.product?.options
                            .filter((o) => i.options.includes(o.id))
                            .map((o) => o.name)
                            .join(", ")}{" "}
                          · {money(i.price)}
                        </small>
                      </span>
                      <span className="counter">
                        <button
                          aria-label="Remove one"
                          onClick={() => quantity(i.key, -1)}
                        >
                          <Minus size={15} />
                        </button>
                        {i.qty}
                        <button
                          aria-label="Add one"
                          onClick={() => quantity(i.key, 1)}
                        >
                          <Plus size={15} />
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
                <form onSubmit={place}>
                  <label>
                    Your name
                    <input
                      name="name"
                      required
                      minLength={2}
                      maxLength={80}
                      autoComplete="given-name"
                    />
                  </label>
                  <label>
                    Phone number
                    <input
                      name="phone"
                      type="tel"
                      required
                      placeholder="0241234567"
                      autoComplete="tel"
                    />
                  </label>
                  <label>
                    Pickup time
                    <select
                      value={pickup}
                      onChange={(e) => {
                        setPickup(e.target.value);
                        setRequestId(crypto.randomUUID());
                      }}
                    >
                      <option value="ASAP">
                        Next available · about {menu?.estimate} min during
                        opening hours
                      </option>
                      {menu?.slots.map((s) => (
                        <option value={s.at} key={s.at} disabled={s.full}>
                          {pickupLabel(s.at)} · {s.full ? "Full" : `${s.capacity - s.count} left`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="muted">
                    Full slots are unavailable. ASAP reserves the next available
                    pickup slot.
                  </p>
                  <label>
                    Payment
                    <select name="payment">
                      <option value="CASH">Cash at pickup</option>
                      {pos && (
                        <option value="MOMO">
                          MoMo · cashier verifies receipt
                        </option>
                      )}
                      {menu?.onlinePayment && (
                        <option value="ONLINE">Pay online with Paystack</option>
                      )}
                    </select>
                  </label>
                  <div className="total">
                    <span>Total</span>
                    <b>{money(total)}</b>
                  </div>
                  <button
                    className="primary wide"
                    disabled={
                      busy ||
                      !menu ||
                      lines.some(
                        (i) =>
                          !i.product || i.product.availability === "SOLD_OUT",
                      )
                    }
                  >
                    {busy ? "Reserving your pickup…" : "Place order"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
      {placed && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="placed-title">
          <div className="sheet success confirmSheet">
            {!pos && (
              <button className="close" aria-label="Close" onClick={() => setPlaced(null)}>
                <X />
              </button>
            )}
            <span className="confirmIcon" aria-hidden>
              <CheckCircle2 size={30} />
            </span>
            <h2 id="placed-title">{pos ? `Order #${placed.number} placed` : "Order received"}</h2>
            <p className="confirmLead">
              {placed.payment === "ONLINE" && placed.paymentStatus !== "PAID"
                ? "One more step: pay online to send it to the kitchen."
                : "The kitchen will accept it shortly. Follow it live with your tracking code."}
            </p>
            <dl className="confirmFacts">
              <div>
                <dt>Order</dt>
                <dd>#{placed.number}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{placed.payment === "ONLINE" && placed.paymentStatus !== "PAID" ? "Waiting for payment" : "Received"}</dd>
              </div>
              <div>
                <dt>Pickup</dt>
                <dd>{pickupLabel(placed.pickupAt)}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>
                  {money(placed.total)}
                  <small>
                    {placed.paymentStatus === "PAID"
                      ? "Paid"
                      : placed.payment === "ONLINE"
                        ? "Not paid yet"
                        : placed.payment === "MOMO"
                          ? "Cashier confirms MoMo"
                          : "Pay at pickup"}
                  </small>
                </dd>
              </div>
            </dl>
            {placed.trackingCode && <TrackingCodeCard code={placed.trackingCode} number={placed.number} />}
            <div className="confirmActions">
              {placed.payment === "ONLINE" && placed.paymentStatus !== "PAID" ? (
                <>
                  <a className="primary wide" href={`/order/${placed.number}#${placed.token}`}>
                    Pay now
                  </a>
                  {placed.trackingCode && (
                    <a className="ghost wide" href={trackingPath(placed.trackingCode)}>
                      Track order
                    </a>
                  )}
                </>
              ) : (
                <>
                  <a
                    className="primary wide"
                    href={placed.trackingCode ? trackingPath(placed.trackingCode) : `/order/${placed.number}#${placed.token}`}
                  >
                    Track order <ArrowRight size={18} aria-hidden />
                  </a>
                  <a className="ghost wide" href={`/order/${placed.number}#${placed.token}`}>
                    View receipt
                  </a>
                </>
              )}
              {pos && printer && (
                <button className="ghost wide" onClick={() => printReceipt(placed, printer.business, printer.receipt)}>
                  Print receipt
                </button>
              )}
              {pos ? (
                <button className="ghost wide" onClick={() => setPlaced(null)}>
                  Next customer
                </button>
              ) : (
                <button className="linkBtn" onClick={() => setPlaced(null)}>
                  Back to the menu
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <footer>
        <b>Chics & Chips</b>
        <span>Pent Hall, University of Ghana · Good food, less waiting.</span>
      </footer>
      {!pos && <BottomNav count={count} />}
    </main>
  );
}
