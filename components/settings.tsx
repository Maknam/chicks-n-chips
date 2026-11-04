"use client";
// Owner settings: Business profile, Operating hours & capacity, Receipts & printing, My account.
// - The active section lives in the URL (?section=operations); deep links keep working.
// - Each section edits a draft; background refreshes never overwrite unsaved edits.
// - Leaving a section, refreshing or closing the tab with unsaved edits asks first.
// - "Saved" is only shown after the server confirms.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Building2, Clock, Info, Printer, RefreshCw, UserRound } from "lucide-react";
import { request } from "./customer";
import { PageHeader } from "./layout/admin-shell";
import {
  Button,
  Card,
  ConfirmDialog,
  Field,
  NumberInput,
  Segmented,
  Select,
  Switch,
  TextInput,
  Textarea,
  useToast,
} from "./ui";
import { useDraft } from "./ui/use-draft";
import {
  slotsPerDay,
  type Business,
  type ReceiptSettings,
  type Settings as Operating,
  type State,
} from "@/lib/domain";
import { SAMPLE_ORDER, printReceipt, receiptHtml } from "@/lib/receipt";

const SECTIONS = [
  { id: "business", label: "Business profile", icon: Building2 },
  { id: "operations", label: "Hours & capacity", icon: Clock },
  { id: "receipts", label: "Receipts & printing", icon: Printer },
  { id: "account", label: "My account", icon: UserRound },
] as const;
type Section = (typeof SECTIONS)[number]["id"];

type Mutate = (input: Record<string, unknown>) => Promise<void>;
/** What the active section exposes to the guard. */
type Guarded = { dirty: boolean; save: () => Promise<boolean>; discard: () => void };

function readSection(): Section {
  if (typeof window === "undefined") return "business";
  const q = new URLSearchParams(window.location.search).get("section");
  return SECTIONS.some((s) => s.id === q) ? (q as Section) : "business";
}

export default function SettingsPanel({
  state,
  save,
  reload,
  reloading,
  page,
}: {
  state: State;
  save: Mutate;
  reload: () => Promise<void>;
  reloading: boolean;
  page: { title: string; description: string };
}) {
  // Rendered only after the workspace loads in the browser, so reading the URL is hydration-safe.
  const [section, setSection] = useState<Section>(readSection);
  const [dirty, setDirty] = useState(false);
  const active = useRef<Guarded | null>(null);
  const [pending, setPending] = useState<(() => void) | null>(null);

  const register = useCallback((g: Guarded | null) => {
    active.current = g;
    setDirty(!!g?.dirty);
  }, []);

  // Keep the URL in sync; Back/Forward switch sections.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("section") !== section) {
      url.searchParams.set("section", section);
      window.history.pushState(null, "", url);
    }
  }, [section]);
  useEffect(() => {
    const onPop = () => setSection(readSection());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // Closing the tab or following a sidebar link with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /** Runs `next` now, or after the user resolves unsaved edits. */
  const guard = (next: () => void) => (active.current?.dirty ? setPending(() => next) : next());

  async function resolve(choice: string) {
    const next = pending;
    if (choice === "save") {
      const ok = await active.current?.save();
      if (!ok) return setPending(null);
    } else if (choice === "discard") active.current?.discard();
    setPending(null);
    if (choice !== "cancel" && next) next();
  }

  return (
    <>
      <PageHeader
        title={page.title}
        description={page.description}
        actions={
          <Button variant="secondary" loading={reloading} onClick={() => guard(() => void reload())}>
            {!reloading && <RefreshCw size={16} aria-hidden />} Refresh
          </Button>
        }
      />
      <div className="settingsShell">
        <nav className="settingsTabs" aria-label="Settings sections">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`?section=${id}`}
              aria-current={section === id ? "page" : undefined}
              className={section === id ? "active" : ""}
              onClick={(e) => {
                e.preventDefault();
                if (id !== section) guard(() => setSection(id));
              }}
            >
              <Icon size={18} aria-hidden />
              <span>{label}</span>
            </a>
          ))}
        </nav>
        <div className="settingsContent">
          {section === "business" && <BusinessSection business={state.business} save={save} register={register} />}
          {section === "operations" && <OperationsSection settings={state.settings} save={save} register={register} />}
          {section === "receipts" && <ReceiptSection receipt={state.receipt} business={state.business} save={save} register={register} />}
          {section === "account" && <AccountSection register={register} />}
        </div>
      </div>
      <ConfirmDialog
        open={!!pending}
        title="You have unsaved changes"
        message="Save them before leaving this section, or discard them?"
        actions={[
          { label: "Stay", value: "cancel", variant: "ghost" },
          { label: "Discard", value: "discard", variant: "secondary" },
          { label: "Save changes", value: "save", variant: "primary" },
        ]}
        onClose={resolve}
      />
    </>
  );
}

