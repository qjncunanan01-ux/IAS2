import { state } from "../modules/state.js";
import { save } from "../utils/storage.js";
import { createId, escapeHtml, escapeAttribute } from "../utils/helpers.js";
import { refreshIcons, focusFirstFocusable } from "../utils/helpers.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { validateEmail, validateName, validatePasswordPolicy, attemptLogin, lockoutMessage } from "../utils/security.js";
import { showToast, showError, showSuccess } from "../components/toast.js";
import { render } from "./ui.js";

/* ---------- login rate limiting (persisted per email) ---------- */

const LOCKOUT_PREFIX = "ias2.commerce.lockout.";

function getLockoutRecord(email) {
  try {
    const raw = localStorage.getItem(LOCKOUT_PREFIX + email);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setLockoutRecord(email, record) {
  try {
    if (record && (record.count > 0 || record.until > 0)) {
      localStorage.setItem(LOCKOUT_PREFIX + email, JSON.stringify(record));
    } else {
      localStorage.removeItem(LOCKOUT_PREFIX + email);
    }
  } catch {
    /* storage unavailable: the lockout simply does not persist */
  }
}

// Record a failed attempt and return how long (if at all) the account is
// now locked. The state machine lives in utils/security.js (pure, tested).
function registerFailedAttempt(email) {
  const fail = attemptLogin(getLockoutRecord(email), Date.now(), false);
  setLockoutRecord(email, fail.next);
  return fail.lockedForMs || 0;
}

let els = {};

export function initAuth(elements) {
  els = elements;
}

export function getCurrentUser() {
  return state.users.find((user) => user.id === state.currentUserId) || null;
}

export function isAdmin() {
  return getCurrentUser()?.role === "admin";
}

export function ensureCurrentUserExists() {
  if (state.currentUserId && !getCurrentUser()) {
    state.currentUserId = "";
    localStorage.removeItem("ias2.commerce.currentUserId");
  }
}

export function wouldRemoveLastAdmin(userId, nextRole) {
  return state.users.filter((user) => (user.id === userId ? nextRole : user.role) === "admin").length === 0;
}

export function openAuth(mode = "login") {
  state.authMode = mode;
  renderAuthForm();
  els.authModal?.classList.remove("hidden");
  focusFirstFocusable(els.authModal);
}

export function closeAuth() {
  els.authModal?.classList.add("hidden");
}

export function renderAuthForm() {
  const isRegister = state.authMode === "register";
  
  if (els.authTitle) els.authTitle.textContent = isRegister ? "Register" : "Login";
  if (els.authEyebrow) els.authEyebrow.textContent = isRegister ? "New Account" : "Account";

  document.querySelectorAll("[data-action='switch-auth']").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === state.authMode);
  });

  if (els.authForm) {
    els.authForm.innerHTML = `
      ${isRegister ? `
        <div class="field">
          <label for="authName">Name</label>
          <input id="authName" name="name" autocomplete="name" required />
        </div>
      ` : ""}      <div class="field">
          <label for="authEmail">Email</label>
          <input id="authEmail" name="email" type="email" autocomplete="email" maxlength="120" required />
        </div>
      <div class="field">
          <label for="authPassword">Password</label>
          <input id="authPassword" name="password" type="password" minlength="8" maxlength="128" autocomplete="${isRegister ? "new-password" : "current-password"}" required />
        </div>
      <button class="primary-button wide" type="submit">${isRegister ? "Create Account" : "Login"}</button>
    `;
    refreshIcons();
  }
}

export async function login(form) {
  const data = new FormData(form);
  const emailCheck = validateEmail(data.get("email"));
  const password = String(data.get("password") ?? "");

  // Format checks first: they leak nothing about which accounts exist.
  if (!emailCheck.ok) {
    showError(emailCheck.error);
    return;
  }
  if (!password) {
    showError("Enter your password.");
    return;
  }
  // NOTE: the password policy is deliberately NOT enforced here — legacy
  // accounts (like the demo seeds) may predate it. The policy guards new
  // credentials at registration and admin creation only.
  const email = emailCheck.value;

  // Lockout gate: while locked, even a correct password is rejected.
  const now = Date.now();
  const gate = attemptLogin(getLockoutRecord(email), now, false);
  if (!gate.allowed) {
    showError(lockoutMessage(gate.retryInMs));
    return;
  }

  const user = state.users.find((candidate) => candidate.email.toLowerCase() === email);
  // Both branches wait on the same SHA-256 work, so response timing does not
  // reveal whether the email exists.
  const result = user
    ? await verifyPassword(password, user.password)
    : await verifyPassword(password, "sha256:00000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000");

  if (!result.valid) {
    const lockedFor = registerFailedAttempt(email);
    showError(lockedFor ? lockoutMessage(lockedFor) : "Email or password did not match.");
    return;
  }

  setLockoutRecord(email, { count: 0, until: 0 });

  // Transparent upgrade: legacy plaintext seed accounts are hashed on first login.
  if (result.upgrade) {
    user.password = result.upgrade;
    save("users", state.users);
  }

  state.currentUserId = user.id;
  localStorage.setItem("ias2.commerce.currentUserId", user.id);
  closeAuth();
  showSuccess(`Welcome, ${user.name}.`);
  render();
}

export async function register(form) {
  const data = new FormData(form);
  const nameCheck = validateName(data.get("name"));
  const emailCheck = validateEmail(data.get("email"));
  const passwordCheck = validatePasswordPolicy(data.get("password"));

  if (!nameCheck.ok) {
    showError(nameCheck.error);
    return;
  }
  if (!emailCheck.ok) {
    showError(emailCheck.error);
    return;
  }
  if (!passwordCheck.ok) {
    showError(passwordCheck.error);
    return;
  }

  const email = emailCheck.value;
  if (state.users.some((user) => user.email.toLowerCase() === email)) {
    // Deliberately generic: saying "already registered" would let attackers
    // enumerate which emails hold accounts.
    showError("Email or password did not match.");
    return;
  }

  const user = {
    id: createId("user"),
    name: nameCheck.value,
    email,
    password: await hashPassword(passwordCheck.value),
    role: "user",
    createdAt: new Date().toISOString()
  };
  
  state.users.push(user);
  save("users", state.users);
  state.currentUserId = user.id;
  localStorage.setItem("ias2.commerce.currentUserId", user.id);
  closeAuth();
  showSuccess("Account created.");
  render();
}

export function logout() {
  state.currentUserId = "";
  localStorage.removeItem("ias2.commerce.currentUserId");
  if (state.view === "admin" || state.view === "orders") {
    state.view = "shop";
  }
  showToast("Logged out.");
  render();
}
