"use client";
import { useEffect, useState } from "react";
import { request } from "./customer";
export default function Login() {
  const [demo, setDemo] = useState(false),
    [setup, setSetup] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    request("/api/session")
      .then((d) => setDemo(d.demo))
      .catch((e) => setError(e.message));
    request("/api/setup")
      .then((d) => setSetup(d.needed))
      .catch(() => {});
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const { home } = await request("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      window.location.href = home;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <a href="/" className="brandLink">
        <span className="brandMark">C&C</span>
      </a>
      <h1>Good food takes a great team.</h1>
      <p className="muted">Sign in to your Chics & Chips workspace.</p>
      {demo && (
        <p className="notice">
          Demo workspace with fictional data. Staff logins:
          owner@demo.local, manager@demo.local, cashier@demo.local,
          kitchen@demo.local.
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <form onSubmit={submit}>
        <label>
          Email
          <input name="email" type="email" required autoComplete="username" />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "Signing in…" : "Open workspace"}
        </button>
      </form>
      {setup && (
        <p className="notice">
          New workspace? <a href="/setup">Create the owner account</a>.
        </p>
      )}
      <p className="quiet">
        Forgot your password? Ask your owner or manager for a reset link.
      </p>
      <p>
        <a href="/">Back to menu</a>
      </p>
    </main>
  );
}
