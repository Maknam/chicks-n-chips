"use client";
// Admin application shell: grouped role-aware sidebar, top bar with data-status
// badges, and a modal drawer on small screens. Kitchen, POS and the customer menu
// keep their own purpose-built layouts and are only linked from here.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Boxes,
  ChefHat,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  MonitorSmartphone,
  Settings,
  ShieldCheck,
  Store,
  UserRound,
  Users,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/domain";
import { AREA_LABEL, footerItem, navigationFor, type NavIcon, type NavItem } from "@/lib/navigation";
import { request } from "../customer";
import { Badge } from "../ui";

const ICONS: Record<NavIcon, LucideIcon> = {
  overview: LayoutDashboard,
  orders: ClipboardList,
  menu: UtensilsCrossed,
  customers: Users,
  inventory: Boxes,
  reports: BarChart3,
  staff: ShieldCheck,
  kitchen: ChefHat,
  pos: MonitorSmartphone,
  storefront: Store,
  settings: Settings,
  account: UserRound,
};

export type Connection = "live" | "updating" | "stale" | "offline" | "error";

export type ShellProps = {
  area: string;
  role?: Role;
  user?: { name: string; email: string } | null;
  business?: { name: string; branch: string };
  demo?: boolean;
  connection: Connection;
  updatedAt?: number | null;
  /** Real counts only, keyed by nav item id. */
  counts?: Record<string, number>;
  children: ReactNode;
};

function NavLink({ item, active, count, onNavigate }: { item: NavItem; active: boolean; count?: number; onNavigate?: () => void }) {
  const Icon = ICONS[item.icon];
  return (
    <a
      href={item.href}
      className={`navItem ${active ? "active" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      title={item.workspace ? `${item.label} — opens the full-screen ${item.label.toLowerCase()}` : undefined}
    >
      <Icon size={19} strokeWidth={1.9} aria-hidden />
      <span className="navLabel">{item.label}</span>
      {item.workspace ? (
        <ChevronRight size={15} className="navTrail" aria-hidden />
      ) : count ? (
        <span className="navCount" aria-label={`${count} need action`}>
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </a>
  );
}

const initials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";

function SidebarContent({ area, role, user, business, demo, counts, onNavigate }: Omit<ShellProps, "children" | "connection"> & { onNavigate?: () => void }) {
  const router = useRouter();
  const groups = role ? navigationFor(role) : [];
  const foot = role ? footerItem(role) : null;
  return (
    <>
      <a href="/admin" className="shellBrand" onClick={onNavigate}>
        <span className="shellLogo" aria-hidden>
          C&amp;C
        </span>
        <span>
          <b>{business?.name || "Chics & Chips"}</b>
          <small>{business?.branch || "Pent Hall"} · Workspace</small>
        </span>
      </a>
      <nav className="shellNav" aria-label="Admin">
        {groups.map((g, i) => (
          <div className="navGroup" key={g.label ?? i} role="group" aria-label={g.label}>
            {g.label && <div className="navGroupLabel">{g.label}</div>}
            {g.items.map((item) => (
              <NavLink key={item.id} item={item} active={item.id === area} count={counts?.[item.id]} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>
      <div className="shellFoot">
        {foot && <NavLink item={foot} active={foot.id === area} onNavigate={onNavigate} />}
        <div className="shellUser">
          <span className="avatar" aria-hidden>
            {initials(user?.name)}
          </span>
          <span className="shellUserText">
            <b>{user?.name ?? "Signed in"}</b>
            <small>
              {role ? role[0] + role.slice(1).toLowerCase() : ""}
              {demo ? " · Demo data" : ""}
            </small>
          </span>
          <button
            type="button"
            className="iconBtn"
            aria-label="Sign out"
            title="Sign out"
            onClick={async () => {
              await request("/api/session", { method: "DELETE" });
              router.push("/login");
              router.refresh();
            }}
          >
            <LogOut size={18} aria-hidden />
          </button>
        </div>
      </div>
    </>
  );
}

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? "just now" : `${Math.round(s / 60)} min ago`;
};

export function ConnectionBadge({ connection, updatedAt }: { connection: Connection; updatedAt?: number | null }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);
  const when = updatedAt ? `Last updated ${ago(updatedAt)}` : undefined;
  switch (connection) {
    case "live":
      return (
        <Badge tone="success" dot title={when}>
          Live
        </Badge>
      );
    case "updating":
      return (
        <Badge tone="info" dot title={when}>
          Updating…
        </Badge>
      );
    case "stale":
      return (
        <Badge tone="warning" dot title={when}>
          Stale · {updatedAt ? ago(updatedAt) : "not updated"}
        </Badge>
      );
    case "offline":
      return (
        <Badge tone="danger" dot title={when}>
          Offline
        </Badge>
      );
    default:
      return (
        <Badge tone="danger" dot title={when}>
          Can’t reach server
        </Badge>
      );
  }
}

export default function AdminShell(props: ShellProps) {
  const { area, demo, connection, updatedAt, children } = props;
  const [open, setOpen] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const d = drawer.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <div className="adminShell">
      <aside className="shellSidebar" aria-label="Sidebar">
        <SidebarContent {...props} />
      </aside>

      {/* Small screens: the same navigation in a modal drawer (native dialog traps focus and closes on Escape). */}
      <dialog
        ref={drawer}
        className="shellDrawer"
        aria-label="Navigation"
        onClose={() => {
          setOpen(false);
          trigger.current?.focus();
        }}
        onClick={(e) => e.target === drawer.current && setOpen(false)}
      >
        <div className="shellDrawerPanel">
          <button type="button" className="iconBtn drawerClose" aria-label="Close navigation" onClick={() => setOpen(false)}>
            <X size={20} aria-hidden />
          </button>
          <SidebarContent {...props} onNavigate={() => setOpen(false)} />
        </div>
      </dialog>

      <div className="shellMain">
        <header className="shellTopbar">
          <button ref={trigger} type="button" className="iconBtn menuBtn" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}>
            <MenuIcon size={22} aria-hidden />
          </button>
          <nav className="crumbs" aria-label="Breadcrumb">
            <a href="/admin">{props.business?.name || "Chics & Chips"}</a>
            <ChevronRight size={14} aria-hidden />
            <span aria-current="page">{AREA_LABEL[area] ?? area}</span>
          </nav>
          <div className="topbarStatus">
            {demo && (
              <Badge tone="accent" title="The interface is connected, but this dataset is fictional sample data.">
                Demo data
              </Badge>
            )}
            <ConnectionBadge connection={connection} updatedAt={updatedAt} />
          </div>
        </header>
        <main className="shellContent" id="main">
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="pageHeader">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="pageActions">{actions}</div>}
    </div>
  );
}