// ---------- Shared save logic ----------

/**
 * Draft + validation + confirmed save for one section.
 * `validate` returns field → message for invalid fields.
 */
function useSection<T>(opts: {
  server: T;
  action: string;
  save: Mutate;
  register: (g: Guarded | null) => void;
  validate?: (v: T) => Partial<Record<keyof T, string>>;
  success: string;
}) {
  const { server, action, save, register, validate, success } = opts;
  const draft = useDraft(server);
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const errors: Partial<Record<keyof T, string>> = useMemo(() => validate?.(draft.draft) ?? {}, [validate, draft.draft]);
  const valid = Object.keys(errors).length === 0;
  const form = useRef<HTMLFormElement>(null);

  const submit = useCallback(async () => {
    if (!valid) {
      form.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      toast("error", "Fix the highlighted fields, then save again.");
      return false;
    }
    if (saving) return false;
    setSaving(true);
    const value = draft.draft;
    try {
      await save({ action, ...(value as object) });
      draft.markSaved(value);
      toast("success", success);
      return true;
    } catch (e) {
      toast("error", `Not saved: ${(e as Error).message}`);
      return false;
    } finally {
      setSaving(false);
    }
  }, [valid, saving, draft, save, action, toast, success]);

  // Tell the guard about this section; latest closures via effect.
  useEffect(() => {
    register({ dirty: draft.dirty, save: submit, discard: draft.discard });
  }, [register, draft.dirty, draft.discard, submit]);
  useEffect(() => () => register(null), [register]);

  return [{ ...draft, errors, valid, saving, submit }, form] as const;
}

function SaveBar({
  dirty,
  saving,
  valid,
  remoteChanged,
  onDiscard,
  saveLabel = "Save changes",
}: {
  dirty: boolean;
  saving: boolean;
  valid: boolean;
  remoteChanged: boolean;
  onDiscard: () => void;
  saveLabel?: string;
}) {
  return (
    // Sticks to the bottom of the screen only while there is something to save.
    <div className={`ui-savebar ${dirty || remoteChanged ? "" : "idle"}`}>
      <span className={`ui-savebar__status ${dirty ? "dirty" : ""}`} role="status">
        {remoteChanged ? (
          <>
            <AlertTriangle size={16} aria-hidden /> Changed elsewhere — discard to load the latest
          </>
        ) : dirty ? (
          <>
            <span className="ui-dot" aria-hidden /> Unsaved changes
          </>
        ) : (
          "All changes saved"
        )}
      </span>
      <div className="ui-savebar__actions">
        <Button variant="ghost" disabled={!dirty || saving} onClick={onDiscard}>
          Discard
        </Button>
        <Button type="submit" variant="primary" loading={saving} disabled={!dirty || !valid}>
          {saving ? "Saving…" : saveLabel}
        </Button>
      </div>
    </div>
  );
}

// ---------- Business profile ----------

const validateBusiness = (b: Business) => {
  const e: Partial<Record<keyof Business, string>> = {};
  if (b.name.trim().length < 2) e.name = "Enter at least 2 characters.";
  if (b.branch.trim().length < 2) e.branch = "Enter at least 2 characters.";
  if (b.phone && !/^[+\d][\d\s()-]{5,29}$/.test(b.phone.trim())) e.phone = "Use digits, spaces, + or -, e.g. 024 123 4567.";
  return e;
};

