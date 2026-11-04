"use client";
// Design-system primitives. Styles live in app/tokens.css (`ui-*` classes).
// Native elements underneath, so keyboard, forms and screen readers work by default.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ---------- Button ----------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm";
  loading?: boolean;
};
export function Button({ variant = "secondary", size = "md", loading, disabled, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx("ui-btn", `ui-btn--${variant}`, size === "sm" && "ui-btn--sm", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="ui-spinner" aria-hidden />}
      {children}
    </button>
  );
}

// ---------- Card ----------

export function Card({
  title,
  description,
  eyebrow,
  actions,
  children,
  className,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  id?: string;
}) {
  const headingId = useId();
  return (
    <section className={cx("ui-card", className)} aria-labelledby={title ? headingId : undefined} id={id}>
      {(title || actions) && (
        <header className="ui-card__head">
          <div>
            {eyebrow && <div className="ui-eyebrow">{eyebrow}</div>}
            {title && (
              <h2 className="ui-card__title" id={headingId}>
                {title}
              </h2>
            )}
            {description && <p className="ui-card__desc">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

// ---------- Field + controls ----------

type FieldProps = {
  label: ReactNode;
  help?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  /** Receives the ids to wire onto the control. */
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
};
export function Field({ label, help, error, required, className, children }: FieldProps) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cx("ui-field", className)}>
      <label className="ui-label" htmlFor={id}>
        {label}
        {required && (
          <span className="ui-req" aria-hidden>
            *
          </span>
        )}
      </label>
      {children({ id, describedBy, invalid: !!error })}
      {error && (
        <p className="ui-error" id={errorId}>
          {error}
        </p>
      )}
      {help && (
        <p className="ui-help" id={helpId}>
          {help}
        </p>
      )}
    </div>
  );
}

type ControlProps = { id?: string; describedBy?: string; invalid?: boolean };

export function TextInput({ id, describedBy, invalid, className, ...rest }: ControlProps & InputHTMLAttributes<HTMLInputElement>) {
  return <input id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} className={cx("ui-input", className)} {...rest} />;
}

export function NumberInput({
  id,
  describedBy,
  invalid,
  suffix,
  value,
  onValue,
  ...rest
}: ControlProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
    suffix?: string;
    value: number | "";
    onValue: (v: number | "") => void;
  }) {
  return (
    <div className="ui-control">
      <input
        id={id}
        type="number"
        inputMode="numeric"
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        className={cx("ui-input", suffix && "ui-input--suffixed")}
        value={value}
        onChange={(e) => onValue(e.target.value === "" ? "" : Number(e.target.value))}
        {...rest}
      />
      {suffix && (
        <span className="ui-suffix" aria-hidden>
          {suffix}
        </span>
      )}
    </div>
  );
}

export function Select({ id, describedBy, invalid, className, children, ...rest }: ControlProps & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} className={cx("ui-select", className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ id, describedBy, invalid, className, ...rest }: ControlProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} className={cx("ui-textarea", className)} {...rest} />;
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="ui-switch">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {description && <small>{description}</small>}
      </span>
    </label>
  );
}

export function Segmented<T extends string>({
  name,
  value,
  options,
  onChange,
  label,
}: {
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="ui-segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <label key={o.value}>
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

// ---------- Badge ----------

export function Badge({
  tone = "neutral",
  dot,
  children,
  title,
}: {
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "accent";
  dot?: boolean;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={cx("ui-badge", tone !== "neutral" && `ui-badge--${tone}`)} title={title}>
      {dot && <span className="ui-dot" aria-hidden />}
      {children}
    </span>
  );
}

// ---------- Confirm dialog (native <dialog>: focus trap, Escape, focus restore) ----------

export type ConfirmAction = { label: string; variant?: ButtonProps["variant"]; value: string };
export function ConfirmDialog({
  open,
  title,
  message,
  actions,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  actions: ConfirmAction[];
  /** Called with the chosen action's value, or "cancel" on Escape/backdrop. */
  onClose: (value: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="ui-dialog"
      aria-labelledby="ui-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose("cancel");
      }}
      onClick={(e) => e.target === ref.current && onClose("cancel")}
    >
      <div className="ui-dialog__body">
        <h2 id="ui-dialog-title">{title}</h2>
        <p>{message}</p>
      </div>
      <div className="ui-dialog__actions">
        {actions.map((a, i) => (
          <Button key={a.value} variant={a.variant ?? "secondary"} autoFocus={i === actions.length - 1} onClick={() => onClose(a.value)}>
            {a.label}
          </Button>
        ))}
      </div>
    </dialog>
  );
}

// ---------- Toasts ----------

type Toast = { id: number; tone: "success" | "error"; text: string };
const ToastContext = createContext<(tone: Toast["tone"], text: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (tone: Toast["tone"], text: string) => {
      const id = ++next.current;
      setToasts((t) => [...t.slice(-2), { id, tone, text }]);
      setTimeout(() => dismiss(id), tone === "error" ? 8000 : 4000);
    },
    [dismiss],
  );
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="ui-toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`ui-toast ui-toast--${t.tone}`} role={t.tone === "error" ? "alert" : undefined}>
            {t.tone === "success" ? <CheckCircle2 size={18} aria-hidden /> : <AlertCircle size={18} aria-hidden />}
            <span>{t.text}</span>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <X size={16} aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
