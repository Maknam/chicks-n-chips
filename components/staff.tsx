"use client";
// Owner's team management: invites, roles, sign-in phone numbers, password-reset links, removal.
import { useState } from "react";
import {
  Check,
  ChefHat,
  Copy,
  Crown,
  KeyRound,
  MessageCircle,
  Phone,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { request } from "./customer";
import { Badge, Button, ConfirmDialog, useToast } from "./ui";
import type { Workspace } from "./operations";
import type { Audit, Role } from "@/lib/domain";

type Member = Workspace["members"][number];

const ROLE_INFO: Record<Role, { label: string; access: string; icon: typeof Crown }> = {
  OWNER: { label: "Owner", access: "Everything, including staff and settings", icon: Crown },
  MANAGER: { label: "Manager", access: "Orders, menu, customers, inventory, reports", icon: ShieldCheck },
  CASHIER: { label: "Cashier", access: "Point of sale and orders", icon: Wallet },
  KITCHEN: { label: "Kitchen", access: "Kitchen display and item availability", icon: ChefHat },
};
const ROLES = Object.keys(ROLE_INFO) as Role[];

const AUDIT_LABELS: Record<string, string> = {
  STAFF_INVITED: "invited a team member",
  STAFF_JOINED: "joined the team",
  STAFF_ROLE_CHANGED: "changed a role",
  STAFF_REMOVED: "removed a team member",
  STAFF_PHONE_SET: "set a sign-in phone number",
  STAFF_PHONE_REMOVED: "removed a sign-in phone number",
  PASSWORD_RESET_ISSUED: "created a password reset link",
  PASSWORD_RESET: "reset their password",
  OWNER_SETUP: "set up the workspace",
  MENU_CREATED: "added a product",
  MENU_EDITED: "edited a product",
  MENU_REMOVED: "removed a product",
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
/** +233241234567 → 024 123 4567 */
const localPhone = (p: string) =>
  p.startsWith("+233") ? `0${p.slice(4, 6)} ${p.slice(6, 9)} ${p.slice(9)}` : p;
const whatsapp = (text: string, phone?: string | null) =>
  `https://wa.me/${phone ? phone.replace("+", "") : ""}?text=${encodeURIComponent(text)}`;

type Shared = { title: string; url: string; phone?: string | null };

export default function StaffPanel({
  members,
  audits,
  currentEmail,
  reload,
}: {
  members: Workspace["members"];
  audits: Audit[];
  currentEmail?: string;
  reload: () => Promise<void>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [shared, setShared] = useState<Shared | null>(null),
    [inviting, setInviting] = useState(false),
    [phoneFor, setPhoneFor] = useState<Member | null>(null),
    [removing, setRemoving] = useState<Member | null>(null);

  async function act(input: Record<string, unknown>) {
    setBusy(true);
    setError("");
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

  const names = Object.fromEntries(members.map((m) => [m.userId, m.name]));
  const counts = Object.fromEntries(ROLES.map((r) => [r, members.filter((m) => m.role === r).length]));
  const withPhone = members.filter((m) => m.phone).length;

  return (
    <div className="staffPanel">
      <div className="staffSummary">
        <div className="staffStat">
          <Users size={18} aria-hidden />
          <div>
            <b>{members.length}</b>
            <span>Team members</span>
          </div>
        </div>
        <div className="staffStat">
          <Phone size={18} aria-hidden />
          <div>
            <b>
              {withPhone}/{members.length}
            </b>
            <span>Can sign in by phone</span>
          </div>
        </div>
        <Button variant="primary" onClick={() => setInviting(true)}>
          <UserPlus size={16} aria-hidden /> Invite team member
        </Button>
      </div>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {shared && <SharedLink shared={shared} onDismiss={() => setShared(null)} />}

      <section className="staffCard">
        <header className="staffCard__head">
          <h2>Team</h2>
          <p>Change a role from the list. Each person signs in with email and password, or with a code texted to their phone.</p>
        </header>
        <ul className="memberList">
          {members.map((m) => {
            const me = m.email === currentEmail;
            return (
              <li key={m.userId} className="memberRow">
                <span className={`avatar avatar--${m.role.toLowerCase()}`} aria-hidden>
                  {initials(m.name)}
                </span>
                <div className="memberRow__who">
                  <b>
                    {m.name} {me && <Badge tone="info">You</Badge>}
                  </b>
                  <span>{m.email}</span>
                  {m.phone ? (
                    <span className="memberRow__phone">
                      <Phone size={13} aria-hidden /> {localPhone(m.phone)}{" "}
                      {m.phoneVerified ? (
                        <Badge tone="success" title="Has signed in with this number">
                          Verified
                        </Badge>
                      ) : (
                        <Badge tone="warning" title="Becomes verified the first time they sign in with a code">
                          Not yet used
                        </Badge>
                      )}
                    </span>
                  ) : (
                    <span className="memberRow__phone quiet">No sign-in phone</span>
                  )}
                </div>
                <select
                  className="memberRow__role"
                  value={m.role}
                  disabled={busy || me}
                  aria-label={`Role for ${m.name}`}
                  title={me ? "Ask another owner to change your role" : undefined}
                  onChange={async (e) => {
                    if (await act({ action: "invite", name: m.name, email: m.email, role: e.target.value }))
                      toast("success", `${m.name} is now ${ROLE_INFO[e.target.value as Role].label.toLowerCase()}.`);
                  }}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_INFO[r].label}
                    </option>
                  ))}
                </select>
                <div className="memberRow__actions">
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPhoneFor(m)}>
                    <Phone size={14} aria-hidden /> {m.phone ? "Phone" : "Add phone"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={async () => {
                      const r = await act({ action: "resetLink", userId: m.userId });
                      if (r?.link)
                        setShared({ title: `Password reset link for ${m.name} · valid 24 hours`, url: r.link, phone: m.phone });
                    }}
                  >
                    <KeyRound size={14} aria-hidden /> Reset link
                  </Button>
                  {!me && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="dangerText"
                      disabled={busy}
                      aria-label={`Remove ${m.name}`}
                      onClick={() => setRemoving(m)}
                    >
                      <Trash2 size={14} aria-hidden />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="staffCard">
        <header className="staffCard__head">
          <h2>What each role can do</h2>
        </header>
        <div className="roleGrid">
          {ROLES.map((r) => {
            const { label, access, icon: Icon } = ROLE_INFO[r];
            return (
              <div key={r} className="roleCard">
                <span className={`roleCard__icon avatar--${r.toLowerCase()}`}>
                  <Icon size={18} aria-hidden />
                </span>
                <div>
                  <b>
                    {label} <span className="quiet">· {counts[r]}</span>
                  </b>
                  <p>{access}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="staffCard">
        <header className="staffCard__head">
          <h2>Recent activity</h2>
        </header>
        {audits.length ? (
          <ol className="activityList">
            {audits
              .slice(-15)
              .reverse()
              .map((a) => (
                <li key={a.id}>
                  <span className="activityDot" aria-hidden />
                  <div>
                    <b>{names[a.actor] ?? "Someone"}</b> {AUDIT_LABELS[a.action] ?? a.action.toLowerCase().replaceAll("_", " ")}
                    {a.entityId && names[a.entityId] && a.entityId !== a.actor && <> · {names[a.entityId]}</>}
                    <time dateTime={a.createdAt}>
                      {new Date(a.createdAt).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                </li>
              ))}
          </ol>
        ) : (
          <p className="quiet">No activity in the last 30 days.</p>
        )}
      </section>

      {inviting && (
        <InviteSheet
          busy={busy}
          error={error}
          onClose={() => {
            setInviting(false);
            setError("");
          }}
          onSubmit={async (f) => {
            const r = await act({ action: "invite", ...f });
            if (!r) return;
            setInviting(false);
            if (r.link) setShared({ title: `Invite link for ${f.name} · valid 72 hours`, url: r.link, phone: null });
            else toast("success", `${f.email} already had an account and now has access.`);
          }}
        />
      )}

      {phoneFor && (
        <PhoneSheet
          member={phoneFor}
          busy={busy}
          error={error}
          onClose={() => {
            setPhoneFor(null);
            setError("");
          }}
          onSubmit={async (phone) => {
            if (await act({ action: "staffPhone", userId: phoneFor.userId, phone })) {
              toast("success", phone ? `${phoneFor.name} can now sign in with a code sent to ${phone}.` : "Phone number removed.");
              setPhoneFor(null);
            }
          }}
        />
      )}

      <ConfirmDialog
        open={!!removing}
        title={`Remove ${removing?.name ?? ""}?`}
        message="They lose access to this workspace immediately. Their past activity stays in reports."
        actions={[
          { label: "Cancel", value: "cancel" },
          { label: "Remove", variant: "danger", value: "remove" },
        ]}
        onClose={async (v) => {
          const m = removing;
          setRemoving(null);
          if (v === "remove" && m && (await act({ action: "removeStaff", userId: m.userId })))
            toast("success", `${m.name} was removed.`);
        }}
      />
    </div>
  );
}

function SharedLink({ shared, onDismiss }: { shared: Shared; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const message = `Chics & Chips workspace: ${shared.url}\nThis private link works once. Don't share it.`;
  return (
    <div className="sharedLink" role="status">
      <div className="sharedLink__head">
        <b>{shared.title}</b>
        <button type="button" className="iconButton" aria-label="Dismiss" onClick={onDismiss}>
          <X size={16} aria-hidden />
        </button>
      </div>
      <p>Send it privately. It works once and expires; anyone with the link can use it.</p>
      <div className="sharedLink__row">
        <input readOnly value={shared.url} onFocus={(e) => e.currentTarget.select()} aria-label="Link" />
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(shared.url);
              setCopied(true);
            } catch {
              /* the link stays visible for manual copying */
            }
          }}
        >
          {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />} {copied ? "Copied" : "Copy"}
        </Button>
        <a className="ui-btn ui-btn--primary" href={whatsapp(message, shared.phone)} target="_blank" rel="noreferrer">
          <MessageCircle size={16} aria-hidden /> WhatsApp
        </a>
      </div>
    </div>
  );
}

function Sheet({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet productSheet" role="dialog" aria-modal="true" aria-label={title}>
        <header className="productSheet__head">
          <div>
            <span className="ui-eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          <button type="button" className="iconButton" aria-label="Close" onClick={onClose}>
            <X size={18} aria-hidden />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

function InviteSheet({
  busy,
  error,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (f: Record<string, string>) => Promise<void>;
}) {
  const [role, setRole] = useState<Role>("CASHIER");
  return (
    <Sheet title="Invite a team member" eyebrow="Staff & access" onClose={onClose}>
      <p className="quiet">They get a private link to choose their own password — you never see it.</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <form
        className="productForm"
        onSubmit={(e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
          onSubmit({ ...f, role });
        }}
      >
        <label className="span2">
          Full name
          <input name="name" required minLength={2} maxLength={80} placeholder="e.g. Ama Mensah" />
        </label>
        <label>
          Email
          <input name="email" type="email" required placeholder="ama@example.com" />
        </label>
        <label>
          Phone (optional)
          <input name="phone" type="tel" inputMode="tel" placeholder="024 123 4567" />
          <small className="quiet">Lets them sign in with an SMS code.</small>
        </label>
        <fieldset className="span2 rolePicker">
          <legend>Role</legend>
          {ROLES.map((r) => {
            const { label, access, icon: Icon } = ROLE_INFO[r];
            return (
              <label key={r} className={role === r ? "selected" : ""}>
                <input type="radio" name="role-choice" checked={role === r} onChange={() => setRole(r)} />
                <Icon size={18} aria-hidden />
                <span>
                  <b>{label}</b>
                  <small>{access}</small>
                </span>
              </label>
            );
          })}
        </fieldset>
        <div className="productForm__actions span2">
          <span className="spacer" />
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={busy}>
            Create invite link
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

function PhoneSheet({
  member,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  member: Member;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (phone: string) => Promise<void>;
}) {
  return (
    <Sheet title={`Sign-in phone for ${member.name}`} eyebrow="Phone sign-in" onClose={onClose}>
      <p className="quiet">
        On the sign-in page they choose <b>Phone</b> and get a 6-digit code by SMS. The number shows as verified after
        their first successful code.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <form
        className="productForm"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(String(new FormData(e.currentTarget).get("phone") ?? "").trim());
        }}
      >
        <label className="span2">
          Ghana mobile number
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            required
            autoFocus
            placeholder="024 123 4567"
            defaultValue={member.phone ? localPhone(member.phone) : ""}
          />
        </label>
        <div className="productForm__actions span2">
          {member.phone && (
            <Button variant="danger" disabled={busy} onClick={() => onSubmit("")}>
              <Trash2 size={16} aria-hidden /> Remove number
            </Button>
          )}
          <span className="spacer" />
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={busy}>
            Save number
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
