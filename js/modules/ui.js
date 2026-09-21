import { state } from "./state.js";
import { escapeHtml, escapeAttribute, formatMoney, formatDate } from "../utils/helpers.js";
import { refreshIcons, focusFirstFocusable, debounce } from "../utils/helpers.js";
import { showToast, showError, showSuccess, showWarning } from "../components/toast.js";
import { renderEmptyState, renderLockedState, renderOrderCard } from "../components/render-helpers.js";
import { getCurrentUser, isAdmin, ensureCurrentUserExists } from "./auth.js";
import { openAuth, closeAuth, login, register, logout } from "./auth.js";
import { openCart, closeCart, renderCart, addToCart, changeCartQty, removeFromCart } from "./cart.js";
import { applyTheme, toggleTheme } from "./theme.js";
import { openItemForm, saveItem, deleteItem } from "./item-admin.js";
import { openUserForm, saveUser, deleteUser } from "./user-admin.js";
import {
  openOrderForm,
  saveOrder,
  deleteOrder,
  openOrderDetail,
  closeOrderDetail,
  updateOrderStatus
} from "./order-admin.js";
import { openCheckout, closeCheckout, placeCheckoutOrder } from "./checkout.js";
import { closeEntity } from "./modals.js";
import { openQuickView, closeQuickView } from "./quick-view.js";
import { toggleWishlist, isInWishlist } from "./wishlist.js";
import { openDataTools, closeDataTools, handleExport, handleImport, handleClearAll } from "./data-tools.js";
import { createCategory, renameCategory, deleteCategory, submitRenameCategory } from "./category-tools.js";
import { renderProductCard } from "../components/render-helpers.js";

let els = {};

export function cacheElements(elements) {
  els = elements;
}

export function bindEvents() {
  document.body.addEventListener("click", handleClick);
  document.body.addEventListener("submit", handleSubmit);
  document.body.addEventListener("change", handleChange);

  const runShopSearch = debounce(() => renderShop(), 180);
  els.searchInput?.addEventListener("input", (event) => {
    state.search = event.target.value.trim();
    runShopSearch();
  });
}

function clearSearch() {
  state.search = "";
  if (els.searchInput) {
    els.searchInput.value = "";
    els.searchInput.focus();
  }
  renderShop();
}

function updateSearchClear() {
  const clearButton = document.querySelector(".search-clear");
  if (clearButton) {
    clearButton.classList.toggle("hidden", !state.search);
  }
}

function handleClick(event) {
  // Click on a modal's dimmed backdrop (not its panel) dismisses that modal.
  // Static-content modals (auth/checkout) are only hidden; dynamic layers are
  // also cleared so they never hold stale content for their next open.
  if (event.target.classList?.contains("modal-layer")) {
    const staticLayers = ["authModal", "checkoutModal"];
    if (!staticLayers.includes(event.target.id)) {
      event.target.innerHTML = "";
    }
    event.target.classList.add("hidden");
    return;
  }

  const actionTarget = event.target.closest("[data-action]");
  const viewTarget = event.target.closest("[data-view]");
  const adminTarget = event.target.closest("[data-admin-tab]");

  if (viewTarget) {
    setView(viewTarget.dataset.view);
    return;
  }

  if (adminTarget) {
    state.adminTab = adminTarget.dataset.adminTab;
    render();
    return;
  }

  if (!actionTarget) return;

  const { action, id, mode } = actionTarget.dataset;

  const actions = {
    "go-shop": () => setView("shop"),
    "open-auth": () => openAuth(mode || "login"),
    "close-modal": closeAuth,
    "switch-auth": () => openAuth(mode),
    "logout": logout,
    "open-cart": openCart,
    "close-cart": closeCart,
    "add-cart": () => addToCart(id),
    "increase-cart": () => changeCartQty(id, 1),
    "decrease-cart": () => changeCartQty(id, -1),
    "remove-cart": () => removeFromCart(id),
    "open-checkout": openCheckout,
    "close-checkout": closeCheckout,
    "new-item": () => openItemForm(),
    "edit-item": () => openItemForm(id),
    "delete-item": () => deleteItem(id),
    "new-user": () => openUserForm(),
    "edit-user": () => openUserForm(id),
    "delete-user": () => deleteUser(id),
    "new-order": () => openOrderForm(),
    "edit-order": () => openOrderForm(id),
    "delete-order": () => deleteOrder(id),
    "view-order": () => openOrderDetail(id),
    "close-order-detail": closeOrderDetail,
    "close-entity": () => {
      // Generic dismiss: close whichever modal layer the button lives in.
      const layer = actionTarget.closest(".modal-layer");
      if (layer) {
        layer.classList.add("hidden");
        layer.innerHTML = "";
      }
    },
    "close-quick-view": closeQuickView,
    "toggle-theme": toggleTheme,
    "update-order-status": () => updateOrderStatus(id, actionTarget.value),
    "quick-view": () => openQuickView(id),
    "add-wishlist": () => toggleWishlist(id),
    "remove-wishlist": () => toggleWishlist(id),
    "go-wishlist": () => setView("wishlist"),
    "view-low-stock": () => {
      state.search = "";
      state.category = "All";
      if (els.searchInput) els.searchInput.value = "";
      state.view = "admin";
      state.adminTab = "items";
      render();
      // render() is synchronous, so the rows exist now; flash them.
      document.querySelectorAll(".low-stock").forEach((row) => row.classList.add("highlight-flash"));
    },
    "new-category": () => createCategory(),
    "edit-category": () => renameCategory(id),
    "delete-category": () => deleteCategory(id),
    "export-data": handleExport,
    "clear-all-data": handleClearAll,
    "open-data-tools": openDataTools,
    "close-data-tools": closeDataTools,
    "clear-search": clearSearch
  };

  if (actions[action]) {
    actions[action]();
  }
}

