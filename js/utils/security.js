// Central security utilities: input validation, sanitization, and the
// login rate-limiting (lockout) state machine. Everything here is pure —
// no DOM, no storage — so it is fully unit-testable (tests/security.test.js).

/* ---------- text sanitization ---------- */

// Strip control characters, collapse newlines, trim, and hard-cap length.
// Used on every free-text field before it is stored or rendered.
export function sanitizeText(value, maxLength = 200) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

// Multi-line variant (addresses, descriptions): keeps line breaks,
// still strips control characters and caps length.
export function sanitizeMultiline(value, maxLength = 500) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, 8)
    .join("\n")
    .slice(0, maxLength);
}

/* ---------- field validators ---------- */

export function validateName(value, { min = 2, max = 80 } = {}) {
  const name = sanitizeText(value, max);
  if (name.length < min) return { ok: false, error: `Name must be at least ${min} characters.` };
  return { ok: true, value: name };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(value) {
  const email = sanitizeText(value, 120).toLowerCase();
  if (!email) return { ok: false, error: "Email is required." };
  if (email.length > 120 || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  return { ok: true, value: email };
}

// Demo-grade policy: length plus basic character-class requirements.
export function validatePasswordPolicy(password, { min = 8, max = 128 } = {}) {
  const value = String(password ?? "");
  if (value.length < min) return { ok: false, error: `Password must be at least ${min} characters.` };
  if (value.length > max) return { ok: false, error: `Password must be at most ${max} characters.` };
  if (!/[a-z]/.test(value)) return { ok: false, error: "Password needs a lowercase letter." };
  if (!/[A-Z]/.test(value)) return { ok: false, error: "Password needs an uppercase letter." };
  if (!/[0-9]/.test(value)) return { ok: false, error: "Password needs a number." };
  return { ok: true, value };
}

export function validateMoney(value, { min = 0, max = 10_000_000 } = {}) {
  const price = Number(value);
  if (!Number.isFinite(price)) return { ok: false, error: "Price must be a number." };
  if (price < min) return { ok: false, error: `Price cannot be below ${min}.` };
  if (price > max) return { ok: false, error: `Price cannot exceed ${max}.` };
  return { ok: true, value: Math.round(price * 100) / 100 };
}

export function validateQuantity(value, { min = 0, max = 100_000 } = {}) {
  const qty = Math.floor(Number(value));
  if (!Number.isFinite(qty)) return { ok: false, error: "Quantity must be a number." };
  if (qty < min) return { ok: false, error: `Quantity cannot be below ${min}.` };
  if (qty > max) return { ok: false, error: `Quantity cannot exceed ${max}.` };
  return { ok: true, value: qty };
}

// Image paths must stay inside the app: relative, no protocol, no traversal,
// no query strings — blocks "../", "javascript:", and remote-URL tricks.
export function validateImagePath(value) {
  const path = sanitizeText(value, 200);
  if (!path) return { ok: false, error: "Image path is required." };
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path) || path.startsWith("//")) {
    return { ok: false, error: "Image must be a local path (no URLs)." };
  }
  if (path.includes("..") || path.includes("\\") || path.includes("?") || path.includes("#")) {
    return { ok: false, error: "Image path contains forbidden characters." };
  }
  if (!/^[\w./-]+\.(svg|png|jpe?g|webp|gif|avif)$/i.test(path)) {
    return { ok: false, error: "Image path must point to an image file." };
  }
  return { ok: true, value: path };
}

/* ---------- login rate limiting ---------- */

export const LOCKOUT = {
  MAX_ATTEMPTS: 5,
  BASE_MS: 30_000,      // 30s after 5 fails…
  STEP_MS: 30_000,      // …+30s per additional fail…
  MAX_MS: 15 * 60_000   // …capped at 15 minutes
};

// Pure state machine: given the stored record and the current time, return
// the next record and whether the attempt is allowed.
export function attemptLogin(record, now, passwordOk, config = LOCKOUT) {
  const current = record || { count: 0, until: 0 };
  if (now < current.until) {
    return { allowed: false, retryInMs: current.until - now, next: current };
  }
  if (passwordOk) {
    return { allowed: true, next: { count: 0, until: 0 } };
  }
  const count = current.count + 1;
  if (count < config.MAX_ATTEMPTS) {
    return { allowed: true, next: { count, until: 0 }, attemptsRemaining: config.MAX_ATTEMPTS - count };
  }
  const over = count - config.MAX_ATTEMPTS + 1;
  const penalty = Math.min(config.BASE_MS + (over - 1) * config.STEP_MS, config.MAX_MS);
  return { allowed: true, next: { count, until: now + penalty }, lockedForMs: penalty };
}

