// Tests for the password hashing utilities. password.js reads crypto from
// `window`, so a stub pointing at Node's built-in WebCrypto is installed
// before the dynamic import.

import assert from "node:assert/strict";
import { test } from "node:test";

globalThis.window = { crypto: globalThis.crypto };

const { hashPassword, verifyPassword } = await import("../js/utils/password.js");

test("hashPassword produces the sha256:salt:hash format", async () => {
  const stored = await hashPassword("s3cret!");
  const parts = stored.split(":");
  assert.equal(parts[0], "sha256");
  assert.equal(parts.length, 3);
  assert.equal(parts[1].length, 32, "16-byte salt as hex");
  assert.equal(parts[2].length, 64, "SHA-256 digest as hex");
});

test("hashPassword uses a unique salt per call", async () => {
  const a = await hashPassword("same-password");
  const b = await hashPassword("same-password");
  assert.notEqual(a, b, "same input yields different stored hashes");
});

test("verifyPassword accepts the correct password", async () => {
  const stored = await hashPassword("correct horse");
  const result = await verifyPassword("correct horse", stored);
  assert.equal(result.valid, true);
});

test("verifyPassword rejects a wrong password", async () => {
  const stored = await hashPassword("correct horse");
  const result = await verifyPassword("wrong horse", stored);
  assert.equal(result.valid, false);
});

test("verifyPassword upgrades legacy plaintext and the upgrade verifies", async () => {
  const result = await verifyPassword("admin123", "admin123");
  assert.equal(result.valid, true);
  assert.ok(result.upgrade?.startsWith("sha256:"), "hands back a hashed upgrade");
  const second = await verifyPassword("admin123", result.upgrade);
  assert.equal(second.valid, true, "the upgraded hash verifies cleanly");
  const wrong = await verifyPassword("nope", result.upgrade);
  assert.equal(wrong.valid, false);
});

test("verifyPassword handles malformed stored values without throwing", async () => {
  assert.equal((await verifyPassword("x", "sha256:onlysalt")).valid, false);
  assert.equal((await verifyPassword("x", "")).valid, false);
  assert.equal((await verifyPassword("x", null)).valid, false);
});
