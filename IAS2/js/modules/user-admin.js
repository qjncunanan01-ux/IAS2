import { state } from "./state.js";
import { save } from "../utils/storage.js";
import { createId, escapeHtml, escapeAttribute } from "../utils/helpers.js";
import { refreshIcons, focusFirstFocusable } from "../utils/helpers.js";
import { showToast, showError, showSuccess } from "../components/toast.js";
import { closeEntity } from "./modals.js";
import { wouldRemoveLastAdmin } from "./auth.js";
import { render } from "./ui.js";
import { hashPassword } from "../utils/password.js";

let els = {};

export function initUserAdmin(elements) {
  els = elements;
}

export function openUserForm(userId = "") {
  const user = state.users.find((candidate) => candidate.id === userId);
  els.entityModal.innerHTML = renderUserForm(user || {});
  els.entityModal.classList.remove("hidden");
  refreshIcons();
  focusFirstFocusable(els.entityModal);
}

export async function saveUser(form) {
  const formId = form.dataset.id;
  const data = new FormData(form);
  const email = String(data.get("email")).trim().toLowerCase();
  const existingUser = formId ? state.users.find((candidate) => candidate.id === formId) : null;
  const passwordInput = String(data.get("password") ?? "");

  const duplicate = state.users.find((user) => user.email.toLowerCase() === email && user.id !== formId);
  if (duplicate) {
    showError("That email is already registered.");
    return;
  }

  // Blank password field on edit keeps the existing credential.
  if (!existingUser && !passwordInput) {
    showError("A password is required for new users.");
    return;
  }

  const password = passwordInput
    ? await hashPassword(passwordInput)
    : existingUser.password;

  const user = {
    id: formId || createId("user"),
    name: String(data.get("name")).trim(),
    email,
    password,
    role: String(data.get("role")),
    createdAt: existingUser?.createdAt || new Date().toISOString()
  };

  if (formId && wouldRemoveLastAdmin(formId, user.role)) {
    showError("At least one admin account is required.");
    return;
  }

  if (formId) {
    state.users = state.users.map((candidate) => (candidate.id === formId ? user : candidate));
  } else {
    state.users.push(user);
  }

  save("users", state.users);
  closeEntity();
  showSuccess("User saved.");
  render();
}

export function deleteUser(userId) {
  const currentUser = state.users.find(user => user.id === state.currentUserId);
  const user = state.users.find((candidate) => candidate.id === userId);
  if (!user) return;

  if (currentUser?.id === userId) {
    showError("The logged-in account cannot be deleted.");
    return;
  }

  if (wouldRemoveLastAdmin(userId, "user")) {
    showError("At least one admin account is required.");
    return;
  }

  state.users = state.users.filter((candidate) => candidate.id !== userId);
  state.orders = state.orders.map((order) => (order.userId === userId ? { ...order, userId: "", customerName: user.name } : order));
  save("users", state.users);
  save("orders", state.orders);
  showSuccess(`${user.name} deleted.`);
  render();
}

function renderUserForm(user = {}) {
  const isEditing = Boolean(user.id);
  return `
    <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="userFormTitle">
      <div class="modal-header">
        <div>
          <p class="eyebrow">Users</p>
          <h2 id="userFormTitle">${isEditing ? "Edit User" : "New User"}</h2>
        </div>
        <button class="icon-button" type="button" data-action="close-entity" aria-label="Close user form">
          <i data-lucide="x"></i>
        </button>
      </div>
      <form class="form-grid" id="userForm" data-id="${escapeAttribute(user.id || "")}">
        <div class="field">
          <label for="userName">Name</label>
          <input id="userName" name="name" value="${escapeAttribute(user.name || "")}" required />
        </div>
        <div class="field">
          <label for="userEmail">Email</label>
          <input id="userEmail" name="email" type="email" value="${escapeAttribute(user.email || "")}" required />
        </div>
        <div class="field split-field">
          <span>
            <label for="userPassword">Password${isEditing ? " (leave blank to keep)" : ""}</label>
            <input id="userPassword" name="password" type="password" ${isEditing ? "" : "required"} placeholder="${isEditing ? "••••••••" : "Set a password"}" autocomplete="new-password" />
          </span>
          <span>
            <label for="userRole">Role</label>
            <select id="userRole" name="role">
              <option value="user" ${user.role !== "admin" ? "selected" : ""}>User</option>
              <option value="admin" ${user.role === "admin" ? "selected" : ""}>Admin</option>
            </select>
          </span>
        </div>
        <button class="primary-button wide" type="submit">Save User</button>
      </form>
    </div>
  `;
}
