import { state } from "./state.js";
import { save } from "../utils/storage.js?v=ff51bd7c";
import { createId, escapeHtml, escapeAttribute } from "../utils/helpers.js?v=7bbd16f9";
import { refreshIcons, focusFirstFocusable } from "../utils/helpers.js?v=7bbd16f9";
import { showToast, showError, showSuccess } from "../components/toast.js?v=083997a1";
import { closeEntity } from "./modals.js?v=266d3e8d";
import { isAdmin } from "./auth.js?v=aec43a94";
import { render } from "./ui.js?v=a2fcb8e6";
import { sanitizeText, sanitizeMultiline, validateName, validateMoney, validateQuantity, validateImagePath } from "../utils/security.js?v=fbf2cc5d";

let els = {};

export function initItemAdmin(elements) {
  els = elements;
}

// Action-level guard: the UI hides admin buttons from customers, but every
// entry point re-checks privilege so console-invoked calls cannot mutate data.
function requireAdmin() {
  if (!isAdmin()) {
    showError("Admin access required.");
    return false;
  }
  return true;
}

export function openItemForm(itemId = "") {
  if (!requireAdmin()) return;
  const item = state.items.find((candidate) => candidate.id === itemId);
  els.entityModal.innerHTML = renderItemForm(item || {});
  els.entityModal.classList.remove("hidden");
  refreshIcons();
  focusFirstFocusable(els.entityModal);
}

export function saveItem(form) {
  if (!requireAdmin()) return;
  const formId = form.dataset.id;
  const data = new FormData(form);

  // Server-grade input validation for a client-only app: every field is
  // sanitized, range-checked, and re-typed before it touches state.
  const nameCheck = validateName(data.get("name"));
  if (!nameCheck.ok) return showError(nameCheck.error);

  const category = sanitizeText(data.get("category"), 40);
  if (!category) return showError("Category is required.");

  const priceCheck = validateMoney(data.get("price"));
  if (!priceCheck.ok) return showError(priceCheck.error);

  const stockCheck = validateQuantity(data.get("stock"));
  if (!stockCheck.ok) return showError(stockCheck.error);

  const imageCheck = validateImagePath(data.get("image"));
  if (!imageCheck.ok) return showError(imageCheck.error);

  const description = sanitizeMultiline(data.get("description"), 400);
  if (!description) return showError("Description is required.");

  // "Audio" and "audio" are the same category: reuse the existing casing.
  const existingCategory = state.items.find((candidate) => candidate.category?.toLowerCase() === category.toLowerCase());

  const featured = data.get("featured") === "on";
  const item = {
    id: formId || createId("item"),
    name: nameCheck.value,
    category: existingCategory?.category || category,
    price: priceCheck.value,
    stock: stockCheck.value,
    image: imageCheck.value,
    description,
    active: String(data.get("active")) === "true",
    featured
  };

  // Only one featured product at a time: setting the flag clears it elsewhere.
  if (featured) {
    state.items = state.items.map((candidate) => (candidate.featured ? { ...candidate, featured: false } : candidate));
  }

  if (formId) {
    state.items = state.items.map((candidate) => (candidate.id === formId ? item : candidate));
  } else {
    state.items.push(item);
  }

  save("items", state.items);
  closeEntity();
  showSuccess("Item saved.");
  render();
}

export function deleteItem(itemId) {
  if (!requireAdmin()) return;
  const item = state.items.find((candidate) => candidate.id === itemId);
  if (!item) return;

  const usedInOrders = state.orders.some((order) => order.items.some((line) => line.itemId === itemId));
  if (usedInOrders) {
    showError("Items already used in orders stay in the records.");
    return;
  }

  state.items = state.items.filter((candidate) => candidate.id !== itemId);
  state.cart = state.cart.filter((line) => line.itemId !== itemId);
  save("items", state.items);
  save("cart", state.cart);
  showSuccess(`${item.name} deleted.`);
  render();
}

function renderItemForm(item = {}) {
  const isEditing = Boolean(item.id);
  return `
    <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="itemFormTitle">
      <div class="modal-header">
        <div>
          <p class="eyebrow">Items</p>
          <h2 id="itemFormTitle">${isEditing ? "Edit Item" : "New Item"}</h2>
        </div>
        <button class="icon-button" type="button" data-action="close-entity" aria-label="Close item form">
          <i data-lucide="x"></i>
        </button>
      </div>
      <form class="form-grid" id="itemForm" data-id="${escapeAttribute(item.id || "")}">
        <div class="field">
          <label for="itemName">Name</label>
          <input id="itemName" name="name" value="${escapeAttribute(item.name || "")}" required />
        </div>
        <div class="field split-field">
          <span>
            <label for="itemCategory">Category</label>
            <input id="itemCategory" name="category" value="${escapeAttribute(item.category || "")}" required />
          </span>
          <span>
            <label for="itemImage">Image Path</label>
            <input id="itemImage" name="image" value="${escapeAttribute(item.image || "assets/placeholder.svg")}" required />
          </span>
        </div>
        <div class="field split-field">
          <span>
            <label for="itemPrice">Price</label>
            <input id="itemPrice" name="price" type="number" min="0" step="1" value="${escapeAttribute(item.price ?? "")}" required />
          </span>
          <span>
            <label for="itemStock">Stock</label>
            <input id="itemStock" name="stock" type="number" min="0" step="1" value="${escapeAttribute(item.stock ?? "")}" required />
          </span>
        </div>
        <div class="field">
          <label for="itemDescription">Description</label>
          <textarea id="itemDescription" name="description" rows="3" required>${escapeHtml(item.description || "")}</textarea>
        </div>
        <div class="field">
          <label for="itemActive">Status</label>
          <select id="itemActive" name="active">
            <option value="true" ${item.active !== false ? "selected" : ""}>Active</option>
            <option value="false" ${item.active === false ? "selected" : ""}>Inactive</option>
          </select>
        </div>
        <label class="check-field" for="itemFeatured">
          <input id="itemFeatured" name="featured" type="checkbox" ${item.featured ? "checked" : ""} />
          <span>Featured product (shown in the shop hero banner)</span>
        </label>
        <button class="primary-button wide" type="submit">Save Item</button>
      </form>
    </div>
  `;
}