function BusinessSection({ business, save, register }: { business: Business; save: Mutate; register: (g: Guarded | null) => void }) {
  const [f, formRef] = useSection({ server: business, action: "business", save, register, validate: validateBusiness, success: "Business profile saved." });
  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        f.submit();
      }}
      noValidate
    >
      <div className="settingsStack">
        <Card title="Business identity" description="Shown in the staff workspace, on receipts and to customers.">
          <div className="ui-grid-2">
            <Field label="Business name" required error={f.errors.name}>
              {(p) => <TextInput {...p} value={f.draft.name} maxLength={60} autoComplete="organization" onChange={(e) => f.set("name", e.target.value)} />}
            </Field>
            <Field label="Branch / location" required error={f.errors.branch} help="e.g. Pent Hall">
              {(p) => <TextInput {...p} value={f.draft.branch} maxLength={60} onChange={(e) => f.set("branch", e.target.value)} />}
            </Field>
          </div>
        </Card>
        <Card title="Contact & location" description="Printed on receipts when enabled under Receipts & printing.">
          <div className="ui-grid-2">
            <Field label="Phone number" error={f.errors.phone}>
              {(p) => (
                <TextInput
                  {...p}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="024 123 4567"
                  value={f.draft.phone}
                  maxLength={30}
                  onChange={(e) => f.set("phone", e.target.value)}
                />
              )}
            </Field>
            <Field label="Time zone" help="All times in the app use Ghana time.">
              {(p) => <TextInput {...p} value="Africa/Accra (GMT, no daylight saving)" disabled readOnly />}
            </Field>
            <Field label="Address" className="ui-span-2">
              {(p) => (
                <TextInput
                  {...p}
                  placeholder="Pent Hall, University of Ghana, Legon"
                  value={f.draft.address}
                  maxLength={120}
                  autoComplete="street-address"
                  onChange={(e) => f.set("address", e.target.value)}
                />
              )}
            </Field>
          </div>
        </Card>
      </div>
      <SaveBar dirty={f.dirty} saving={f.saving} valid={f.valid} remoteChanged={f.remoteChanged} onDiscard={f.discard} />
    </form>
  );
}

// ---------- Operating hours & capacity ----------

type OpsDraft = { open: number; close: number; interval: number; capacity: number | ""; basePrep: number | "" };
const INTERVALS = [5, 10, 15, 20, 30, 45, 60];
const hourLabel = (h: number) => (h === 24 ? "24:00 (midnight)" : `${String(h).padStart(2, "0")}:00`);
const clock = (minuteOfDay: number) =>
  `${String(Math.floor(minuteOfDay / 60)).padStart(2, "0")}:${String(minuteOfDay % 60).padStart(2, "0")}`;

const validateOps = (s: OpsDraft) => {
  const e: Partial<Record<keyof OpsDraft, string>> = {};
  if (s.close <= s.open) e.close = "Closing time must be after opening time. Overnight hours aren’t supported.";
  if (s.capacity === "" || !Number.isInteger(s.capacity) || s.capacity < 1 || s.capacity > 200) e.capacity = "Enter a whole number from 1 to 200.";
  if (s.basePrep === "" || !Number.isInteger(s.basePrep) || s.basePrep < 5 || s.basePrep > 120) e.basePrep = "Enter a whole number of minutes from 5 to 120.";
  return e;
};

