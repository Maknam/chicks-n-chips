import type { State, Product, Order } from "./domain";
export const rid = "00000000-0000-4000-8000-000000000001";
export const bid = "00000000-0000-4000-8000-000000000002";
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function seed(demo = true): State {
  const inventory = [
    "Chicken",
    "Chips",
    "Rice",
    "Wings",
    "Sobolo",
    "Water",
    "Burger buns",
  ].map((name, i) => ({
    id: uuid(100 + i),
    name,
    unit: "portions",
    quantity: [12, 45, 20, 18, 30, 50, 16][i],
    threshold: 15,
  }));
  const names = [
    "Classic Chips & Chicken",
    "Student Saver Box",
    "Loaded Chips",
    "Spicy Wings & Chips",
    "Chicken Rice Bowl",
    "Chicken Burger Combo",
    "Fresh Sobolo",
    "Bottled Water",
  ];
  const photos = [
    "photo-1562967914-608f82629710",
    "photo-1562967914-608f82629710",
    "photo-1573080496219-bb080dd4f877",
    "photo-1567620832903-9fc6debc209f",
    "photo-1512058564366-18510be2db19",
    "photo-1568901346375-23c9450c58cd",
    "photo-1433086966358-54859d0ed716",
    "photo-1548839140-29a749e1cf4d",
  ];
  const recipes = [[0, 1], [0, 1], [0, 1], [3, 1], [0, 2], [0, 1, 6], [4], [5]];
  const products: Product[] = names.map((name, i) => ({
    id: uuid(10 + i),
    name,
    category: [
      "Popular",
      "Popular",
      "Chips",
      "Chicken",
      "Rice",
      "Chicken",
      "Drinks",
      "Drinks",
    ][i],
    description: [
      "Crispy chicken, golden chips, fresh slaw and house sauce.",
      "Your campus lunch sorted. A generous meal at a student price.",
      "Golden chips, chicken bites and our signature sauce.",
      "Glazed wings with a kick, chips and cooling dip.",
      "Seasoned rice, grilled chicken and crunchy vegetables.",
      "Crispy chicken burger, chips and a chilled drink.",
      "Chilled hibiscus with ginger. Made fresh in house.",
      "Cold water for a hot campus day.",
    ][i],
    price: [3800, 2800, 3200, 4200, 4000, 4500, 800, 500][i],
    prep: i > 5 ? 2 : 15,
    image: `https://images.unsplash.com/${photos[i]}?auto=format&fit=crop&w=700&q=80`,
    availability: "AVAILABLE",
    options:
      i < 6
        ? [
            { id: "sauce", name: "Extra house sauce", price: 300 },
            { id: "slaw", name: "Extra slaw", price: 500 },
          ]
        : [],
    variants:
      i < 6
        ? [
            { id: "regular", name: "Regular", price: 0 },
            { id: "large", name: "Large (+ extra side)", price: 1000 },
          ]
        : [],
    ingredients: Object.fromEntries(
      recipes[i].map((n) => [inventory[n].id, 1]),
    ),
  }));
  const now = new Date();
  const customers = demo
    ? Array.from({ length: 18 }, (_, i) => ({
        id: uuid(200 + i),
        name:
          ["Ama", "Kojo", "Esi", "Kwame", "Akua", "Yaw"][i % 6] + ` ${i + 1}`,
        phone: "+233240" + String(i).padStart(6, "0"),
        createdAt: now.toISOString(),
      }))
    : [];
  const orders: Order[] = demo
    ? Array.from({ length: 64 }, (_, i) => {
        const customer = customers[i % customers.length],
          p = products[i % products.length];
        const created = new Date(now);
        created.setUTCDate(created.getUTCDate() - Math.floor(i / 22));
        created.setUTCHours(11 + (i % 4), i % 60, 0, 0);
        const live = i < 7;
        if (live) created.setTime(now.getTime() - (i + 1) * 3 * 60000);
        const status = live
          ? (["NEW", "ACCEPTED", "PREPARING", "READY"] as const)[i % 4]
          : i % 17 === 0
            ? "CANCELLED"
            : "COMPLETED";
        const readyAt = new Date(created.getTime() + 16 * 60000).toISOString();
        return {
          id: uuid(500 + i),
          number: 1042 + i,
          token: `demo-private-${uuid(800 + i)}`,
          requestId: uuid(900 + i),
          customerId: customer.id,
          customer: customer.name,
          phone: customer.phone,
          items: [
            {
              productId: p.id,
              name: p.name,
              qty: 1 + (i % 2),
              price: p.price,
              options: [],
            },
          ],
          total: p.price * (1 + (i % 2)),
          status,
          source: i % 3 === 0 ? "WALK_IN" : "ONLINE",
          pickupAt: new Date(created.getTime() + 20 * 60000).toISOString(),
          scheduled: i % 2 === 0,
          payment: "CASH",
          paymentStatus: "PAID",
          reference: `demo-${i}`,
          createdAt: created.toISOString(),
          updatedAt: created.toISOString(),
          ...(["READY", "COMPLETED"].includes(status)
            ? {
                readyAt,
                preparingAt: new Date(
                  created.getTime() + 4 * 60000,
                ).toISOString(),
              }
            : {}),
          ...(status === "COMPLETED"
            ? {
                completedAt: new Date(
                  created.getTime() + 24 * 60000,
                ).toISOString(),
                arrivedAt: new Date(
                  created.getTime() + 21 * 60000,
                ).toISOString(),
              }
            : {}),
        };
      })
    : [];
  return {
    revision: 0,
    nextNumber: 1106,
    settings: { open: 8, close: 22, interval: 15, capacity: 15, basePrep: 15 },
    products,
    orders,
    customers,
    inventory,
    movements: [],
    notifications: [],
    audits: [],
  };
}