export function lockoutMessage(retryInMs) {
  const seconds = Math.ceil(retryInMs / 1000);
  if (seconds >= 60) {
    const minutes = Math.ceil(seconds / 60);
    return `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }
  return `Too many failed attempts. Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`;
}

/* ---------- import validation (fail-closed) ---------- */
// (session helpers live at the bottom of this file)

// Each sanitizer returns a cleaned copy of the imported collection, or null
// if ANY record is malformed — the whole import is then rejected so corrupt
// data can never be half-written into the store.

export function sanitizeImportedUsers(rows) {
  if (!Array.isArray(rows)) return null;
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const id = typeof row.id === "string" && row.id.trim() ? row.id.slice(0, 60) : "";
    const email = validateEmail(row.email);
    const name = validateName(row.name ?? email.value ?? "");
    const password = String(row.password ?? "");
    if (!id || !email.ok || !name.ok || !password || password.length > 200) return null;
    out.push({
      id,
      name: name.value,
      email: email.value,
      password,
      role: row.role === "admin" ? "admin" : "user",
      createdAt: typeof row.createdAt === "string" ? row.createdAt.slice(0, 40) : new Date().toISOString()
    });
  }
  return out;
}

export function sanitizeImportedItems(rows) {
  if (!Array.isArray(rows)) return null;
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const id = typeof row.id === "string" && row.id.trim() ? row.id.slice(0, 60) : "";
    const name = validateName(row.name ?? "");
    const price = validateMoney(row.price ?? 0);
    const stock = validateQuantity(row.stock ?? 0);
    const image = validateImagePath(row.image || "assets/placeholder.svg");
    if (!id || !name.ok || !price.ok || !stock.ok || !image.ok) return null;
    out.push({
      id,
      name: name.value,
      category: sanitizeText(row.category, 40) || "Uncategorized",
      price: price.value,
      stock: stock.value,
      image: image.value,
      description: sanitizeMultiline(row.description, 400) || name.value,
      active: row.active !== false,
      featured: Boolean(row.featured)
    });
  }
  return out;
}

const ORDER_STATUSES = ["Processing", "Paid", "Completed", "Cancelled"];

export function sanitizeImportedOrders(rows) {
  if (!Array.isArray(rows)) return null;
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const id = typeof row.id === "string" && row.id.trim() ? row.id.slice(0, 60) : "";
    if (!id) return null;
    if (!Array.isArray(row.items)) return null;
    const items = [];
    for (const line of row.items) {
      if (!line || typeof line !== "object" || Array.isArray(line)) return null;
      const price = Number(line.price);
      const qty = Math.floor(Number(line.qty));
      if (!Number.isFinite(price) || price < 0 || !Number.isFinite(qty) || qty < 1) return null;
      items.push({
        itemId: String(line.itemId ?? "").slice(0, 60),
        name: sanitizeText(line.name, 120),
        price: Math.round(price * 100) / 100,
        qty
      });
    }
    const total = items.reduce((sum, line) => sum + line.price * line.qty, 0);
    out.push({
      id,
      userId: typeof row.userId === "string" ? row.userId.slice(0, 60) : "",
      customerName: sanitizeText(row.customerName, 80),
      address: sanitizeMultiline(row.address, 300),
      paymentMethod: sanitizeText(row.paymentMethod, 30) || "Unknown",
      paymentReference: sanitizeText(row.paymentReference, 40),
      status: ORDER_STATUSES.includes(row.status) ? row.status : "Processing",
      createdAt: typeof row.createdAt === "string" ? row.createdAt.slice(0, 40) : new Date().toISOString(),
      items,
      // Always derived from the validated lines: a tampered envelope total
      // (inflated or negative) can never survive an import.
      total: Math.round(total * 100) / 100
    });
  }
  return out;
}

export function sanitizeImportedCart(rows) {
  if (!Array.isArray(rows)) return null;
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    if (typeof row.itemId !== "string" || !row.itemId.trim()) return null;
    const qty = Math.floor(Number(row.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > 1000) return null;
    out.push({ itemId: row.itemId.slice(0, 60), qty });
  }
  return out;
}

export function sanitizeImportedWishlist(rows) {
  if (!Array.isArray(rows)) return null;
  const out = [];
  for (const row of rows) {
    if (typeof row !== "string") return null;
    const id = row.trim().slice(0, 60);
    if (!id) return null;
    out.push(id);
  }
  return out;
}

/* ---------- session inactivity ---------- */

export const SESSION_TIMEOUT_MS = 15 * 60_000;
export const SESSION_WARN_MS = 60_000;
export const LAST_ACTIVITY_KEY = "ias2.commerce.lastActivity";

export function sessionExpired(lastActivity, now, timeoutMs = SESSION_TIMEOUT_MS) {
  return now - lastActivity >= timeoutMs;
}

export function shouldWarnSession(lastActivity, now, timeoutMs = SESSION_TIMEOUT_MS, warnMs = SESSION_WARN_MS) {
  const remaining = timeoutMs - (now - lastActivity);
  return remaining > 0 && remaining <= warnMs;
}

// Countdown for the warning banner: "1:00", "0:45", "0:03".
export function formatCountdown(msRemaining) {
  const seconds = Math.max(0, Math.ceil(msRemaining / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}
