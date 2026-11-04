"use client";
// Mobile tab bar for customer screens (hidden above 650px by CSS).
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ReceiptText, ShoppingBag, User, UtensilsCrossed } from "lucide-react";

const tabs = [
  { href: "/menu", label: "Menu", icon: UtensilsCrossed, match: ["/", "/menu"] },
  { href: "/cart", label: "Bag", icon: ShoppingBag, match: ["/cart", "/checkout"] },
  { href: "/orders", label: "Orders", icon: ReceiptText, match: ["/orders", "/order"] },
  { href: "/profile", label: "You", icon: User, match: ["/profile"] },
];

/** `count` is passed by screens that own the cart; others read the saved cart. */
export default function BottomNav({ count }: { count?: number }) {
  const pathname = usePathname();
  const [saved, setSaved] = useState(0);
  useEffect(() => {
    if (count !== undefined) return;
    try {
      const cart = JSON.parse(localStorage.getItem("cc-cart") || "[]") as { qty: number }[];
      setSaved(cart.reduce((n, l) => n + (l.qty || 0), 0));
    } catch {
      setSaved(0);
    }
  }, [count]);
  const bag = count ?? saved;
  return (
    <nav className="bottomNav" aria-label="Main">
      {tabs.map(({ href, label, icon: Icon, match }) => {
        const active = match.some((m) => (m === "/" ? pathname === "/" : pathname.startsWith(m)));
        return (
          <a key={href} href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
            <span className="tabIcon">
              <Icon size={22} strokeWidth={active ? 2.4 : 1.9} />
              {href === "/cart" && bag > 0 && <i className="tabBadge">{bag > 9 ? "9+" : bag}</i>}
            </span>
            {label}
          </a>
        );
      })}
    </nav>
  );
}
