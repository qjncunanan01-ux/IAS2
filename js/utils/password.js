// Password hashing via Web Crypto (SHA-256 + per-user random salt).
// Stored format: "sha256:<salt-hex>:<hash-hex>".
// Legacy plaintext values are verified directly and upgraded on next login.
// NOTE: client-side hashing is still demo-grade — a real backend is required
// for actual security (see README).

const SALT_BYTES = 16;

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomSalt() {
  if (window.crypto?.getRandomValues) {
    return toHex(window.crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
  }
  return Math.random().toString(16).slice(2, 2 + SALT_BYTES * 2);
}

async function sha256(text) {
  const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return toHex(digest);
}

function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

export async function hashPassword(password) {
  if (!window.crypto?.subtle) {
    // Very old/insecure context fallback: keep the app working, flag it plainly.
    return `plain:${password}`;
  }
  const salt = randomSalt();
  const hash = await sha256(`${salt}:${password}`);
  return `sha256:${salt}:${hash}`;
}

export async function verifyPassword(password, stored) {
  const value = String(stored ?? "");

  if (value.startsWith("sha256:")) {
    const [, salt, hash] = value.split(":");
    if (!salt || !hash) return { valid: false };
    const candidate = await sha256(`${salt}:${password}`);
    return { valid: constantTimeEqual(candidate, hash) };
  }

  if (value.startsWith("plain:")) {
    return { valid: password === value.slice(6) };
  }

  // Legacy plaintext seed value: verify, and hand back an upgrade to persist.
  if (password === value) {
    return { valid: true, upgrade: await hashPassword(password) };
  }

  return { valid: false };
}