function handleSubmit(event) {
  event.preventDefault();

  if (event.target.id === "authForm") {
    state.authMode === "login" ? login(event.target) : register(event.target);
    return;
  }

  if (event.target.id === "checkoutForm") {
    placeCheckoutOrder(event.target);
    return;
  }

  if (event.target.id === "itemForm") {
    saveItem(event.target);
    return;
  }

  if (event.target.id === "userForm") {
    saveUser(event.target);
    return;
  }

  if (event.target.id === "orderForm") {
    saveOrder(event.target);
    return;
  }

  if (event.target.id === "categoryForm") {
    const original = event.target.dataset.original || "";
    original ? submitRenameCategory(event.target) : createCategory(event.target);
  }
}

function handleChange(event) {
  const actionTarget = event.target.closest("[data-action]");
  if (actionTarget?.dataset.action === "update-order-status") {
    updateOrderStatus(actionTarget.dataset.id, event.target.value);
    return;
  }

  if (event.target.id === "categoryFilter") {
    state.category = event.target.value;
    renderShop();
  }

  if (event.target.id === "sortFilter") {
    state.sort = event.target.value;
    renderShop();
  }

  if (event.target.id === "importFile") {
    handleImport(event.target.files?.[0]);
  }
}

export function render() {
  ensureCurrentUserExists();
  applyTheme();
  renderNavigation();
  renderCategoryFilter();
  renderCart();

  if (els.storeToolbar) {
    els.storeToolbar.classList.toggle("hidden", state.view !== "shop");
  }

  if (state.view === "admin") {
    renderAdmin();
  } else if (state.view === "orders") {
    renderOrders();
  } else if (state.view === "wishlist") {
    renderWishlistView();
  } else {
    renderShop();
  }

  refreshIcons();
}

function renderNavigation() {
  const currentUser = getCurrentUser();
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === state.view);
  });

  document.querySelectorAll(".is-admin").forEach((element) => {
    element.classList.toggle("hidden", !isAdmin());
  });

  if (els.authButton) {
    if (currentUser) {
      els.authButton.textContent = "Logout";
      els.authButton.dataset.action = "logout";
      els.authButton.removeAttribute("data-mode");
    } else {
      els.authButton.textContent = "Login";
      els.authButton.dataset.action = "open-auth";
      els.authButton.dataset.mode = "login";
    }
  }

  if (els.userBadge) {
    if (currentUser) {
      els.userBadge.textContent = `${currentUser.name} (${currentUser.role})`;
      els.userBadge.classList.remove("hidden");
    } else {
      els.userBadge.classList.add("hidden");
    }
  }
}

function renderCategoryFilter() {
  if (!els.categoryFilter) return;

  const categories = ["All", ...new Set(state.items.map((item) => item.category).filter(Boolean))];
  if (!categories.includes(state.category)) {
    state.category = "All";
  }
  els.categoryFilter.innerHTML = categories
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
    .join("");
  els.categoryFilter.value = state.category;
}

export function setView(view) {
  if (view === "admin" && !isAdmin()) {
    openAuth("login");
    return;
  }
  if (view === "orders" && !getCurrentUser()) {
    openAuth("login");
    return;
  }
  state.view = view;
  render();
}

function getFilteredItems() {
  const query = state.search.toLowerCase();
  const filtered = state.items
    .filter((item) => item.active)
    .filter((item) => state.category === "All" || item.category === state.category)
    .filter((item) => {
      const haystack = `${item.name} ${item.category} ${item.description}`.toLowerCase();
      return !query || haystack.includes(query);
    });

  return filtered.sort((a, b) => {
    if (state.sort === "priceLow") return Number(a.price) - Number(b.price);
    if (state.sort === "priceHigh") return Number(b.price) - Number(a.price);
    if (state.sort === "stock") return Number(b.stock) - Number(a.stock);
    return a.name.localeCompare(b.name);
  });
}

