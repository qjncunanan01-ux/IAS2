// Security-focused tests: sanitization, validation, the image-path guard,
// and the login lockout state machine. All pure logic — no DOM needed.

import assert from "node:assert/strict";
import { test } from "node:test";

const {
  sanitizeText,
  sanitizeMultiline,
  validateName,
  validateEmail,
  validatePasswordPolicy,
  validateMoney,
  validateQuantity,
  validateImagePath,
  attemptLogin,
  lockoutMessage,
  lockoutRemainingMs,
  LOCKOUT
} = await import("../js/utils/security.js");

/* ---------- sanitization ---------- */

test("sanitizeText strips control characters", () => {
  assert.equal(sanitizeText("ab\u0000\u0007cd"), "abcd");
});

test("sanitizeText collapses whitespace and trims", () => {
  assert.equal(sanitizeText("  hello \n\t world  "), "hello world");
});

test("sanitizeText caps length", () => {
  assert.equal(sanitizeText("x".repeat(500), 10).length, 10);
});

test("sanitizeMultiline keeps newlines but strips control chars", () => {
  const out = sanitizeMultiline("line1\nline2\r\nline3");
  assert.equal(out, "line1\nline2\nline3");
});

test("sanitizeMultiline caps line count and total length", () => {
  const many = Array.from({ length: 20 }, (_, i) => `line${i}`).join("\n");
  assert.equal(sanitizeMultiline(many).split("\n").length, 8);
  assert.ok(sanitizeMultiline("x".repeat(2000), 100).length <= 100);
});

/* ---------- field validators ---------- */

test("validateName enforces a minimum length", () => {
  assert.equal(validateName("a").ok, false);
  assert.equal(validateName("Jo").ok, true);
});

test("validateEmail rejects malformed addresses", () => {
  assert.equal(validateEmail("nope").ok, false);
  assert.equal(validateEmail("a@b").ok, false);
  assert.equal(validateEmail("a b@c.com").ok, false);
  assert.equal(validateEmail("").ok, false);
});

test("validateEmail accepts and normalizes valid addresses", () => {
  const result = validateEmail("  User@EXAMPLE.COM ");
  assert.equal(result.ok, true);
  assert.equal(result.value, "user@example.com");
});

test("validatePasswordPolicy enforces length and character classes", () => {
  assert.equal(validatePasswordPolicy("short").ok, false);
  assert.equal(validatePasswordPolicy("alllowercase1").ok, false);
  assert.equal(validatePasswordPolicy("ALLUPPERCASE1").ok, false);
  assert.equal(validatePasswordPolicy("NoDigitsHere").ok, false);
  assert.equal(validatePasswordPolicy("GoodPass1").ok, true);
});

test("validatePasswordPolicy caps maximum length", () => {
  assert.equal(validatePasswordPolicy("Aa1" + "x".repeat(200)).ok, false);
});

test("validateMoney rejects non-numbers, negatives, and absurd values", () => {
  assert.equal(validateMoney("abc").ok, false);
  assert.equal(validateMoney(-1).ok, false);
  assert.equal(validateMoney(20_000_000).ok, false);
  assert.equal(validateMoney(1290.5).ok, true);
});

test("validateQuantity floors and range-checks", () => {
  assert.equal(validateQuantity(3.9).value, 3);
  assert.equal(validateQuantity(-2).ok, false);
  assert.equal(validateQuantity(200_000).ok, false);
});

/* ---------- image path guard (anti-traversal / anti-remote) ---------- */

test("validateImagePath blocks remote and protocol URLs", () => {
  assert.equal(validateImagePath("https://evil.example/x.jpg").ok, false);
  assert.equal(validateImagePath("http://evil/x.png").ok, false);
  assert.equal(validateImagePath("javascript:alert(1)").ok, false);
  assert.equal(validateImagePath("data:text/html,<h1>x</h1>").ok, false);
  assert.equal(validateImagePath("//evil.example/x.jpg").ok, false);
});

test("validateImagePath blocks traversal and injection characters", () => {
  assert.equal(validateImagePath("../../.ssh/id_rsa.jpg").ok, false);
  assert.equal(validateImagePath("assets/..\\windows.jpg").ok, false);
  assert.equal(validateImagePath("assets/img/x.jpg?size=9").ok, false);
  assert.equal(validateImagePath("assets/img/x.jpg#y").ok, false);
});

