import { state } from "./state.js";
import { save } from "../utils/storage.js";
import { createId, escapeHtml, escapeAttribute } from "../utils/helpers.js";
import { refreshIcons, focusFirstFocusable } from "../utils/helpers.js";
import { showToast, showError, showSuccess } from "../components/toast.js";
import { closeEntity } from "./modals.js";
import { render } from "./ui.js";

let els = {};

export function initItemAdmin(elements) {
  els = elements;
}

export function openItemForm(itemId = "") {
  const item = state.items.find((candidate) => candidate.id === itemId);
  els.entityModal.innerHTML = renderItemForm(item || {});
  els.entityModal.classList.remove("hidden");
  refreshIcons();
  focusFirstFocusable(els.entityModal);
}

export function saveItem(form) {
  const formId = form.dataset.id;
  const data = new FormData(form);
  const item = {
    id: formId || createId("item"),
    name: String(data.get("name")).trim(),
    category: String(data.get("category")).trim(),
    price: Number(data.get("price")),
    stock: Number(data.get("stock")),
    image: String(data.get("image")).trim(),
    description: String(data.get("description")).trim(),
    active: String(data.get("active")) === "true"
  };

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
        <button class="primary-button wide" type="submit">Save Item</button>
      </form>
    </div>
  `;
}
