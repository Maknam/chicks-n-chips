"use client";
// Customer header: brand, Menu, Track order and the bag. On phones: brand, track, bag.
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MapPin, PackageSearch, ShoppingBag } from "lucide-react";

export default function CustomerHeader({ count, onBag }: { count?: number; onBag?: () => void }) {
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
  const onMenu = pathname === "/" || pathname.startsWith("/menu");
  const onOrders = pathname.startsWith("/orders") || pathname.startsWith("/order/");

  return (
    <header className="custHeader">
      <a className="custBrand" href="/" aria-label="Chics & Chips home">
        <span className="custLogo" aria-hidden>
          C&amp;C
        </span>
        <span className="custBrandText">
          <b>Chics &amp; Chips</b>
          <small>
            <MapPin size={12} aria-hidden /> Pent Hall · Legon
          </small>
        </span>
      </a>
      <nav className="custNav" aria-label="Main">
        <a href="/menu" aria-current={onMenu ? "page" : undefined}>
          Menu
        </a>
        <a href="/orders" aria-current={onOrders ? "page" : undefined}>
          <PackageSearch size={18} aria-hidden />
          <span>Track order</span>
        </a>
      </nav>
      <div className="custActions">
        <a href="/orders" className="custIconBtn trackShortcut" aria-label="Track an order">
          <PackageSearch size={20} aria-hidden />
        </a>
        {onBag ? (
          <button type="button" className="custIconBtn bagBtn" onClick={onBag} aria-label={`Bag, ${bag} item${bag === 1 ? "" : "s"}`}>
            <ShoppingBag size={20} aria-hidden />
            {bag > 0 && <i className="bagBadge">{bag > 9 ? "9+" : bag}</i>}
          </button>
        ) : (
          <a href="/cart" className="custIconBtn bagBtn" aria-label={`Bag, ${bag} item${bag === 1 ? "" : "s"}`}>
            <ShoppingBag size={20} aria-hidden />
            {bag > 0 && <i className="bagBadge">{bag > 9 ? "9+" : bag}</i>}
          </a>
        )}
      </div>
    </header>
  );
}
