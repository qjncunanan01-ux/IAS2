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
    return { allowed: true, next: { count, until: 0 } };
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
