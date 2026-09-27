// Tests for the pure formatting/security helpers.

import assert from "node:assert/strict";
import { test } from "node:test";

const {
  escapeHtml,
  escapeAttribute,
  formatMoney,
  statusClass,
  createId
} = await import("../js/utils/helpers.js");

test("escapeHtml neutralizes script injection", () => {
  const out = escapeHtml('<img src=x onerror="alert(1)">');
  assert.ok(!out.includes("<") && !out.includes(">"), "no raw angle brackets");
  assert.ok(out.includes("&lt;img"), "tags are escaped");
});

test("escapeHtml handles quotes and apostrophes", () => {
  const out = escapeHtml(`He said "it's" & <done>`);
  assert.ok(out.includes("&quot;"));
  assert.ok(out.includes("&#039;"));
  assert.ok(out.includes("&amp;"));
});

test("escapeAttribute also escapes backticks", () => {
  const out = escapeAttribute("`");
  assert.ok(out.includes("&#096;"), "backtick is escaped");
});

test("escapeHtml tolerates null and undefined", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});

test("formatMoney formats Philippine pesos with grouping", () => {
  assert.equal(formatMoney(18500), "PHP 18,500");
  assert.equal(formatMoney(0), "PHP 0");
  assert.equal(formatMoney(null), "PHP 0");
});

test("statusClass slugifies order statuses", () => {
  assert.equal(statusClass("Cash on Delivery"), "cash-on-delivery");
  assert.equal(statusClass("Paid"), "paid");
});

test("createId is prefixed and unique enough", () => {
  const a = createId("order");
  const b = createId("order");
  assert.ok(a.startsWith("order_"));
  assert.ok(b.startsWith("order_"));
  assert.notEqual(a, b);
});
