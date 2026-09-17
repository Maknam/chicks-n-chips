"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { request } from "./customer";
import {
  type State,
  type Role,
  type Status,
  time,
  production,
} from "@/lib/domain";
export type Workspace = {
  state: State;
  role: Role;
  demo: boolean;
  members: { user_id: string; role: string }[];
};
export function useOperations(area: string) {
  const [data, setData] = useState<Workspace | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await request(`/api/operations?area=${area}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [area]);
  useEffect(() => {
    load();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
      return;
    // Realtime session is provided only to authenticated staff; revision payload has no PII.
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
    let channel: ReturnType<typeof client.channel> | undefined;
    request("/api/realtime")
      .then(async ({ token, branch }) => {
        await client.realtime.setAuth(token);
        channel = client
          .channel("branch-revision")
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "branch_revisions",
              filter: `branch_id=eq.${branch}`,
            },
            load,
          )
          .subscribe();
      })
      .catch(() => {});
    return () => {
      if (channel) void client.removeChannel(channel);
    };
  }, [load]);
  async function action(url: string, input: unknown, method = "POST") {
    setBusy(true);
    try {
      await request(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { data, error, busy, load, action };
}
export default function Kitchen() {
  const { data, error, busy, load, action } = useOperations("kitchen");
  const [batch, setBatch] = useState(false),
    [sound, setSound] = useState(false),
    [filter, setFilter] = useState(""),
    [newCount, setNewCount] = useState(0);
  const known = useRef<Set<string> | null>(null),
    audio = useRef<AudioContext | null>(null);
  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.state.orders.map((o) => o.id));
    const fresh = known.current
      ? [...ids].filter((id) => !known.current!.has(id)).length
      : 0;
    if (fresh) {
      setNewCount(fresh);
      if (sound && audio.current) {
        const oscillator = audio.current.createOscillator();
        const gain = audio.current.createGain();
        gain.gain.value = 0.12;
        oscillator.connect(gain);
        gain.connect(audio.current.destination);
        oscillator.frequency.value = 700;
        oscillator.start();
        oscillator.stop(audio.current.currentTime + 0.2);
      }
    }
    known.current = ids;
  }, [data, sound]);
  const s = data?.state,
    orders = (s?.orders ?? [])
      .filter((o) => !filter || o.pickupAt === filter)
      .slice()
      .sort((a, b) => Date.parse(a.pickupAt) - Date.parse(b.pickupAt));
  const move = (id: string, status: Status) =>
    action(`/api/orders/${id}`, { status }, "PATCH");
  return (
    <main className="kitchen">
      <header className="workspaceHead">
        <div>
          <span className="eyebrow">CHICS & CHIPS · PENT HALL</span>
          <h1>Let’s feed the campus.</h1>
          <p>
            {orders.length} active tickets{" "}
            {data?.demo ? "· Demo workspace" : ""}
          </p>
        </div>
        <div className="rowActions">
          <button onClick={() => setBatch(!batch)}>
            {batch ? "Order board" : "Production batches"}
          </button>
          <button
            onClick={() => {
              if (!audio.current) audio.current = new AudioContext();
              void audio.current.resume();
              setSound(!sound);
            }}
          >
            Sound {sound ? "on" : "off"}
          </button>
          <button onClick={load}>Refresh</button>
          <a className="ghost" href="/admin/menu">
            Availability
          </a>
          <a className="ghost" href="/pos">
            POS
          </a>
        </div>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {newCount > 0 && (
        <button className="primary" onClick={() => setNewCount(0)}>
          {newCount} new order{newCount > 1 ? "s" : ""} received · dismiss
        </button>
      )}
      {filter && (
        <button className="ghost" onClick={() => setFilter("")}>
          Show all pickup times
        </button>
      )}
      {!s ? (
        <p>Loading kitchen…</p>
      ) : batch ? (
        <div className="twoColumns">
          {[...new Set(orders.map((o) => o.pickupAt))].map((at) => {
            const group = orders.filter((o) => o.pickupAt === at);
            return (
              <section className="panel" key={at}>
                <span className="eyebrow">
                  {time(at)} BATCH · {group.length} ORDERS
                </span>
                <h2>What to prepare</h2>
                {production(s, group)
                  .filter((i) => i.required)
                  .map((i) => (
                    <div className="receiptLine" key={i.id}>
                      <span>{i.name}</span>
                      <b>
                        {i.required} {i.unit}
                      </b>
                    </div>
                  ))}
                <button
                  className="primary wide"
                  onClick={() => {
                    setFilter(at);
                    setBatch(false);
                  }}
                >
                  View individual orders
                </button>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="kanban">
          {["NEW", "PREPARING", "READY"].map((column) => (
            <section key={column}>
              <h2>
                {column} ·{" "}
                {
                  orders.filter((o) =>
                    column === "NEW"
                      ? ["NEW", "ACCEPTED"].includes(o.status)
                      : o.status === column,
                  ).length
                }
              </h2>
              {orders
                .filter((o) =>
                  column === "NEW"
                    ? ["NEW", "ACCEPTED"].includes(o.status)
                    : o.status === column,
                )
                .map((o) => (
                  <article
                    className={`ticket ${Date.parse(o.pickupAt) < Date.now() && o.status !== "READY" ? "late" : ""}`}
                    key={o.id}
                  >
                    <div>
                      <b>#{o.number}</b>
                      <span className="due">{time(o.pickupAt)}</span>
                    </div>
                    <small>
                      {o.customer} ·{" "}
                      {o.source === "WALK_IN" ? "WALK-IN" : "ONLINE"} ·{" "}
                      {o.scheduled ? "SCHEDULED" : "ASAP"}
                    </small>
                    {Date.parse(o.pickupAt) < Date.now() &&
                      o.status !== "READY" && (
                        <b className="low">LATE · prioritize this order</b>
                      )}
                    {o.items.map((i, n) => (
                      <p key={n}>
                        <b>
                          {i.qty} × {i.name}
                        </b>
                        <small>
                          {i.variant} {i.options.map((o) => o.name).join(" + ")}
                        </small>
                      </p>
                    ))}
                    <small>
                      {o.paymentStatus === "PAID"
                        ? "Payment confirmed"
                        : "Cashier payment confirmation needed before handover"}
                    </small>
                    <button
                      disabled={busy}
                      onClick={() =>
                        move(
                          o.id,
                          o.status === "NEW"
                            ? "ACCEPTED"
                            : o.status === "ACCEPTED"
                              ? "PREPARING"
                              : o.status === "PREPARING"
                                ? "READY"
                                : "COMPLETED",
                        )
                      }
                    >
                      {o.status === "NEW"
                        ? "Accept order"
                        : o.status === "ACCEPTED"
                          ? "Start preparing"
                          : o.status === "PREPARING"
                            ? "Mark ready"
                            : "Hand over"}
                    </button>
                  </article>
                ))}
              {orders.filter((o) =>
                column === "NEW"
                  ? ["NEW", "ACCEPTED"].includes(o.status)
                  : o.status === column,
              ).length === 0 && <p className="empty">All clear here.</p>}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