function OperationsSection({ settings, save, register }: { settings: Operating; save: Mutate; register: (g: Guarded | null) => void }) {
  const [f, formRef] = useSection<OpsDraft>({ server: settings, action: "settings", save, register, validate: validateOps, success: "Operating hours saved." });
  const d = f.draft;
  const slots = slotsPerDay(d);
  const capacity = typeof d.capacity === "number" ? d.capacity : 0;
  const theoretical = slots * capacity;
  const minutes = (d.close - d.open) * 60;
  const partial = minutes > 0 && minutes % d.interval !== 0;
  const perHour = capacity * (60 / d.interval);

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        f.submit();
      }}
      noValidate
    >
      <div className="settingsStack">
        <Card eyebrow="Opening hours" title="When you take pickups" description="Students can only choose pickup times inside these hours. Times use Africa/Accra.">
          <div className="ui-grid-2">
            <Field label="Opens at">
              {(p) => (
                <Select {...p} value={d.open} onChange={(e) => f.set("open", Number(e.target.value))}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Closes at" error={f.errors.close}>
              {(p) => (
                <Select {...p} value={d.close} onChange={(e) => f.set("close", Number(e.target.value))}>
                  {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </Card>

        <Card eyebrow="Pickup scheduling" title="Slots and kitchen pace" description="How pickup times are offered and how much the kitchen accepts per slot.">
          <div className="ui-grid-2">
            <Field label="Slot length" help="Customers pick a time on this interval.">
              {(p) => (
                <Select {...p} value={d.interval} onChange={(e) => f.set("interval", Number(e.target.value))}>
                  {INTERVALS.map((m) => (
                    <option key={m} value={m}>
                      Every {m} minutes
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Maximum orders per slot" error={f.errors.capacity} help="A slot closes to new orders once it’s full.">
              {(p) => <NumberInput {...p} min={1} max={200} step={1} suffix="orders" value={d.capacity} onValue={(v) => f.set("capacity", v)} />}
            </Field>
            <Field
              label="Base preparation time"
              error={f.errors.basePrep}
              help="The shortest wait quoted when the kitchen is quiet. Busier periods add time automatically; it isn’t a guaranteed ready time."
            >
              {(p) => <NumberInput {...p} min={5} max={120} step={1} suffix="minutes" value={d.basePrep} onValue={(v) => f.set("basePrep", v)} />}
            </Field>
          </div>
        </Card>

        <Card eyebrow="Capacity preview" title="Theoretical booking capacity" description="Updates as you edit. A ceiling on bookings, not a sales forecast or real kitchen throughput.">
          {slots > 0 && capacity > 0 ? (
            <>
              <dl className="capacityStats">
                <div>
                  <dt>Pickup slots per day</dt>
                  <dd>{slots}</dd>
                </div>
                <div>
                  <dt>Orders per hour, at most</dt>
                  <dd>{Number.isInteger(perHour) ? perHour : perHour.toFixed(1)}</dd>
                </div>
                <div>
                  <dt>Bookable orders per day</dt>
                  <dd>{theoretical.toLocaleString("en-GH")}</dd>
                </div>
              </dl>
              <p className="ui-help">
                Based on {hourLabel(d.open)}–{hourLabel(d.close).replace(" (midnight)", "")} ({minutes} minutes) with {d.interval}-minute slots and up to {capacity} orders each
                {partial ? `. The last slot starts at ${clock(d.open * 60 + (slots - 1) * d.interval)}, before closing, and still counts.` : "."}
              </p>
              {perHour > 120 && (
                <p className="inlineNote warning">
                  <AlertTriangle size={16} aria-hidden /> Up to {Math.round(perHour)} orders an hour is a lot for one kitchen. Check you can keep pace before saving.
                </p>
              )}
            </>
          ) : (
            <p className="inlineNote warning">
              <AlertTriangle size={16} aria-hidden /> With these values no pickup slots are available. Fix the highlighted fields.
            </p>
          )}
        </Card>

        <p className="inlineNote">
          <Info size={16} aria-hidden /> Orders already placed keep their pickup times. New limits apply to new orders only.
        </p>
      </div>
      <SaveBar dirty={f.dirty} saving={f.saving} valid={f.valid} remoteChanged={f.remoteChanged} onDiscard={f.discard} />
    </form>
  );
}

// ---------- Receipts & printing ----------

const TOGGLES: { group: string; description: string; items: [keyof ReceiptSettings, string][] }[] = [
  {
    group: "Header",
    description: "Business details at the top.",
    items: [
      ["showBusinessName", "Business name"],
      ["showBranch", "Branch name"],
      ["showAddress", "Address"],
      ["showPhone", "Phone number"],
    ],
  },
  {
    group: "Order details",
    description: "What identifies the order.",
    items: [
      ["showOrderTime", "Date and time"],
      ["showOrderSource", "Order type (online / walk-in)"],
      ["showCustomerName", "Customer name"],
      ["showCustomerPhone", "Customer phone (partly hidden)"],
      ["showPickupTime", "Pickup time"],
      ["showItemOptions", "Extras on each item"],
    ],
  },
  {
    group: "Payment",
    description: "How it was paid.",
    items: [
      ["showPaymentMethod", "Payment method"],
      ["showPaymentStatus", "Paid / not paid"],
    ],
  },
  {
    group: "Tracking",
    description: "Lets customers follow the order on any phone.",
    items: [
      ["showTrackingCode", "Tracking code"],
      ["showTrackingQr", "Tracking QR code"],
    ],
  },
];

function ReceiptSection({
  receipt,
  business,
  save,
  register,
}: {
  receipt: ReceiptSettings;
  business: Business;
  save: Mutate;
  register: (g: Guarded | null) => void;
}) {
  const [f, formRef] = useSection({ server: receipt, action: "receipt", save, register, success: "Receipt settings saved." });
  const r = f.draft;
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const html = useMemo(() => receiptHtml(SAMPLE_ORDER, business, r, origin), [business, r, origin]);
  const missing = [r.showAddress && !business.address && "address", r.showPhone && !business.phone && "phone number"].filter(Boolean);

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        f.submit();
      }}
      noValidate
    >
      <div className="receiptLayout">
        <div className="settingsStack">
          <Card title="Paper & text" description="Match your thermal printer’s roll width.">
            <div className="ui-grid-2">
              <div className="ui-field">
                <span className="ui-label" id="paper-label">
                  Paper width
                </span>
                <Segmented
                  name="paperWidth"
                  label="Paper width"
                  value={r.paperWidth}
                  onChange={(v) => f.set("paperWidth", v)}
                  options={[
                    { value: "80", label: "80 mm" },
                    { value: "58", label: "58 mm" },
                  ]}
                />
              </div>
              <div className="ui-field">
                <span className="ui-label">Text size</span>
                <Segmented
                  name="textSize"
                  label="Text size"
                  value={r.textSize}
                  onChange={(v) => f.set("textSize", v)}
                  options={[
                    { value: "normal", label: "Normal" },
                    { value: "large", label: "Large" },
                  ]}
                />
              </div>
            </div>
          </Card>

          <Card title="What prints" description="Turn sections of the receipt on or off.">
            <div className="toggleGroups">
              {TOGGLES.map((g) => (
                <fieldset key={g.group} className="toggleGroup">
                  <legend>
                    {g.group}
                    <small>{g.description}</small>
                  </legend>
                  <div className="toggleGrid">
                    {g.items.map(([k, label]) => (
                      <Switch key={k} label={label} checked={r[k] as boolean} onChange={(v) => f.set(k, v as never)} />
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
            {missing.length > 0 && (
              <p className="inlineNote">
                <Info size={16} aria-hidden /> Add your {missing.join(" and ")} under Business profile to print {missing.length > 1 ? "them" : "it"}.
              </p>
            )}
          </Card>

          <Card title="Messages">
            <div className="ui-grid-2">
              <Field label="Line under the header" help="Optional, up to 120 characters." className="ui-span-2">
                {(p) => <TextInput {...p} value={r.header} maxLength={120} placeholder="e.g. Follow us @chicsandchips" onChange={(e) => f.set("header", e.target.value)} />}
              </Field>
              <Field label="Footer message" help="Up to 200 characters." className="ui-span-2">
                {(p) => <Textarea {...p} rows={2} value={r.footer} maxLength={200} placeholder="e.g. Thank you! Enjoy your meal." onChange={(e) => f.set("footer", e.target.value)} />}
              </Field>
            </div>
          </Card>

          <Card title="Printing" description="Receipts print through your browser’s print dialog — pick the thermal printer there. Test with your printer before relying on it.">
            <Switch
              label="Open the print dialog after each walk-in sale"
              description="On the POS, right after an order is placed."
              checked={r.autoPrint}
              onChange={(v) => f.set("autoPrint", v)}
            />
            <div className="cardActions">
              <Button variant="secondary" onClick={() => printReceipt(SAMPLE_ORDER, business, r)}>
                <Printer size={16} aria-hidden /> Print test receipt
              </Button>
            </div>
          </Card>
        </div>

        <aside className="receiptPreview" aria-label="Receipt preview">
          <div className="ui-eyebrow">Live preview · sample order</div>
          <div className="paper" style={{ width: r.paperWidth === "58" ? 232 : 300 }}>
            {/* No scripts run inside; same-origin only so the frame can fit its content. */}
            <iframe
              title="Receipt preview"
              srcDoc={html}
              sandbox="allow-same-origin"
              onLoad={(e) => {
                const doc = e.currentTarget.contentDocument;
                if (doc) e.currentTarget.style.height = `${doc.documentElement.scrollHeight}px`;
              }}
            />
          </div>
        </aside>
      </div>
      <SaveBar dirty={f.dirty} saving={f.saving} valid={f.valid} remoteChanged={f.remoteChanged} onDiscard={f.discard} />
    </form>
  );
}

// ---------- My account ----------

function AccountSection({ register }: { register: (g: Guarded | null) => void }) {
  const router = useRouter();
  const toast = useToast();
  const [user, setUser] = useState<{ name: string; email: string; role: string } | null>(null);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const typed = !!(pw.current || pw.next || pw.confirm);

  useEffect(() => {
    request("/api/session")
      .then((d) => setUser(d.user ?? null))
      .catch(() => setUser(null));
  }, []);

  const errors = {
    next: pw.next && pw.next.length < 10 ? "Use at least 10 characters." : undefined,
    confirm: pw.confirm && pw.confirm !== pw.next ? "Passwords don’t match." : undefined,
  };
  const ready = !!pw.current && pw.next.length >= 10 && pw.confirm === pw.next;

  async function change() {
    if (!ready || saving) return false;
    setSaving(true);
    try {
      await request("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }),
      });
      setPw({ current: "", next: "", confirm: "" });
      toast("success", "Password changed. Other devices have been signed out.");
      return true;
    } catch (e) {
      toast("error", (e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  const discard = useCallback(() => setPw({ current: "", next: "", confirm: "" }), []);
  // The guard calls the latest `change` through a ref, so registration only updates when `typed` flips.
  const latest = useRef(change);
  useEffect(() => {
    latest.current = change;
  });
  useEffect(() => register({ dirty: typed, save: () => latest.current(), discard }), [register, typed, discard]);
  useEffect(() => () => register(null), [register]);

  return (
    <div className="settingsStack">
      <Card title="Profile" description="Your sign-in identity. Team members and roles are managed under Staff & access.">
        {user ? (
          <dl className="profileGrid">
            <div>
              <dt>Name</dt>
              <dd>{user.name}</dd>
            </div>
            <div>
              <dt>Email (sign-in)</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{user.role[0] + user.role.slice(1).toLowerCase()}</dd>
            </div>
          </dl>
        ) : (
          <p className="ui-help">Loading…</p>
        )}
      </Card>

      <Card title="Change password" description="You stay signed in here; every other device is signed out.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            change();
          }}
          noValidate
        >
          <div className="ui-grid-2">
            <Field label="Current password" required className="ui-span-2">
              {(p) => (
                <TextInput {...p} type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw((x) => ({ ...x, current: e.target.value }))} />
              )}
            </Field>
            <Field label="New password" required error={errors.next} help="At least 10 characters.">
              {(p) => <TextInput {...p} type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw((x) => ({ ...x, next: e.target.value }))} />}
            </Field>
            <Field label="Confirm new password" required error={errors.confirm}>
              {(p) => <TextInput {...p} type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw((x) => ({ ...x, confirm: e.target.value }))} />}
            </Field>
          </div>
          <div className="cardActions">
            <Button type="submit" variant="primary" loading={saving} disabled={!ready}>
              {saving ? "Saving…" : "Change password"}
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Session" description="Sign out of Chics & Chips on this device.">
        <Button
          variant="secondary"
          loading={signingOut}
          onClick={async () => {
            setSigningOut(true);
            await request("/api/session", { method: "DELETE" });
            router.push("/login");
            router.refresh();
          }}
        >
          Sign out
        </Button>
      </Card>
    </div>
  );
}
