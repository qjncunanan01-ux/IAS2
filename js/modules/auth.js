import { state } from "../modules/state.js";
import { save } from "../utils/storage.js?v=ff51bd7c";
import { createId, escapeHtml, escapeAttribute } from "../utils/helpers.js?v=7bbd16f9";
import { refreshIcons, focusFirstFocusable } from "../utils/helpers.js?v=7bbd16f9";
import { hashPassword, verifyPassword } from "../utils/password.js?v=b7f20d0b";
import { validateEmail, validateName, validatePasswordPolicy, attemptLogin, lockoutMessage, lockoutRemainingMs, formatCountdown, sessionExpired, LAST_ACTIVITY_KEY } from "../utils/security.js?v=fbf2cc5d";
import { resetSessionActivity } from "./session.js?v=f0f02091";
import { rearmSession } from "./session.js?v=f0f02091";
import { showToast, showError, showSuccess, showInfo } from "../components/toast.js?v=083997a1";
import { render } from "./ui.js?v=a2fcb8e6";

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

// NOTE: failed attempts are recorded inline in login() so the remaining-
// attempts count can be surfaced to the user in the same pass.

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

// Session-expiry check on boot: a persisted login from a previous visit is
// only honored if the last recorded activity is inside the timeout window.
export function enforceSessionExpiry() {
  if (!state.currentUserId) return;
  const raw = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || "0");
  if (raw && sessionExpired(raw, Date.now())) {
    state.currentUserId = "";
    localStorage.removeItem("ias2.commerce.currentUserId");
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    showToast("Session expired. Please log in again.", "warning");
  }
}

export function touchSession() {
  // Also refresh the session module's idle clock on every render, and keep
  // the persisted timestamp exact (renders are infrequent, no throttle here).
  resetSessionActivity();
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  } catch {
    /* storage unavailable: session expiry just won't persist */
  }
}

export function wouldRemoveLastAdmin(userId, nextRole) {
  return state.users.filter((user) => (user.id === userId ? nextRole : user.role) === "admin").length === 0;
}

// Housekeeping: drop lockout records that expired over a day ago (or are
// corrupt) so failed-login artifacts don't accumulate forever.
function sweepLockouts() {
  try {
    const now = Date.now();
    Object.keys(localStorage)
      .filter((key) => key.startsWith(LOCKOUT_PREFIX))
      .forEach((key) => {
        try {
          const record = JSON.parse(localStorage.getItem(key));
          if (!record || (record.until && now - record.until > 24 * 60 * 60_000)) {
            localStorage.removeItem(key);
          }
        } catch {
          localStorage.removeItem(key);
        }
      });
  } catch {
    /* storage unavailable */
  }
}

/* ---------- in-form lockout banner ---------- */

const BANNER_ID = "authLockoutBanner";
let lockoutTimerId = null;
let lastPrefillEmail = "";

function stopLockoutCountdown() {
  if (lockoutTimerId) {
    clearInterval(lockoutTimerId);
    lockoutTimerId = null;
  }
}

// Renders (or removes) the in-form lockout banner for the given email and
// keeps a live countdown running; the submit button stays disabled until the
// lock lifts, then the form re-enables itself without losing typed input.
function updateLockoutBanner(email) {
  const form = els.authForm;
  if (!form) return;
  const remaining = email ? lockoutRemainingMs(getLockoutRecord(email), Date.now()) : 0;

  if (remaining <= 0) {
    document.getElementById(BANNER_ID)?.remove();
    stopLockoutCountdown();
    const submit = form.querySelector('[type="submit"]');
    if (submit) {
      submit.removeAttribute("disabled");
      submit.textContent = state.authMode === "register" ? "Create Account" : "Login";
    }
    return;
  }

  // Locked: disable the button and show the persistent in-form notice.
  const submit = form.querySelector('[type="submit"]');
  if (submit) {
    submit.setAttribute("disabled", "");
    submit.textContent = "Locked";
  }
  let banner = document.getElementById(BANNER_ID);
  if (!banner) {
    banner = createLockoutBanner();
    form.prepend(banner);
  }
  banner.querySelector(".lockout-message").textContent =
    "Too many failed attempts. For your security, login is paused for this account.";

  const tick = () => {
    const msLeft = lockoutRemainingMs(getLockoutRecord(email), Date.now());
    if (msLeft <= 0) {
      stopLockoutCountdown();
      banner.remove();
      const submit = form.querySelector('[type="submit"]');
      if (submit) {
        submit.removeAttribute("disabled");
        submit.textContent = state.authMode === "register" ? "Create Account" : "Login";
      }
      showInfo("Login unlocked — you can try again.");
      return;
    }
    const label = banner.querySelector(".lockout-count");
    if (label) label.textContent = formatCountdown(msLeft);
  };
  tick();
  stopLockoutCountdown();
  lockoutTimerId = setInterval(tick, 1000);
}

