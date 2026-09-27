import { state } from "./state.js";

// Pure catalog/analytics helpers — no DOM, no persistence — so they are
// directly unit-testable (see tests/stats.test.js).

export function orderSellableItems() {
  return state.items.filter((item) => item.active);
}

export function lowStockItems(threshold = 5) {
  return state.items.filter((item) => item.active && Number(item.stock) <= threshold);
}

export function categorySummaries() {
  const summaries = new Map();
  state.items.forEach((item) => {
    const category = item.category || "Uncategorized";
    if (!summaries.has(category)) {
      summaries.set(category, { category, items: 0, stock: 0 });
    }
    const summary = summaries.get(category);
    summary.items += 1;
    summary.stock += Number(item.stock) || 0;
  });
  return [...summaries.values()].sort((a, b) => b.items - a.items || a.category.localeCompare(b.category));
}

// Revenue per category across all recorded orders (orders carry their own
// line copies, so historical revenue survives item edits and deletions).
export function salesByCategory() {
  const revenue = new Map();
  state.orders.forEach((order) => {
    (order.items || []).forEach((line) => {
      const item = state.items.find((candidate) => candidate.id === line.itemId);
      const category = item?.category || "Uncategorized";
      revenue.set(category, (revenue.get(category) || 0) + Number(line.price || 0) * Number(line.qty || 0));
    });
  });
  return [...revenue.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

// Best-selling products by units sold across all orders.
export function topSellingItems(limit = 5) {
  const units = new Map();
  state.orders.forEach((order) => {
    (order.items || []).forEach((line) => {
      units.set(line.itemId, (units.get(line.itemId) || 0) + Number(line.qty || 0));
    });
  });
  return [...units.entries()]
    .map(([itemId, sold]) => {
      const item = state.items.find((candidate) => candidate.id === itemId);
      return { itemId, name: item?.name || "Deleted item", sold };
    })
    .sort((a, b) => b.sold - a.sold)
    .slice(0, limit);
}

export function totalRevenue() {
  return state.orders.reduce((total, order) => total + Number(order.total || 0), 0);
}

// A pragmatic "what to restock" score: units sold times how low the stock is.
export function restockSuggestions(limit = 5) {
  const units = new Map();
  state.orders.forEach((order) => {
    (order.items || []).forEach((line) => {
      units.set(line.itemId, (units.get(line.itemId) || 0) + Number(line.qty || 0));
    });
  });
  return state.items
    .map((item) => {
      const sold = units.get(item.id) || 0;
      const stock = Number(item.stock) || 0;
      const score = stock === 0 ? Infinity : sold / Math.max(stock, 1);
      return { item, sold, stock, score };
    })
    .filter((row) => row.sold > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// Distinct categories of an item's siblings — used for "related products".
export function relatedItems(itemId, limit = 3) {
  const item = state.items.find((candidate) => candidate.id === itemId);
  if (!item) return [];
  const sameCategory = state.items.filter(
    (candidate) => candidate.id !== itemId && candidate.active && candidate.category === item.category
  );
  if (sameCategory.length >= limit) return sameCategory.slice(0, limit);
  // Top up with other active items so the rail never looks broken.
  const fillers = state.items.filter(
    (candidate) => candidate.id !== itemId && candidate.active && candidate.category !== item.category
  );
  return [...sameCategory, ...fillers].slice(0, limit);
}
