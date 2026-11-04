// Rules behind the redesigned shell and Settings: capacity math and role-aware navigation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSlots, slotsPerDay, ROLES, type Settings } from "../lib/domain";
import { NAVIGATION, footerItem, navigationFor } from "../lib/navigation";
import { permissions } from "../server/staff";

test("capacity preview matches the slot generator", () => {
  const base: Settings = { open: 8, close: 22, interval: 15, capacity: 15, basePrep: 15 };
  assert.equal(slotsPerDay(base), 56, "08:00–22:00 every 15 min");
  assert.equal(slotsPerDay(base) * base.capacity, 840);
  // A final partial slot still counts, exactly like buildSlots.
  for (const s of [base, { ...base, interval: 45 }, { ...base, open: 9, close: 10, interval: 20 }, { ...base, interval: 7 }]) {
    const midnight = new Date("2026-11-04T00:00:00Z");
    const today = buildSlots({ ...s, basePrep: 0 }, new Map(), 0, midnight).filter((x) => x.at.startsWith("2026-11-04"));
    assert.equal(slotsPerDay(s), today.length, `interval ${s.interval}`);
  }
  assert.equal(slotsPerDay({ open: 10, close: 10, interval: 15 }), 0);
});

test("navigation visibility mirrors server permissions", () => {
  const areaOf: Record<string, keyof typeof permissions> = { storefront: "kitchen" }; // customer menu is public; any staff may open it
  for (const group of NAVIGATION)
    for (const item of group.items) {
      const area = areaOf[item.id] ?? (item.id as keyof typeof permissions);
      assert.ok(area in permissions, `${item.id} maps to a permission area`);
      assert.deepEqual([...item.roles].sort(), [...permissions[area]].sort(), `${item.id} roles`);
    }
  assert.equal(footerItem("OWNER").href, "/admin/settings");
  for (const role of ROLES.filter((r) => r !== "OWNER")) assert.equal(footerItem(role).href, "/account");
  // Every role sees something, and nobody sees an empty group.
  for (const role of ROLES) {
    const groups = navigationFor(role);
    assert.ok(groups.length > 0);
    assert.ok(groups.every((g) => g.items.length > 0));
  }
  assert.deepEqual(
    navigationFor("KITCHEN").flatMap((g) => g.items.map((i) => i.id)),
    ["menu", "kitchen", "storefront"],
  );
});
