// Tests for the pure catalog/analytics helpers.
// stats.js imports state.js which reads localStorage at module load, so a
// stub is installed before the dynamic import below.

import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";

const storageStub = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};
globalThis.localStorage = storageStub;

const { state } = await import("../js/modules/state.js");
const {
  lowStockItems,
  categorySummaries,
  salesByCategory,
  topSellingItems,
  totalRevenue,
  restockSuggestions,
  relatedItems
} = await import("../js/modules/stats.js");

test("lowStockItems flags only active items at or below the threshold", () => {
  const low = lowStockItems(5);
  assert.ok(low.length >= 1, "seed catalog includes a low-stock item");
  low.forEach((item) => {
    assert.ok(item.active, "only active items are flagged");
    assert.ok(Number(item.stock) <= 5, "stock is within threshold");
  });
});

test("categorySummaries counts items and stock per category", () => {
  const summaries = categorySummaries();
  const audio = summaries.find((row) => row.category === "Audio");
  assert.ok(audio, "Audio category exists in seed data");
  assert.equal(audio.items, 2, "two audio products");
  assert.equal(audio.stock, 25, "11 headphones + 14 speakers");
  const totalItems = summaries.reduce((sum, row) => sum + row.items, 0);
  assert.equal(totalItems, state.items.length, "every item is counted once");
});

test("salesByCategory aggregates revenue per category across orders", () => {
  const original = state.orders;
  state.orders = [
    {
      id: "order_t1",
      items: [
        { itemId: "item_headphones", price: 2450, qty: 2 },
        { itemId: "item_lamp", price: 1290, qty: 1 }
      ]
    },
    {
      id: "order_t2",
      items: [{ itemId: "item_headphones", price: 2450, qty: 1 }]
    }
  ];
  const sales = salesByCategory();
  const audio = sales.find((row) => row.category === "Audio");
  assert.equal(audio.total, 7350, "2450*2 + 2450 across two orders");
  assert.equal(sales[0].category, "Audio", "biggest revenue sorts first");
  assert.ok(sales[0].total >= sales[1].total, "sorted by revenue descending");
  state.orders = original;
});

test("topSellingItems ranks by units sold and caps at the limit", () => {
  const original = state.orders;
  state.orders = [
    {
      id: "order_t3",
      items: [
        { itemId: "item_headphones", price: 2450, qty: 3 },
        { itemId: "item_lamp", price: 1290, qty: 1 },
        { itemId: "item_mouse", price: 980, qty: 2 }
      ]
    }
  ];
  const top = topSellingItems(2);
  assert.equal(top.length, 2);
  assert.equal(top[0].name, "Pulse Wireless Headphones");
  assert.equal(top[0].sold, 3);
  state.orders = original;
});

test("totalRevenue sums every order total", () => {
  const original = state.orders;
  state.orders = [
    { id: "a", total: 100 },
    { id: "b", total: 250.5 }
  ];
  assert.equal(totalRevenue(), 350.5);
  state.orders = original;
});

test("restockSuggestions ranks fast movers with low stock first", () => {
  const original = state.orders;
  state.orders = [
    {
      id: "order_t4",
      items: [
        { itemId: "item_sunglasses", price: 1150, qty: 4 },
        { itemId: "item_powerbank", price: 1450, qty: 2 }
      ]
    }
  ];
  const rows = restockSuggestions(5);
  assert.ok(rows.length >= 2);
  const sunglasses = rows.find((row) => row.item.id === "item_sunglasses");
  const powerbank = rows.find((row) => row.item.id === "item_powerbank");
  assert.ok(sunglasses.score > powerbank.score, "4 sold / 4 stock beats 2 sold / 18 stock");
  state.orders = original;
});

test("relatedItems prefers same-category siblings and fills the rail", () => {
  const related = relatedItems("item_headphones", 3);
  assert.equal(related.length, 3, "rail always gets three entries");
  assert.ok(related.every((item) => item.id !== "item_headphones"), "never includes itself");
  assert.ok(related.every((item) => item.active), "only active items");

  const speakerRelated = relatedItems("item_speaker", 3);
  assert.equal(speakerRelated[0].category, "Audio", "same-category item leads");
});

test("relatedItems returns empty for unknown ids", () => {
  assert.deepEqual(relatedItems("item_nope", 3), []);
});
