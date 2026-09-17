import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
const origin = "http://localhost:3100";
test("mobile guest customization, checkout, private tracking and reorder", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", {
      name: "Customize Classic Chips & Chicken",
      exact: true,
    })
    .click();
  await page.getByLabel("Large (+ extra side)").check();
  await page.getByLabel("Extra house sauce").check();
  await page.getByRole("button", { name: /Add to order/ }).click();
  await page.getByRole("button", { name: /Review order/ }).click();
  await page.getByLabel("Your name").fill("Pilot Student");
  await page.getByLabel("Phone number").fill("0241234567");
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await page.getByRole("link", { name: "Track order", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Order #/ })).toBeVisible();
  await expect(page.getByText("GH₵51.00").last()).toBeVisible();
  await page.getByRole("button", { name: "I’m at Pent Hall" }).click();
  await expect(
    page.getByRole("button", { name: "Arrival recorded" }),
  ).toBeDisabled();
  await page.screenshot({
    path: "test-results/mobile-tracking.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Order again" }).click();
  await expect(
    page.getByText("Large (+ extra side)", { exact: false }).first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("authorization, price tampering, origin checks and simultaneous capacity reservations", async ({
  playwright,
}) => {
  const guest = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { origin },
  });
  const owner = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { origin },
  });
  const kitchen = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { origin },
  });
  expect((await guest.get("/api/operations?area=overview")).status()).toBe(401);
  expect(
    (await owner.post("/api/session", { data: { role: "OWNER" } })).ok(),
  ).toBeTruthy();
  expect(
    (await kitchen.post("/api/session", { data: { role: "KITCHEN" } })).ok(),
  ).toBeTruthy();
  expect((await kitchen.get("/api/operations?area=customers")).status()).toBe(
    403,
  );
  expect(
    (
      await owner.post("/api/operations", {
        headers: { origin: "https://evil.example" },
        data: { action: "settings" },
      })
    ).status(),
  ).toBe(403);
  const settings = {
    action: "settings",
    open: 0,
    close: 24,
    interval: 15,
    capacity: 1,
    basePrep: 5,
  };
  expect(
    (await owner.post("/api/operations", { data: settings })).ok(),
  ).toBeTruthy();
  const menu = await (await guest.get("/api/menu")).json();
  const slot = menu.slots.find((s: { count: number }) => s.count === 0);
  const input = {
    customer: "Capacity Test",
    phone: "0241234568",
    pickup: slot.at,
    payment: "CASH",
    source: "ONLINE",
    total: 1,
    items: [{ productId: menu.products[0].id, qty: 1, options: [] }],
  };
  const responses = await Promise.all(
    [1, 2].map(() =>
      guest.post("/api/orders", {
        data: { ...input, requestId: randomUUID() },
      }),
    ),
  );
  expect(responses.map((r) => r.status()).sort()).toEqual([200, 409]);
  const order = (await responses.find((r) => r.status() === 200)!.json()).order;
  expect(order.total).toBe(menu.products[0].price);
  expect((await guest.get(`/api/orders/${order.number}`)).status()).toBe(404);
  expect(
    (
      await guest.patch(`/api/orders/${order.id}`, { data: { action: "pay" } })
    ).status(),
  ).toBe(401);
  await owner.post("/api/operations", {
    data: { ...settings, capacity: 15, open: 8, close: 22, basePrep: 15 },
  });
  await guest.dispose();
  await owner.dispose();
  await kitchen.dispose();
});
test("owner pages and kitchen remain usable on small screens", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Demo role").selectOption("OWNER");
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Your eatery, at a glance." }),
  ).toBeVisible();
  for (const route of [
    "orders",
    "menu",
    "customers",
    "inventory",
    "reports",
    "staff",
    "settings",
  ]) {
    await page.goto(`/admin/${route}`);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator(".skeleton")).toHaveCount(0);
  }
  await page.screenshot({
    path: "test-results/admin-settings.png",
    fullPage: true,
  });
  await page.goto("/kitchen");
  await expect(
    page.getByRole("heading", { name: "Let’s feed the campus." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Production batches" }).click();
  await expect(page.getByRole("button", { name: "Order board" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/kitchen-mobile.png",
    fullPage: true,
  });
});
