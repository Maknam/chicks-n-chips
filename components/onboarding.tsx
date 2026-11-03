"use client";
// Owner setup, invite/reset acceptance and own-password change screens.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { request } from "./customer";

const post = (url: string, data: unknown) =>
  request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

function Shell({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <main className="login">
      <a href="/" className="brandLink">
        <span className="brandMark">C&C</span>
      </a>
      <h1>{title}</h1>
      <p className="muted">{intro}</p>
      {children}
    </main>
  );
}

function useForm(submit: (data: Record<string, string>) => Promise<void>) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    if (data.confirm !== undefined && data.password !== data.confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await submit(data);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return { error, busy, onSubmit };
}

const ErrorText = ({ text }: { text: string }) =>
  text ? (
    <p role="alert" className="error">
      {text}
    </p>
  ) : null;

const NewPassword = () => (
  <>
    <label>
      Password (10+ characters)
      <input name="password" type="password" required minLength={10} autoComplete="new-password" />
    </label>
    <label>
      Confirm password
      <input name="confirm" type="password" required minLength={10} autoComplete="new-password" />
    </label>
  </>
);

export function Setup() {
  const router = useRouter();
  const [needed, setNeeded] = useState<boolean | null>(null);
  useEffect(() => {
    request("/api/setup")
      .then((d) => setNeeded(d.needed))
      .catch(() => setNeeded(true));
  }, []);
  const form = useForm(async ({ name, email, password }) => {
    const { home } = await post("/api/setup", { name, email, password });
    router.push(home);
    router.refresh();
  });
  if (needed === false)
    return (
      <Shell title="You're all set up." intro="This workspace already has an owner.">
        <p>
          <a className="primary" href="/login">
            Sign in
          </a>
        </p>
      </Shell>
    );
  return (
    <Shell
      title="Set up your workspace."
      intro="Create the owner account for Chics & Chips. You'll invite your team after this."
    >
      <ErrorText text={form.error} />
      <form onSubmit={form.onSubmit}>
        <label>
          Your name
          <input name="name" required minLength={2} autoComplete="name" />
        </label>
        <label>
          Email
          <input name="email" type="email" required autoComplete="username" />
        </label>
        <NewPassword />
        <button className="primary" disabled={form.busy || needed === null}>
          {form.busy ? "Creating…" : "Create owner account"}
        </button>
      </form>
      <p className="quiet">
        This page works once: after the owner account exists, everyone else
        joins with an invite link.
      </p>
    </Shell>
  );
}

type LinkInfo = { kind: "INVITE" | "RESET"; email: string; name: string; role: string | null };

export function Join() {
  const router = useRouter();
  const [token, setToken] = useState(""),
    [info, setInfo] = useState<LinkInfo | null>(null),
    [problem, setProblem] = useState("");
  useEffect(() => {
    // The secret lives in the URL fragment, which browsers never send to servers or in referrers.
    const t = window.location.hash.slice(1);
    setToken(t);
    if (!t) {
      setProblem("This link is incomplete. Ask your manager for a new one.");
      return;
    }
    post("/api/invites", { action: "describe", token: t })
      .then(setInfo)
      .catch((e) => setProblem(e.message));
  }, []);
  const form = useForm(async ({ name, password }) => {
    await post("/api/invites", { action: "accept", token, name, password });
    history.replaceState(null, "", "/join");
    router.push("/admin");
    router.refresh();
  });
  if (problem)
    return (
      <Shell title="This link can't be used." intro={problem}>
        <p>
          <a href="/login">Go to sign in</a>
        </p>
      </Shell>
    );
  if (!info) return <Shell title="Checking your link…" intro="">{null}</Shell>;
  const reset = info.kind === "RESET";
  return (
    <Shell
      title={reset ? "Choose a new password." : "Join the team."}
      intro={
        reset
          ? `Set a new password for ${info.email}. You'll be signed out on other devices.`
          : `You've been invited as ${info.role?.toLowerCase()} (${info.email}). Choose your password to finish.`
      }
    >
      <ErrorText text={form.error} />
      <form onSubmit={form.onSubmit}>
        {!reset && (
          <label>
            Your name
            <input name="name" required minLength={2} defaultValue={info.name} autoComplete="name" />
          </label>
        )}
        <NewPassword />
        <button className="primary" disabled={form.busy}>
          {form.busy ? "Saving…" : reset ? "Save password" : "Create my account"}
        </button>
      </form>
    </Shell>
  );
}

export function Account() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; email: string; role: string } | null>(null),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    request("/api/session")
      .then((d) => (d.user ? setUser(d.user) : router.replace("/login")))
      .catch(() => router.replace("/login"));
  }, [router]);
  const form = useForm(async ({ currentPassword, password }) => {
    await post("/api/account/password", { currentPassword, newPassword: password });
    setSaved(true);
  });
  return (
    <Shell
      title="Your account."
      intro={user ? `${user.name} · ${user.email} · ${user.role.toLowerCase()}` : "Loading…"}
    >
      {saved && <p className="notice">Password changed. Other devices have been signed out.</p>}
      <ErrorText text={form.error} />
      <form onSubmit={form.onSubmit}>
        <label>
          Current password
          <input name="currentPassword" type="password" required autoComplete="current-password" />
        </label>
        <NewPassword />
        <button className="primary" disabled={form.busy}>
          {form.busy ? "Saving…" : "Change password"}
        </button>
      </form>
      <p>
        <a href="/admin">Back to workspace</a>
      </p>
    </Shell>
  );
}
