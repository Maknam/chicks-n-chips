"use client";
import { useEffect, useState } from "react";
import { request } from "./customer";
export default function Login() {
  const [demo, setDemo] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    request("/api/session")
      .then((d) => setDemo(d.demo))
      .catch((e) => setError(e.message));
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await request("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      window.location.href =
        data.role === "KITCHEN"
          ? "/kitchen"
          : data.role === "CASHIER"
            ? "/pos"
            : "/admin";
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
          Local demo: choose a role to explore its permissions.
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <form onSubmit={submit}>
        {demo ? (
          <label>
            Demo role
            <select name="role">
              <option>OWNER</option>
              <option>MANAGER</option>
              <option>CASHIER</option>
              <option>KITCHEN</option>
            </select>
          </label>
        ) : (
          <>
            <label>
              Email
              <input
                name="email"
                type="email"
                required
                autoComplete="username"
              />
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
          </>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Signing in…" : "Open workspace"}
        </button>
      </form>
      <p>
        <a href="/">Back to menu</a>
      </p>
    </main>
  );
}