function createLockoutBanner() {
  const banner = document.createElement("div");
  banner.id = BANNER_ID;
  banner.className = "lockout-banner";
  banner.setAttribute("role", "alert");
  banner.innerHTML = `
    <div class="lockout-head"><i data-lucide="lock"></i><strong>Account temporarily locked</strong></div>
    <p class="lockout-message"></p>
    <p class="lockout-timer">You can try again in <strong class="lockout-count">--:--</strong></p>
  `;
  return banner;
}

/* ---------- attempts-remaining inline hint ---------- */

function setAttemptHint(remaining) {
  const form = els.authForm;
  if (!form) return;
  let hint = document.getElementById("authAttemptHint");
  if (!hint) {
    hint = document.createElement("p");
    hint.id = "authAttemptHint";
    hint.className = "attempt-hint";
    hint.setAttribute("role", "status");
    form.prepend(hint);
  }
  hint.textContent = `Warning: ${remaining} attempt${remaining === 1 ? "" : "s"} remaining before a temporary lock.`;
}

function clearAttemptHint() {
  document.getElementById("authAttemptHint")?.remove();
}

export function openAuth(mode = "login", prefillEmail = "") {
  sweepLockouts();
  state.authMode = mode;
  // Remember the last attempted email so reopening the form shows the right
  // account's lockout countdown immediately.
  const effectiveEmail = prefillEmail || lastPrefillEmail;
  lastPrefillEmail = effectiveEmail;
  renderAuthForm();
  if (effectiveEmail) {
    const emailInput = els.authForm?.querySelector("#authEmail");
    if (emailInput) emailInput.value = effectiveEmail;
  }
  clearAttemptHint();
  updateLockoutBanner(effectiveEmail);
  els.authModal?.classList.remove("hidden");
  refreshIcons();
  focusFirstFocusable(els.authModal);
}

export function closeAuth() {
  stopLockoutCountdown();
  document.getElementById(BANNER_ID)?.remove();
  clearAttemptHint();
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
  // Remember the attempted account so the in-form lockout notice and its
  // countdown reappear if the modal is closed and reopened mid-lock.
  lastPrefillEmail = email;

  // Lockout gate: while locked, even a correct password is rejected.
  const now = Date.now();
  const gate = attemptLogin(getLockoutRecord(email), now, false);
  if (!gate.allowed) {
    showError(lockoutMessage(gate.retryInMs));
    updateLockoutBanner(email);
    return;
  }

  const user = state.users.find((candidate) => candidate.email.toLowerCase() === email);
  // Both branches wait on the same SHA-256 work, so response timing does not
  // reveal whether the email exists.
  const result = user
    ? await verifyPassword(password, user.password)
    : await verifyPassword(password, "sha256:00000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000");

  if (!result.valid) {
    const fail = attemptLogin(getLockoutRecord(email), Date.now(), false);
    setLockoutRecord(email, fail.next);
    const remaining = fail.attemptsRemaining;
    showError(
      fail.lockedForMs
        ? lockoutMessage(fail.lockedForMs)
        : remaining <= 2
          ? `Email or password did not match. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
          : "Email or password did not match."
    );
    if (fail.lockedForMs) {
      clearAttemptHint();
      updateLockoutBanner(email);
    } else if (remaining <= 2) {
      setAttemptHint(remaining);
    }
    return;
  }

  lastPrefillEmail = "";
  clearAttemptHint();
  setLockoutRecord(email, { count: 0, until: 0 });
  touchSession();
  rearmSession();

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
  touchSession();
  rearmSession();
  closeAuth();
  showSuccess("Account created.");
  render();
}

export function logout(message = "Logged out.") {
  state.currentUserId = "";
  localStorage.removeItem("ias2.commerce.currentUserId");
  localStorage.removeItem(LAST_ACTIVITY_KEY);
  if (state.view === "admin" || state.view === "orders") {
    state.view = "shop";
  }
  showToast(message, message.includes("expired") ? "warning" : "info");
  render();
}
