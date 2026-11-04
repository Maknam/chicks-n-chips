"use client";
// Owner's team management: invite links, role changes, password-reset links, removal.
import { useState } from "react";
import { request } from "./customer";
import type { Workspace } from "./operations";

const ROLES = ["MANAGER", "CASHIER", "KITCHEN", "OWNER"];

export default function StaffPanel({
  members,
  reload,
}: {
  members: Workspace["members"];
  reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [link, setLink] = useState<{ label: string; url: string } | null>(null),
    [copied, setCopied] = useState(false);

  async function act(input: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const result = await request("/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      await reload();
      return result;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      /* the link stays visible for manual copying */
    }
  }

  return (
    <>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {link && (
        <div className="notice">
          <p>
            <b>{link.label}</b>
            {link.url &&
              " Send it privately (e.g. WhatsApp). It works once and expires; anyone with the link can use it."}
          </p>
          {link.url && (
            <>
              <input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} />
              <button className="secondary" type="button" onClick={() => copy(link.url)}>
                {copied ? "Copied" : "Copy link"}
              </button>
            </>
          )}
        </div>
      )}
      <table className="dataTable memberTable">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.userId}>
              <td data-label="Name">
                <b>{m.name}</b>
              </td>
              <td data-label="Email">{m.email}</td>
              <td data-label="Role">
                <select
                  value={m.role}
                  disabled={busy}
                  aria-label={`Role for ${m.name}`}
                  onChange={(e) =>
                    act({ action: "invite", name: m.name, email: m.email, role: e.target.value })
                  }
                >
                  {ROLES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </td>
              <td className="memberActions">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={async () => {
                    const r = await act({ action: "resetLink", userId: m.userId });
                    if (r?.link)
                      setLink({ label: `Password reset link for ${m.name} (valid 24 hours).`, url: r.link });
                  }}
                >
                  Reset link
                </button>{" "}
                <button
                  className="ghost"
                  disabled={busy}
                  onClick={() => act({ action: "removeStaff", userId: m.userId })}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="formGrid"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = Object.fromEntries(new FormData(form));
          const r = await act({ action: "invite", ...f });
          if (!r) return;
          form.reset();
          setLink(
            r.link
              ? { label: `Invite link for ${f.name} (valid 72 hours).`, url: r.link }
              : { label: `${f.email} already had an account and now has access.`, url: "" },
          );
        }}
      >
        <p>
          Invite a team member. They get a private link to choose their own
          password — you never see it.
        </p>
        <label>
          Name
          <input name="name" required minLength={2} />
        </label>
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        <label>
          Role
          <select name="role">
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <button className="primary" disabled={busy}>
          Create invite link
        </button>
      </form>
    </>
  );
}
