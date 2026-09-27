// Tests for the fail-closed import sanitizers and session-expiry math.

import assert from "node:assert/strict";
import { test } from "node:test";

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const {
  sanitizeImportedUsers,
  sanitizeImportedItems,
  sanitizeImportedOrders,
  sanitizeImportedCart,
  sanitizeImportedWishlist,
  sessionExpired,
  SESSION_TIMEOUT_MS
} = await import("../js/utils/security.js");

/* ---------- imported users ---------- */

test("sanitizeImportedUsers normalizes and defaults records", () => {
  const out = sanitizeImportedUsers([
    { id: "u1", name: " Alice ", email: "ALICE@Example.com ", password: "sha256:aa:bb", role: "weird-role" }
  ]);
  assert.equal(out[0].name, "Alice");
  assert.equal(out[0].email, "alice@example.com");
  assert.equal(out[0].role, "user", "unknown roles downgrade to user");
});

test("sanitizeImportedUsers rejects any malformed record", () => {
  assert.equal(sanitizeImportedUsers([{ id: "", name: "x", email: "a@b.co", password: "p" }]), null);
  assert.equal(sanitizeImportedUsers([{ id: "u1", name: "x", email: "not-an-email", password: "p" }]), null);
  assert.equal(sanitizeImportedUsers([{ id: "u1", name: "x", email: "a@b.co", password: "" }]), null);
  assert.equal(sanitizeImportedUsers([{ id: "u1", name: "", email: "a@b.co", password: "p" }]), null);
  assert.equal(sanitizeImportedUsers("not an array"), null);
  assert.equal(sanitizeImportedUsers([null]), null);
});

/* ---------- imported items ---------- */

test("sanitizeImportedItems coerces and guards every field", () => {
  const out = sanitizeImportedItems([
    { id: "i1", name: " Lamp ", category: "  ", price: "1290", stock: "5", image: "assets/img/x.jpg", description: "d" }
  ]);
  assert.equal(out[0].name, "Lamp");
  assert.equal(out[0].price, 1290);
  assert.equal(out[0].stock, 5);
  assert.equal(out[0].category, "Uncategorized", "blank category defaults");
  assert.equal(out[0].active, true, "active defaults true");
});

test("sanitizeImportedItems rejects bad prices, images, and shapes", () => {
  assert.equal(sanitizeImportedItems([{ id: "i1", name: "x", price: -5, stock: 1, image: "a.jpg" }]), null);
  assert.equal(sanitizeImportedItems([{ id: "i1", name: "x", price: 5, stock: 1, image: "https://evil/x.jpg" }]), null);
  assert.equal(sanitizeImportedItems([{ id: "i1", name: "x", price: 5, stock: "lots", image: "a.jpg" }]), null);
  assert.equal(sanitizeImportedItems([{ id: "", name: "x", price: 5, stock: 1, image: "a.jpg" }]), null);
});

/* ---------- imported orders ---------- */

test("sanitizeImportedOrders recomputes totals and fixes bad statuses", () => {
  const out = sanitizeImportedOrders([
    {
      id: "o1",
      userId: "u1",
      customerName: "Demo",
      status: "HACKED",
      items: [{ itemId: "i1", name: "Lamp", price: 100, qty: 2 }],
      total: 999999
    }
  ]);
  assert.equal(out[0].status, "Processing", "unknown status falls back");
  assert.equal(out[0].total, 200, "absurd total replaced by line math");
});

test("sanitizeImportedOrders rejects malformed lines", () => {
  assert.equal(sanitizeImportedOrders([{ id: "o1", items: [{ itemId: "i1", price: -1, qty: 1 }] }]), null);
  assert.equal(sanitizeImportedOrders([{ id: "o1", items: [{ itemId: "i1", price: 1, qty: 0 }] }]), null);
  assert.equal(sanitizeImportedOrders([{ id: "o1", items: "nope" }]), null);
  assert.equal(sanitizeImportedOrders([{ id: "", items: [] }]), null);
});

/* ---------- cart and wishlist ---------- */

test("sanitizeImportedCart bounds quantities", () => {
  assert.deepEqual(sanitizeImportedCart([{ itemId: "i1", qty: 2 }]), [{ itemId: "i1", qty: 2 }]);
  assert.equal(sanitizeImportedCart([{ itemId: "i1", qty: 5000 }]), null);
  assert.equal(sanitizeImportedCart([{ itemId: "", qty: 1 }]), null);
  assert.equal(sanitizeImportedCart([{ itemId: "i1", qty: 1.5 }]).length, 1, "floors fractional qty");
});

test("sanitizeImportedWishlist accepts only id strings", () => {
  assert.deepEqual(sanitizeImportedWishlist(["i1", " i2 "]), ["i1", "i2"]);
  assert.equal(sanitizeImportedWishlist([42]), null);
  assert.equal(sanitizeImportedWishlist([""]), null);
});

/* ---------- session expiry ---------- */

test("sessionExpired respects the 15 minute timeout", () => {
  const now = 1_000_000_000;
  assert.equal(sessionExpired(now - 5 * 60_000, now), false, "5 idle minutes is fine");
  assert.equal(sessionExpired(now - SESSION_TIMEOUT_MS, now), true, "exactly the timeout expires");
  assert.equal(sessionExpired(now - 16 * 60_000, now), true);
  assert.equal(sessionExpired(now, now), false);
});