function renderShop() {
  if (!els.viewRoot) return;

  const items = getFilteredItems();
  updateSearchClear();
  els.viewRoot.innerHTML = `
    <div class="section-heading">
      <div>
        <p class="eyebrow">Store</p>
        <h1>Products</h1>
        <p>${items.length} item${items.length === 1 ? "" : "s"} shown by ${escapeHtml(state.sort)}.</p>
      </div>
      <button class="secondary-button" type="button" data-action="go-wishlist">
        <i data-lucide="heart"></i>
        Wishlist${state.wishlist.length ? ` (${state.wishlist.length})` : ""}
      </button>
    </div>
    ${
      items.length
        ? `<div class="product-grid">${items.map(renderProductCard).join("")}</div>`
        : renderEmptyState("No items found", "Try a different search or category.", "")
    }
  `;
  refreshIcons();
}

function renderWishlistView() {
  if (!els.viewRoot) return;

  const items = state.wishlist
    .map((itemId) => state.items.find((item) => item.id === itemId))
    .filter(Boolean);

  els.viewRoot.innerHTML = `
    <div class="section-heading">
      <div>
        <p class="eyebrow">Wishlist</p>
        <h1>Saved Items</h1>
        <p>${items.length} item${items.length === 1 ? "" : "s"} saved for later.</p>
      </div>
    </div>
    ${
      items.length
        ? `<div class="product-grid">${items.map(renderProductCard).join("")}</div>`
        : renderEmptyState("Wishlist is empty", "Tap the heart on any product to save it here.", "")
    }
  `;
  refreshIcons();
}

function renderOrders() {
  if (!els.viewRoot) return;

  const currentUser = getCurrentUser();
  if (!currentUser) {
    els.viewRoot.innerHTML = renderLockedState("Login Required", "Login or register to view your orders.", "Login", "open-auth");
    refreshIcons();
    return;
  }

  const orders = isAdmin() ? state.orders : state.orders.filter((order) => order.userId === currentUser.id);
  els.viewRoot.innerHTML = `
    <div class="section-heading">
      <div>
        <p class="eyebrow">Orders</p>
        <h1>${isAdmin() ? "All Orders" : "My Orders"}</h1>
      </div>
    </div>
    ${
      orders.length
        ? `<div class="orders-list">${orders.map(order => renderOrderCard(order, state.users, isAdmin())).join("")}</div>`
        : renderEmptyState("No orders yet", "Your completed checkouts will appear here.", "")
    }
  `;
  refreshIcons();
}

function renderAdmin() {
  if (!els.viewRoot) return;

  if (!isAdmin()) {
    els.viewRoot.innerHTML = renderLockedState("Admin Access", "Login as an admin to manage users, items, and orders.", "Login", "open-auth");
    refreshIcons();
    return;
  }

  const metrics = {
    users: state.users.length,
    items: state.items.length,
    orders: state.orders.length,
    sales: state.orders.reduce((total, order) => total + Number(order.total || 0), 0)
  };

  els.viewRoot.innerHTML = `
    <div class="admin-shell">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Admin</p>
          <h1>Management</h1>
        </div>
      </div>
      <div class="metrics-grid">
        <div class="metric-tile"><span>Users</span><strong>${metrics.users}</strong></div>
        <div class="metric-tile"><span>Items</span><strong>${metrics.items}</strong></div>
        <div class="metric-tile"><span>Orders</span><strong>${metrics.orders}</strong></div>
        <div class="metric-tile"><span>Sales</span><strong>${formatMoney(metrics.sales)}</strong></div>
      </div>
      <div class="admin-tabs" role="tablist" aria-label="Admin sections">
        ${renderAdminTab("items", "Items")}
        ${renderAdminTab("users", "Users")}
        ${renderAdminTab("orders", "Orders")}
        ${renderAdminTab("categories", "Categories")}
      </div>
      ${renderAdminPanel()}
    </div>
  `;
  refreshIcons();
}

function renderAdminTab(tab, label) {
  return `
    <button class="admin-tab ${state.adminTab === tab ? "is-active" : ""}" type="button" data-admin-tab="${tab}">
      ${label}
    </button>
  `;
}

function renderAdminPanel() {
  if (state.adminTab === "users") return renderUsersPanel();
  if (state.adminTab === "orders") return renderOrdersPanel();
  if (state.adminTab === "categories") return renderCategoriesPanel();
  return renderItemsPanel();
}

