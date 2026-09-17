"use client";
import { useState } from "react";
import { active, confirmed, production, type State } from "@/lib/domain";
export default function Inventory({
  state,
  busy,
  update,
}: {
  state: State;
  busy: boolean;
  update: (input: unknown) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState(state.inventory[0]?.id ?? "");
  const item = state.inventory.find((i) => i.id === selected);
  const scheduled = state.orders.filter(
    (o) => active(o) && confirmed(o) && o.scheduled,
  );
  const today = new Date().toISOString().slice(0, 10);
  const beforeLunch = scheduled.filter(
    (o) =>
      o.pickupAt.startsWith(today) && new Date(o.pickupAt).getUTCHours() < 13,
  );
  const history = state.orders.filter(
    (o) => o.status === "COMPLETED" && !o.createdAt.startsWith(today),
  );
  const days = new Set(history.map((o) => o.createdAt.slice(0, 10))).size;
  return (
    <>
      <div className="twoColumns">
        <section className="panel">
          <h2>Stock & confirmed demand</h2>
          <p className="quiet">
            Compare current stock with all active confirmed tickets. Restock and
            waste change the ledger; ingredients are deducted when preparation
            starts.
          </p>
          <table className="dataTable">
            <thead>
              <tr>
                <th>Ingredient</th>
                <th>Stock</th>
                <th>Need</th>
                <th>Shortage</th>
              </tr>
            </thead>
            <tbody>
              {production(state).map((i) => (
                <tr key={i.id}>
                  <td>
                    {i.name}
                    <small>
                      Alert below {i.threshold} {i.unit}
                    </small>
                  </td>
                  <td className={i.quantity <= i.threshold ? "low" : ""}>
                    {i.quantity}
                  </td>
                  <td>{i.required}</td>
                  <td className={i.shortage ? "low" : ""}>
                    {i.shortage || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="panel">
          <h2>Record a stock movement</h2>
          <form
            className="formGrid"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              if (
                await update({
                  action: "inventory",
                  id: selected,
                  kind: f.get("kind"),
                  quantity: Number(f.get("quantity")),
                  reason: f.get("reason"),
                  threshold: Number(f.get("threshold")),
                })
              )
                form.reset();
            }}
          >
            <label>
              Ingredient
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {state.inventory.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Movement
              <select name="kind">
                <option value="RESTOCK">Restock</option>
                <option value="WASTE">Record waste</option>
              </select>
            </label>
            <label>
              Quantity ({item?.unit})
              <input
                name="quantity"
                type="number"
                min="0.1"
                step="0.1"
                required
              />
            </label>
            <label>
              Reason
              <input
                name="reason"
                required
                minLength={3}
                maxLength={200}
                placeholder="Supplier delivery / spoiled / preparation waste"
              />
            </label>
            <label>
              Low-stock threshold
              <input
                key={selected}
                name="threshold"
                type="number"
                min="0"
                defaultValue={item?.threshold}
                required
              />
            </label>
            <button className="primary" disabled={busy}>
              Save movement
            </button>
          </form>
        </section>
      </div>
      <section className="panel">
        <span className="eyebrow">PREPARATION PLANNING · TODAY</span>
        <h2>Before 1 PM: {beforeLunch.length} confirmed scheduled orders</h2>
        <div className="metricGrid">
          {production(state, beforeLunch)
            .filter((i) => i.required)
            .map((i) => (
              <div key={i.id}>
                <span>{i.name}</span>
                <b>{i.required}</b>
                <small>{i.unit} required</small>
              </div>
            ))}
        </div>
        <h3>Historical daily baseline</h3>
        <p className="quiet">
          Mean portions from {days} prior recorded days, using completed orders.
          This is descriptive, not a forecast.
        </p>
        {production(state, history)
          .filter((i) => i.required)
          .map((i) => (
            <span className="badge" style={{ margin: 5 }} key={i.id}>
              {i.name}: {days ? (i.required / days).toFixed(1) : "No history"} /
              day
            </span>
          ))}
      </section>
      <section className="panel">
        <h2>Recent movements</h2>
        {state.movements.length === 0 ? (
          <p className="muted">No movements recorded yet.</p>
        ) : (
          <table className="dataTable">
            <thead>
              <tr>
                <th>When</th>
                <th>Ingredient</th>
                <th>Type</th>
                <th>Quantity</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {state.movements
                .slice(-20)
                .reverse()
                .map((m) => (
                  <tr key={m.id}>
                    <td>{m.createdAt.slice(0, 16)}</td>
                    <td>
                      {
                        state.inventory.find((i) => i.id === m.inventoryId)
                          ?.name
                      }
                    </td>
                    <td>{m.kind}</td>
                    <td>{m.quantity}</td>
                    <td>{m.reason}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
