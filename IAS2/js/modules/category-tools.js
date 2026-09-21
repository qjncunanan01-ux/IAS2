import { state } from "./state.js";
import { save } from "../utils/storage.js";
import { escapeHtml, escapeAttribute } from "../utils/helpers.js";
import { refreshIcons, focusFirstFocusable } from "../utils/helpers.js";
import { showToast, showError, showSuccess } from "../components/toast.js";
import { closeEntity } from "./modals.js";
import { render } from "./ui.js";

function modalLayer() {
  return document.querySelector("#entityModal");
}

export function createCategory(form = null) {
  // Called without a form: open the modal. Called with a form: save it.
  if (!form) {
    modalLayer().innerHTML = renderCategoryForm();
    modalLayer().classList.remove("hidden");
    refreshIcons();
    focusFirstFocusable(modalLayer());
    return;
  }

  const data = new FormData(form);
  const name = String(data.get("name")).trim();

  if (!name) {
    showError("Category name is required.");
    return;
  }

  if (state.items.some((item) => item.category.toLowerCase() === name.toLowerCase())) {
    showError("That category already exists.");
    return;
  }

  // Persist the category by creating a hidden seed item (categories are derived from items).
  state.items.push({
    id: `cat_${name.toLowerCase().replace(/\s+/g, "-")}`,
    name: `${name} (placeholder)`,
    category: name,
    price: 0,
    stock: 0,
    image: "assets/placeholder.svg",
    description: `Placeholder item for the ${name} category.`,
    active: false
  });
  save("items", state.items);
  closeEntity();
  showSuccess(`Category "${name}" created.`);
  render();
}

export function renameCategory(categoryName) {
  const item = state.items.find((candidate) => candidate.category === categoryName);
  if (!item) {
    showError("Category not found.");
    return;
  }

  modalLayer().innerHTML = renderCategoryForm(categoryName);
  modalLayer().classList.remove("hidden");
  refreshIcons();
  focusFirstFocusable(modalLayer());
}

export function submitRenameCategory(form) {
  const data = new FormData(form);
  const original = String(form.dataset.original || "");
  const next = String(data.get("name")).trim();

  if (!next) {
    showError("Category name is required.");
    return;
  }

  if (next.toLowerCase() === original.toLowerCase()) {
    closeEntity();
    return;
  }

  if (state.items.some((item) => item.category.toLowerCase() === next.toLowerCase())) {
    showError("That category already exists.");
    return;
  }

  state.items = state.items.map((item) =>
    item.category === original ? { ...item, category: next } : item
  );
  if (state.category === original) {
    state.category = next;
  }
  save("items", state.items);
  closeEntity();
  showSuccess(`Category renamed to "${next}".`);
  render();
}

export function deleteCategory(categoryName) {
  const itemsInCategory = state.items.filter((item) => item.category === categoryName);
  const activeItems = itemsInCategory.filter((item) => item.active);

  if (activeItems.length > 0) {
    showError(`Cannot delete "${categoryName}" — ${activeItems.length} active item${activeItems.length === 1 ? "" : "s"} still use it. Reassign or deactivate them first.`);
    return;
  }

  if (!confirm(`Delete the category "${categoryName}"? Inactive placeholder items will be removed.`)) {
    return;
  }

  state.items = state.items.filter((item) => item.category !== categoryName);
  save("items", state.items);
  if (state.category === categoryName) {
    state.category = "All";
  }
  showSuccess(`Category "${categoryName}" deleted.`);
  render();
}

function renderCategoryForm(originalName = "") {
  const isEditing = Boolean(originalName);
  return `
    <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="categoryFormTitle">
      <div class="modal-header">
        <div>
          <p class="eyebrow">Categories</p>
          <h2 id="categoryFormTitle">${isEditing ? "Rename Category" : "New Category"}</h2>
        </div>
        <button class="icon-button" type="button" data-action="close-entity" aria-label="Close category form">
          <i data-lucide="x"></i>
        </button>
      </div>
      <form class="form-grid" id="categoryForm" data-original="${escapeAttribute(originalName)}">
        <div class="field">
          <label for="categoryName">Category Name</label>
          <input id="categoryName" name="name" value="${escapeAttribute(originalName)}" required />
        </div>
        <button class="primary-button wide" type="submit">${isEditing ? "Rename" : "Create Category"}</button>
      </form>
    </div>
  `;
}