function renderItemsPanel() {
  const lowStockItems = state.items.filter(item => item.active && Number(item.stock) <= 5);
  const lowStockAlert = lowStockItems.length > 0 ? `
    <button class="alert-banner warning" type="button" data-action="view-low-stock" aria-label="Show low-stock items in the table">
      <i data-lucide="alert-triangle"></i>
      <span>${lowStockItems.length} item${lowStockItems.length === 1 ? "" : "s"} running low on stock — click to highlight</span>
    </button>
  ` : "";

  return `
    <section class="admin-panel">
      <div class="panel-header">
        <h2>Item Management</h2>
        <button class="primary-button" type="button" data-action="new-item">
          <i data-lucide="plus"></i>
          New Item
        </button>
      </div>
      ${lowStockAlert}
      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Price</th>
            <th>Stock</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${state.items.map((item) => `
            <tr class="${Number(item.stock) <= 5 && item.active ? "low-stock" : ""}">
              <td data-label="Name">${escapeHtml(item.name)}</td>
              <td data-label="Category">${escapeHtml(item.category)}</td>
              <td data-label="Price">${formatMoney(item.price)}</td>
              <td data-label="Stock">${Number(item.stock)}${Number(item.stock) <= 5 && item.active ? ' <span class="status-pill warning">Low</span>' : ''}</td>
              <td data-label="Status"><span class="status-pill ${item.active ? "paid" : "cancelled"}">${item.active ? "Active" : "Inactive"}</span></td>
              <td data-label="Actions">
                <div class="table-actions">
                  <button class="secondary-button" type="button" data-action="edit-item" data-id="${escapeAttribute(item.id)}">
                    <i data-lucide="pencil"></i>
                    Edit
                  </button>
                  <button class="danger-button" type="button" data-action="delete-item" data-id="${escapeAttribute(item.id)}">
                    <i data-lucide="trash-2"></i>
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
  `;
}

function renderUsersPanel() {
  return `
    <section class="admin-panel">
      <div class="panel-header">
        <h2>User Management</h2>
        <button class="primary-button" type="button" data-action="new-user">
          <i data-lucide="user-plus"></i>
          New User
        </button>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${state.users.map((user) => `
            <tr>
              <td data-label="Name">${escapeHtml(user.name)}</td>
              <td data-label="Email">${escapeHtml(user.email)}</td>
              <td data-label="Role"><span class="chip">${escapeHtml(user.role)}</span></td>
              <td data-label="Created">${escapeHtml(formatDate(user.createdAt))}</td>
              <td data-label="Actions">
                <div class="table-actions">
                  <button class="secondary-button" type="button" data-action="edit-user" data-id="${escapeAttribute(user.id)}">
                    <i data-lucide="pencil"></i>
                    Edit
                  </button>
                  <button class="danger-button" type="button" data-action="delete-user" data-id="${escapeAttribute(user.id)}">
                    <i data-lucide="trash-2"></i>
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
  `;
}

function renderOrdersPanel() {
  return `
    <section class="admin-panel">
      <div class="panel-header">
        <h2>Order Management</h2>
        <button class="primary-button" type="button" data-action="new-order">
          <i data-lucide="package-plus"></i>
          New Order
        </button>
      </div>
      ${
        state.orders.length
          ? `<div class="orders-list">${state.orders.map(order => renderOrderCard(order, state.users, true)).join("")}</div>`
          : renderEmptyState("No orders", "Create an admin order or checkout from the cart.", "")
      }
    </section>
  `;
}

function renderCategoriesPanel() {
  const categories = [...new Set(state.items.map(item => item.category).filter(Boolean))];

  return `
    <section class="admin-panel">
      <div class="panel-header">
        <h2>Category Management</h2>
        <button class="primary-button" type="button" data-action="new-category">
          <i data-lucide="plus"></i>
          New Category
        </button>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Items</th>
            <th>Total Stock</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${categories.map(category => {
            const itemsInCat = state.items.filter(i => i.category === category);
            const totalStock = itemsInCat.reduce((sum, i) => sum + Number(i.stock), 0);
            return `
              <tr>
                <td data-label="Category">${escapeHtml(category)}</td>
                <td data-label="Items">${itemsInCat.length}</td>
                <td data-label="Total Stock">${totalStock}</td>
                <td data-label="Actions">
                  <div class="table-actions">
                    <button class="secondary-button" type="button" data-action="edit-category" data-id="${escapeAttribute(category)}">
                      <i data-lucide="pencil"></i>
                      Rename
                    </button>
                    <button class="danger-button" type="button" data-action="delete-category" data-id="${escapeAttribute(category)}">
                      <i data-lucide="trash-2"></i>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </section>
  `;
}
