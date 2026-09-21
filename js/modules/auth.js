import { state } from "../modules/state.js";
import { save } from "../utils/storage.js";
import { createId, escapeHtml, escapeAttribute } from "../utils/helpers.js";
import { refreshIcons, focusFirstFocusable } from "../utils/helpers.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { showToast, showError, showSuccess } from "../components/toast.js";
import { render } from "./ui.js";

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
      ` : ""}
      <div class="field">
        <label for="authEmail">Email</label>
        <input id="authEmail" name="email" type="email" autocomplete="email" required />
      </div>
      <div class="field">
        <label for="authPassword">Password</label>
        <input id="authPassword" name="password" type="password" autocomplete="${isRegister ? "new-password" : "current-password"}" required />
      </div>
      <button class="primary-button wide" type="submit">${isRegister ? "Create Account" : "Login"}</button>
    `;
    refreshIcons();
  }
}

export async function login(form) {
  const data = new FormData(form);
  const email = String(data.get("email")).trim().toLowerCase();
  const password = String(data.get("password"));
  const user = state.users.find((candidate) => candidate.email.toLowerCase() === email);

  if (!user) {
    showError("Email or password did not match.");
    return;
  }

  const result = await verifyPassword(password, user.password);
  if (!result.valid) {
    showError("Email or password did not match.");
    return;
  }

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
  const name = String(data.get("name")).trim();
  const email = String(data.get("email")).trim().toLowerCase();
  const password = String(data.get("password"));

  if (state.users.some((user) => user.email.toLowerCase() === email)) {
    showError("That email is already registered.");
    return;
  }

  const user = {
    id: createId("user"),
    name,
    email,
    password: await hashPassword(password),
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
