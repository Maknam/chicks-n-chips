"use client";
// Staff sign-in: email + password, or phone + 6-digit SMS code.
import { useEffect, useState } from "react";
import { ArrowLeft, Mail, Smartphone } from "lucide-react";
import { request } from "./customer";
import { AuthShell } from "./onboarding";

const post = (url: string, data: unknown) =>
  request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

type Method = "email" | "phone";
const RESEND_SECONDS = 30;

export default function Login() {
  const [demo, setDemo] = useState(false),
    [setup, setSetup] = useState(false),
    [method, setMethod] = useState<Method>("email"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [phone, setPhone] = useState(""),
    [codeSent, setCodeSent] = useState(false),
    [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    request("/api/session")
      .then((d) => {
        // Already signed in: go straight to the workspace.
        if (d.user) window.location.replace(d.user.role === "KITCHEN" ? "/kitchen" : d.user.role === "CASHIER" ? "/pos" : "/admin");
        setDemo(d.demo);
      })
      .catch((e) => setError(e.message));
    request("/api/setup")
      .then((d) => setSetup(d.needed))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const signInEmail = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    return run(async () => {
      const { home } = await post("/api/session", data);
      window.location.href = home;
    });
  };

  const sendCode = (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    return run(async () => {
      await post("/api/session/phone", { action: "send", phone });
      setCodeSent(true);
      setCooldown(RESEND_SECONDS);
    });
  };

  const verifyCode = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code") ?? "");
    return run(async () => {
      const { home } = await post("/api/session/phone", { action: "verify", phone, code });
      window.location.href = home;
    });
  };

  function switchTo(m: Method) {
    setMethod(m);
    setError("");
  }

  return (
    <AuthShell
      title="Welcome back"
      intro="Sign in to run orders, the menu and your team."
      footer={
        <>
          {setup && (
            <p className="authNote">
              New workspace? <a href="/setup">Create the owner account</a>
            </p>
          )}
          <p className="authHelp">Forgot your password? Ask your owner or manager for a reset link.</p>
        </>
      }
    >
      {demo && (
        <p className="notice authNotice">
          Demo workspace with fictional data. Staff logins: owner@demo.local, manager@demo.local,
          cashier@demo.local, kitchen@demo.local.
        </p>
      )}

      <div className="authTabs" role="tablist" aria-label="Sign-in method">
        <button
          type="button"
          role="tab"
          aria-selected={method === "email"}
          className={method === "email" ? "active" : ""}
          onClick={() => switchTo("email")}
        >
          <Mail size={16} aria-hidden /> Email
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={method === "phone"}
          className={method === "phone" ? "active" : ""}
          onClick={() => switchTo("phone")}
        >
          <Smartphone size={16} aria-hidden /> Phone
        </button>
      </div>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {method === "email" && (
        <form className="authForm" onSubmit={signInEmail}>
          <label>
            Email
            <input name="email" type="email" required autoComplete="username" placeholder="you@example.com" />
          </label>
          <label>
            Password
            <input name="password" type="password" required autoComplete="current-password" placeholder="••••••••••" />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      )}

      {method === "phone" && !codeSent && (
        <form className="authForm" onSubmit={sendCode}>
          <label>
            Phone number
            <span className="phoneField">
              <span aria-hidden>+233</span>
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                required
                autoComplete="tel-national"
                placeholder="024 123 4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </span>
          </label>
          <p className="authHelp">We&apos;ll text a 6-digit code to the number your owner added for you.</p>
          <button className="primary" disabled={busy || phone.replace(/\D/g, "").length < 9}>
            {busy ? "Sending…" : "Send code"}
          </button>
        </form>
      )}

      {method === "phone" && codeSent && (
        <form className="authForm" onSubmit={verifyCode}>
          <p className="authSent">
            If <b>{phone}</b> belongs to a team member, a code is on its way.
          </p>
          <label>
            6-digit code
            <input
              name="code"
              className="codeInput"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              autoFocus
              placeholder="000000"
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Checking…" : "Verify and sign in"}
          </button>
          <div className="authRow">
            <button
              type="button"
              className="linkButton"
              onClick={() => {
                setCodeSent(false);
                setError("");
              }}
            >
              <ArrowLeft size={14} aria-hidden /> Change number
            </button>
            <button type="button" className="linkButton" disabled={busy || cooldown > 0} onClick={() => sendCode()}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