test("validateImagePath blocks non-image extensions", () => {
  assert.equal(validateImagePath("assets/scripts/payload.js").ok, false);
  assert.equal(validateImagePath("assets/page.html").ok, false);
  assert.equal(validateImagePath("assets/img/x").ok, false);
});

test("validateImagePath accepts legitimate local images", () => {
  for (const path of ["assets/img/headphones.jpg", "assets/placeholder.svg", "img/x.PNG", "a/b/c.webp"]) {
    assert.equal(validateImagePath(path).ok, true, path);
  }
});

/* ---------- login lockout state machine ---------- */

test("lockout allows the first four failures without penalty", () => {
  let record = null;
  for (let count = 1; count <= 4; count += 1) {
    const result = attemptLogin(record, 1000, false);
    assert.equal(result.allowed, true);
    assert.equal(result.lockedForMs, undefined);
    record = result.next;
    assert.equal(record.count, count);
    assert.equal(record.until, 0);
  }
});

test("lockout engages on the fifth failure with the base penalty", () => {
  const result = attemptLogin({ count: 4, until: 0 }, 1000, false);
  assert.equal(result.allowed, true);
  assert.equal(result.lockedForMs, LOCKOUT.BASE_MS);
  assert.equal(result.next.until, 1000 + LOCKOUT.BASE_MS);
});

test("lockout penalties grow per extra failure", () => {
  const sixth = attemptLogin({ count: 5, until: 0 }, 1000, false);
  assert.equal(sixth.lockedForMs, LOCKOUT.BASE_MS + LOCKOUT.STEP_MS);
  const seventh = attemptLogin({ count: 6, until: 0 }, 1000, false);
  assert.equal(seventh.lockedForMs, LOCKOUT.BASE_MS + 2 * LOCKOUT.STEP_MS);
});

test("lockout penalty is capped at the maximum", () => {
  const result = attemptLogin({ count: 500, until: 0 }, 1000, false);
  assert.equal(result.lockedForMs, LOCKOUT.MAX_MS);
});

test("a locked account rejects even the correct password", () => {
  const locked = { count: 5, until: 5000 };
  const result = attemptLogin(locked, 2000, true);
  assert.equal(result.allowed, false);
  assert.equal(result.retryInMs, 3000);
});

test("the lock expires and a correct password resets the counter", () => {
  const locked = { count: 7, until: 5000 };
  const afterExpiry = attemptLogin(locked, 6000, true);
  assert.equal(afterExpiry.allowed, true);
  assert.deepEqual(afterExpiry.next, { count: 0, until: 0 });
});

test("a successful login clears the failure counter", () => {
  const result = attemptLogin({ count: 3, until: 0 }, 1000, true);
  assert.equal(result.allowed, true);
  assert.deepEqual(result.next, { count: 0, until: 0 });
});

test("lockoutRemainingMs reads the clock against the lock deadline", () => {
  const now = 1_000_000;
  assert.equal(lockoutRemainingMs(null, now), 0, "no record: not locked");
  assert.equal(lockoutRemainingMs({ count: 5, until: 0 }, now), 0, "zero deadline: not locked");
  assert.equal(lockoutRemainingMs({ count: 5, until: now - 1 }, now), 0, "expired: not locked");
  assert.equal(lockoutRemainingMs({ count: 5, until: now + 30_000 }, now), 30_000);
  assert.equal(lockoutRemainingMs({ count: 9, until: now + 90_000 }, now), 90_000);
});

/* ---------- attempts-remaining hint (behavioral, via attemptLogin) ---------- */

test("attempts-remaining is surfaced before the lock engages", () => {
  let record = null;
  for (let expected = 4; expected >= 1; expected -= 1) {
    const result = attemptLogin(record, 1000, false);
    assert.equal(result.attemptsRemaining, expected);
    record = result.next;
  }
  assert.equal(attemptLogin(record, 1000, false).lockedForMs > 0, true);
});

/* ---------- lockoutMessage ---------- */

test("lockoutMessage speaks in seconds then minutes", () => {
  assert.match(lockoutMessage(45_000), /seconds/);
  assert.match(lockoutMessage(120_000), /minute/);
  assert.match(lockoutMessage(1000), /1 second\.$/);
});
