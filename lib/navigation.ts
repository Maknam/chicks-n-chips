// Staff navigation: one typed, role-aware source for the admin sidebar.
// Visibility mirrors server/staff.ts `permissions`; the server still enforces access.
import type { Role } from "./domain";

export type NavIcon =
  | "overview"
  | "orders"
  | "menu"
  | "customers"
  | "inventory"
  | "reports"
  | "staff"
  | "kitchen"
  | "pos"
  | "storefront"
  | "settings"
  | "account";

export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: NavIcon;
  roles: readonly Role[];
  /** Opens a separate full-screen interface rather than an admin page. */
  workspace?: boolean;
};
export type NavGroup = { label?: string; items: NavItem[] };

const ALL: Role[] = ["OWNER", "MANAGER", "CASHIER", "KITCHEN"];
const MGMT: Role[] = ["OWNER", "MANAGER"];

export const NAVIGATION: NavGroup[] = [
  { items: [{ id: "overview", label: "Overview", href: "/admin", icon: "overview", roles: MGMT }] },
  {
    label: "Operations",
    items: [
      { id: "orders", label: "Orders", href: "/admin/orders", icon: "orders", roles: ["OWNER", "MANAGER", "CASHIER"] },
      { id: "menu", label: "Menu", href: "/admin/menu", icon: "menu", roles: ["OWNER", "MANAGER", "KITCHEN"] },
      { id: "customers", label: "Customers", href: "/admin/customers", icon: "customers", roles: MGMT },
    ],
  },
  {
    label: "Management",
    items: [
      { id: "inventory", label: "Inventory", href: "/admin/inventory", icon: "inventory", roles: MGMT },
      { id: "reports", label: "Reports", href: "/admin/reports", icon: "reports", roles: MGMT },
      { id: "staff", label: "Staff & access", href: "/admin/staff", icon: "staff", roles: ["OWNER"] },
    ],
  },
  {
    label: "Workspaces",
    items: [
      { id: "kitchen", label: "Kitchen display", href: "/kitchen", icon: "kitchen", roles: ALL, workspace: true },
      { id: "pos", label: "Point of sale", href: "/pos", icon: "pos", roles: ["OWNER", "MANAGER", "CASHIER"], workspace: true },
      { id: "storefront", label: "Customer ordering", href: "/menu", icon: "storefront", roles: ALL, workspace: true },
    ],
  },
];

/** Pinned above the account block. Owners manage settings; everyone else gets their account page. */
export const footerItem = (role: Role): NavItem =>
  role === "OWNER"
    ? { id: "settings", label: "Settings", href: "/admin/settings", icon: "settings", roles: ["OWNER"] }
    : { id: "account", label: "My account", href: "/account", icon: "account", roles: ALL };

export function navigationFor(role: Role): NavGroup[] {
  return NAVIGATION.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) })).filter((g) => g.items.length);
}

export const AREA_LABEL: Record<string, string> = {
  overview: "Overview",
  orders: "Orders",
  menu: "Menu",
  customers: "Customers",
  inventory: "Inventory",
  reports: "Reports",
  staff: "Staff & access",
  settings: "Settings",
};
