const STORAGE_PREFIX = "ias2.commerce.";

const defaultUsers = [
  {
    id: "user_admin",
    name: "Admin User",
    email: "admin@ias2.test",
    password: "admin123",
    role: "admin",
    createdAt: "2026-09-19T00:00:00.000Z"
  },
  {
    id: "user_demo",
    name: "Demo Customer",
    email: "user@ias2.test",
    password: "user123",
    role: "user",
    createdAt: "2026-09-19T00:00:00.000Z"
  }
];

const defaultItems = [
  {
    id: "item_lamp",
    name: "Aura Desk Lamp",
    category: "Workspace",
    price: 1290,
    stock: 16,
    image: "assets/desk-lamp.svg",
    description: "Adjustable task lighting with warm and cool modes.",
    active: true
  },
  {
    id: "item_headphones",
    name: "Pulse Wireless Headphones",
    category: "Audio",
    price: 2450,
    stock: 11,
    image: "assets/wireless-headphones.svg",
    description: "Lightweight wireless listening with soft ear cushions.",
    active: true
  },
  {
    id: "item_keyboard",
    name: "Metro Mechanical Keyboard",
    category: "Computer",
    price: 3150,
    stock: 8,
    image: "assets/mechanical-keyboard.svg",
    description: "Compact keyboard with tactile switches and quiet stabilizers.",
    active: true
  },
  {
    id: "item_watch",
    name: "Stride Smart Watch",
    category: "Wearables",
    price: 1890,
    stock: 19,
    image: "assets/smart-watch.svg",
    description: "Daily health tracking, notifications, and long battery life.",
    active: true
  }
];

const sortLabels = {
  featured: "Featured",
  priceLow: "Price low to high",
  priceHigh: "Price high to low",
  stock: "Stock available"
};

const state = {
  users: load("users", defaultUsers),
  items: load("items", defaultItems),
  orders: load("orders", []),
  cart: load("cart", []),
  currentUserId: localStorage.getItem(`${STORAGE_PREFIX}currentUserId`) || "",
  view: "shop",
  adminTab: "items",
  search: "",
  category: "All",
  sort: "featured",
  authMode: "login"
};

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  render();
});

function cacheElements() {
  els.viewRoot = document.querySelector("#viewRoot");
  els.storeToolbar = document.querySelector("#storeToolbar");
  els.searchInput = document.querySelector("#searchInput");
  els.categoryFilter = document.querySelector("#categoryFilter");
  els.sortFilter = document.querySelector("#sortFilter");
  els.cartCount = document.querySelector("#cartCount");
  els.cartDrawer = document.querySelector("#cartDrawer");
  els.cartLines = document.querySelector("#cartLines");
  els.cartTotal = document.querySelector("#cartTotal");
  els.authButton = document.querySelector("#authButton");
  els.userBadge = document.querySelector("#userBadge");
  els.authModal = document.querySelector("#authModal");
  els.authForm = document.querySelector("#authForm");
  els.authTitle = document.querySelector("#authTitle");
  els.authEyebrow = document.querySelector("#authEyebrow");
  els.checkoutModal = document.querySelector("#checkoutModal");
  els.checkoutForm = document.querySelector("#checkoutForm");
  els.entityModal = document.querySelector("#entityModal");
  els.toastArea = document.querySelector("#toastArea");
}

function bindEvents() {
  document.body.addEventListener("click", handleClick);
  document.body.addEventListener("submit", handleSubmit);
  document.body.addEventListener("change", handleChange);
  els.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim();
    renderShop();
  });
}

function handleClick(event) {
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
    "close-entity": closeEntity
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
  }
}

function handleChange(event) {
  if (event.target.id === "categoryFilter") {
    state.category = event.target.value;
    renderShop();
  }

  if (event.target.id === "sortFilter") {
    state.sort = event.target.value;
    renderShop();
  }
}

function render() {
  ensureCurrentUserExists();
  renderNavigation();
  renderCategoryFilter();
  renderCart();

  els.storeToolbar.classList.toggle("hidden", state.view !== "shop");

  if (state.view === "admin") {
    renderAdmin();
  } else if (state.view === "orders") {
    renderOrders();
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

  if (currentUser) {
    els.authButton.textContent = "Logout";
    els.authButton.dataset.action = "logout";
    els.userBadge.textContent = `${currentUser.name} (${currentUser.role})`;
    els.userBadge.classList.remove("hidden");
  } else {
    els.authButton.textContent = "Login";
    els.authButton.dataset.action = "open-auth";
    els.authButton.dataset.mode = "login";
    els.userBadge.classList.add("hidden");
  }
}

function renderCategoryFilter() {
  const categories = ["All", ...new Set(state.items.map((item) => item.category).filter(Boolean))];
  if (!categories.includes(state.category)) {
    state.category = "All";
  }
  els.categoryFilter.innerHTML = categories
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
    .join("");
  els.categoryFilter.value = state.category;
}

function renderShop() {
  const items = getFilteredItems();
  els.viewRoot.innerHTML = `
    <div class="section-heading">
      <div>
        <p class="eyebrow">Store</p>
        <h1>Products</h1>
        <p>${items.length} item${items.length === 1 ? "" : "s"} shown by ${escapeHtml(sortLabels[state.sort])}.</p>
      </div>
    </div>
    ${
      items.length
        ? `<div class="product-grid">${items.map(renderProductCard).join("")}</div>`
        : renderEmptyState("No items found", "Try a different search or category.", "")
    }
  `;
  refreshIcons();
}

function renderProductCard(item) {
  const disabled = !item.active || Number(item.stock) < 1;
  return `
    <article class="product-card">
      <figure class="product-media">
        <img src="${escapeAttribute(item.image || "assets/placeholder.svg")}" alt="${escapeAttribute(item.name)}" />
      </figure>
      <div class="product-info">
        <div class="product-title">
          <h3>${escapeHtml(item.name)}</h3>
          <strong class="price">${formatMoney(item.price)}</strong>
        </div>
        <div class="tag-row">
          <span class="chip">${escapeHtml(item.category)}</span>
          <span class="chip">${Number(item.stock)} in stock</span>
        </div>
        <p>${escapeHtml(item.description)}</p>
        <div class="product-footer">
          <span class="status-pill ${item.active ? "paid" : "cancelled"}">${item.active ? "Active" : "Inactive"}</span>
          <button class="primary-button" type="button" data-action="add-cart" data-id="${escapeAttribute(item.id)}" ${disabled ? "disabled" : ""}>
            <i data-lucide="plus"></i>
            Add
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderOrders() {
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
        ? `<div class="orders-list">${orders.map(renderOrderCard).join("")}</div>`
        : renderEmptyState("No orders yet", "Your completed checkouts will appear here.", "")
    }
  `;
  refreshIcons();
}

function renderOrderCard(order) {
  const user = state.users.find((candidate) => candidate.id === order.userId);
  const actions = isAdmin()
    ? `
      <div class="table-actions">
        <button class="secondary-button" type="button" data-action="edit-order" data-id="${escapeAttribute(order.id)}">
          <i data-lucide="pencil"></i>
          Edit
        </button>
        <button class="danger-button" type="button" data-action="delete-order" data-id="${escapeAttribute(order.id)}">
          <i data-lucide="trash-2"></i>
          Delete
        </button>
      </div>
    `
    : "";

  return `
    <article class="order-card">
      <header>
        <div>
          <h3>${escapeHtml(order.id)}</h3>
          <p>${escapeHtml(formatDate(order.createdAt))} • ${escapeHtml(user?.name || order.customerName || "Customer")}</p>
        </div>
        <span class="status-pill ${statusClass(order.status)}">${escapeHtml(order.status)}</span>
      </header>
      <ul>
        ${order.items.map((line) => `<li>${escapeHtml(line.name)} x ${Number(line.qty)} - ${formatMoney(line.price * line.qty)}</li>`).join("")}
      </ul>
      <div class="product-footer">
        <strong>${formatMoney(order.total)}</strong>
        ${actions}
      </div>
    </article>
  `;
}

function renderAdmin() {
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
  return renderItemsPanel();
}

function renderItemsPanel() {
  return `
    <section class="admin-panel">
      <div class="panel-header">
        <h2>Item Management</h2>
        <button class="primary-button" type="button" data-action="new-item">
          <i data-lucide="plus"></i>
          New Item
        </button>
      </div>
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
            <tr>
              <td data-label="Name">${escapeHtml(item.name)}</td>
              <td data-label="Category">${escapeHtml(item.category)}</td>
              <td data-label="Price">${formatMoney(item.price)}</td>
              <td data-label="Stock">${Number(item.stock)}</td>
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
          ? `<div class="orders-list">${state.orders.map(renderOrderCard).join("")}</div>`
          : renderEmptyState("No orders", "Create an admin order or checkout from the cart.", "")
      }
    </section>
  `;
}

function renderCart() {
  const lines = getCartLines();
  els.cartCount.textContent = lines.reduce((total, line) => total + line.qty, 0);
  els.cartTotal.textContent = formatMoney(lines.reduce((total, line) => total + line.item.price * line.qty, 0));
  els.cartLines.innerHTML = lines.length
    ? lines.map(({ item, qty }) => `
      <div class="cart-line">
        <img src="${escapeAttribute(item.image)}" alt="${escapeAttribute(item.name)}" />
        <div>
          <h3>${escapeHtml(item.name)}</h3>
          <p>${formatMoney(item.price)} each</p>
        </div>
        <div class="quantity-stepper" aria-label="${escapeAttribute(item.name)} quantity">
          <button type="button" data-action="decrease-cart" data-id="${escapeAttribute(item.id)}">-</button>
          <span>${qty}</span>
          <button type="button" data-action="increase-cart" data-id="${escapeAttribute(item.id)}">+</button>
        </div>
      </div>
    `).join("")
    : renderEmptyState("Cart is empty", "Add products from the shop.", "");
}

function renderAuthForm() {
  const isRegister = state.authMode === "register";
  els.authTitle.textContent = isRegister ? "Register" : "Login";
  els.authEyebrow.textContent = isRegister ? "New Account" : "Account";

  document.querySelectorAll("[data-action='switch-auth']").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === state.authMode);
  });

  els.authForm.innerHTML = `
    ${
      isRegister
        ? `
          <div class="field">
            <label for="authName">Name</label>
            <input id="authName" name="name" autocomplete="name" required />
          </div>
        `
        : ""
    }
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
            <label for="userPassword">Password</label>
            <input id="userPassword" name="password" type="text" value="${escapeAttribute(user.password || "")}" required />
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

function renderOrderForm(order = {}) {
  const isEditing = Boolean(order.id);
  const selectedUserId = order.userId || state.users.find((user) => user.role === "user")?.id || state.users[0]?.id || "";
  const firstItem = state.items[0] || {};
  const selectedItemId = order.items?.[0]?.itemId || firstItem.id || "";
  const selectedQty = order.items?.[0]?.qty || 1;
  const status = order.status || "Processing";

  return `
    <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="orderFormTitle">
      <div class="modal-header">
        <div>
          <p class="eyebrow">Orders</p>
          <h2 id="orderFormTitle">${isEditing ? "Edit Order" : "New Order"}</h2>
        </div>
        <button class="icon-button" type="button" data-action="close-entity" aria-label="Close order form">
          <i data-lucide="x"></i>
        </button>
      </div>
      <form class="form-grid" id="orderForm" data-id="${escapeAttribute(order.id || "")}">
        <div class="field">
          <label for="orderUser">Customer</label>
          <select id="orderUser" name="userId" required>
            ${state.users.map((user) => `<option value="${escapeAttribute(user.id)}" ${user.id === selectedUserId ? "selected" : ""}>${escapeHtml(user.name)} (${escapeHtml(user.email)})</option>`).join("")}
          </select>
        </div>
        ${
          isEditing
            ? ""
            : `
              <div class="field split-field">
                <span>
                  <label for="orderItem">Item</label>
                  <select id="orderItem" name="itemId" required>
                    ${state.items.map((item) => `<option value="${escapeAttribute(item.id)}" ${item.id === selectedItemId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
                  </select>
                </span>
                <span>
                  <label for="orderQty">Quantity</label>
                  <input id="orderQty" name="qty" type="number" min="1" step="1" value="${Number(selectedQty)}" required />
                </span>
              </div>
            `
        }
        <div class="field">
          <label for="orderStatus">Status</label>
          <select id="orderStatus" name="status">
            ${["Processing", "Paid", "Completed", "Cancelled"].map((candidate) => `<option value="${candidate}" ${candidate === status ? "selected" : ""}>${candidate}</option>`).join("")}
          </select>
        </div>
        <button class="primary-button wide" type="submit">Save Order</button>
      </form>
    </div>
  `;
}

function openAuth(mode = "login") {
  state.authMode = mode;
  renderAuthForm();
  els.authModal.classList.remove("hidden");
}

function closeAuth() {
  els.authModal.classList.add("hidden");
}

function login(form) {
  const data = new FormData(form);
  const email = String(data.get("email")).trim().toLowerCase();
  const password = String(data.get("password"));
  const user = state.users.find((candidate) => candidate.email.toLowerCase() === email && candidate.password === password);

  if (!user) {
    showToast("Email or password did not match.");
    return;
  }

  state.currentUserId = user.id;
  localStorage.setItem(`${STORAGE_PREFIX}currentUserId`, user.id);
  closeAuth();
  showToast(`Welcome, ${user.name}.`);
  render();
}

function register(form) {
  const data = new FormData(form);
  const name = String(data.get("name")).trim();
  const email = String(data.get("email")).trim().toLowerCase();
  const password = String(data.get("password"));

  if (state.users.some((user) => user.email.toLowerCase() === email)) {
    showToast("That email is already registered.");
    return;
  }

  const user = {
    id: createId("user"),
    name,
    email,
    password,
    role: "user",
    createdAt: new Date().toISOString()
  };
  state.users.push(user);
  save("users", state.users);
  state.currentUserId = user.id;
  localStorage.setItem(`${STORAGE_PREFIX}currentUserId`, user.id);
  closeAuth();
  showToast("Account created.");
  render();
}

function logout() {
  state.currentUserId = "";
  localStorage.removeItem(`${STORAGE_PREFIX}currentUserId`);
  if (state.view === "admin" || state.view === "orders") {
    state.view = "shop";
  }
  showToast("Logged out.");
  render();
}

function addToCart(itemId) {
  const item = state.items.find((candidate) => candidate.id === itemId);
  if (!item || !item.active || Number(item.stock) < 1) {
    showToast("Item is not available.");
    return;
  }

  const line = state.cart.find((candidate) => candidate.itemId === itemId);
  if (line) {
    if (line.qty >= Number(item.stock)) {
      showToast("Cart quantity reached available stock.");
      return;
    }
    line.qty += 1;
  } else {
    state.cart.push({ itemId, qty: 1 });
  }

  save("cart", state.cart);
  renderCart();
  showToast(`${item.name} added to cart.`);
}

function changeCartQty(itemId, delta) {
  const line = state.cart.find((candidate) => candidate.itemId === itemId);
  const item = state.items.find((candidate) => candidate.id === itemId);
  if (!line || !item) return;

  const nextQty = line.qty + delta;
  if (nextQty < 1) {
    removeFromCart(itemId);
    return;
  }

  if (nextQty > Number(item.stock)) {
    showToast("Cart quantity reached available stock.");
    return;
  }

  line.qty = nextQty;
  save("cart", state.cart);
  renderCart();
}

function removeFromCart(itemId) {
  state.cart = state.cart.filter((line) => line.itemId !== itemId);
  save("cart", state.cart);
  renderCart();
}

function openCart() {
  renderCart();
  els.cartDrawer.classList.remove("hidden");
  refreshIcons();
}

function closeCart() {
  els.cartDrawer.classList.add("hidden");
}

function openCheckout() {
  if (!getCurrentUser()) {
    closeCart();
    openAuth("login");
    return;
  }

  const lines = getCartLines();
  if (!lines.length) {
    showToast("Your cart is empty.");
    return;
  }

  const currentUser = getCurrentUser();
  document.querySelector("#checkoutName").value = currentUser.name;
  els.checkoutModal.classList.remove("hidden");
}

function closeCheckout() {
  els.checkoutModal.classList.add("hidden");
}

function placeCheckoutOrder(form) {
  const currentUser = getCurrentUser();
  const lines = getCartLines();
  if (!currentUser || !lines.length) return;

  const unavailableLine = lines.find(({ item, qty }) => qty > Number(item.stock));
  if (unavailableLine) {
    showToast(`${unavailableLine.item.name} has less stock now.`);
    renderCart();
    return;
  }

  const data = new FormData(form);
  const order = {
    id: createId("order"),
    userId: currentUser.id,
    customerName: String(data.get("name")).trim(),
    address: String(data.get("address")).trim(),
    paymentMethod: String(data.get("method")),
    paymentReference: String(data.get("reference")).trim(),
    status: "Paid",
    createdAt: new Date().toISOString(),
    items: lines.map(({ item, qty }) => ({
      itemId: item.id,
      name: item.name,
      price: Number(item.price),
      qty
    }))
  };
  order.total = order.items.reduce((total, line) => total + line.price * line.qty, 0);

  lines.forEach(({ item, qty }) => {
    item.stock = Math.max(0, Number(item.stock) - qty);
  });

  state.orders.unshift(order);
  state.cart = [];
  save("items", state.items);
  save("orders", state.orders);
  save("cart", state.cart);
  closeCheckout();
  closeCart();
  state.view = "orders";
  showToast("Payment accepted and order placed.");
  render();
}

function openItemForm(itemId = "") {
  const item = state.items.find((candidate) => candidate.id === itemId);
  els.entityModal.innerHTML = renderItemForm(item || {});
  els.entityModal.classList.remove("hidden");
  refreshIcons();
}

function saveItem(form) {
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
  showToast("Item saved.");
  render();
}

function deleteItem(itemId) {
  const item = state.items.find((candidate) => candidate.id === itemId);
  if (!item) return;

  const usedInOrders = state.orders.some((order) => order.items.some((line) => line.itemId === itemId));
  if (usedInOrders) {
    showToast("Items already used in orders stay in the records.");
    return;
  }

  state.items = state.items.filter((candidate) => candidate.id !== itemId);
  state.cart = state.cart.filter((line) => line.itemId !== itemId);
  save("items", state.items);
  save("cart", state.cart);
  showToast(`${item.name} deleted.`);
  render();
}

function openUserForm(userId = "") {
  const user = state.users.find((candidate) => candidate.id === userId);
  els.entityModal.innerHTML = renderUserForm(user || {});
  els.entityModal.classList.remove("hidden");
  refreshIcons();
}

function saveUser(form) {
  const formId = form.dataset.id;
  const data = new FormData(form);
  const email = String(data.get("email")).trim().toLowerCase();

  const duplicate = state.users.find((user) => user.email.toLowerCase() === email && user.id !== formId);
  if (duplicate) {
    showToast("That email is already registered.");
    return;
  }

  const user = {
    id: formId || createId("user"),
    name: String(data.get("name")).trim(),
    email,
    password: String(data.get("password")),
    role: String(data.get("role")),
    createdAt: formId
      ? state.users.find((candidate) => candidate.id === formId)?.createdAt || new Date().toISOString()
      : new Date().toISOString()
  };

  if (formId && wouldRemoveLastAdmin(formId, user.role)) {
    showToast("At least one admin account is required.");
    return;
  }

  if (formId) {
    state.users = state.users.map((candidate) => (candidate.id === formId ? user : candidate));
  } else {
    state.users.push(user);
  }

  save("users", state.users);
  closeEntity();
  showToast("User saved.");
  render();
}

function deleteUser(userId) {
  const currentUser = getCurrentUser();
  const user = state.users.find((candidate) => candidate.id === userId);
  if (!user) return;

  if (currentUser?.id === userId) {
    showToast("The logged-in account cannot be deleted.");
    return;
  }

  if (wouldRemoveLastAdmin(userId, "user")) {
    showToast("At least one admin account is required.");
    return;
  }

  state.users = state.users.filter((candidate) => candidate.id !== userId);
  state.orders = state.orders.map((order) => (order.userId === userId ? { ...order, userId: "", customerName: user.name } : order));
  save("users", state.users);
  save("orders", state.orders);
  showToast(`${user.name} deleted.`);
  render();
}

function openOrderForm(orderId = "") {
  if (!state.users.length || !state.items.length) {
    showToast("Create at least one user and one item first.");
    return;
  }

  const order = state.orders.find((candidate) => candidate.id === orderId);
  els.entityModal.innerHTML = renderOrderForm(order || {});
  els.entityModal.classList.remove("hidden");
  refreshIcons();
}

function saveOrder(form) {
  const formId = form.dataset.id;
  const data = new FormData(form);
  const user = state.users.find((candidate) => candidate.id === String(data.get("userId")));

  if (!user) {
    showToast("Choose a valid customer.");
    return;
  }

  if (formId) {
    const existingOrder = state.orders.find((candidate) => candidate.id === formId);
    if (!existingOrder) return;

    const updatedOrder = {
      ...existingOrder,
      userId: user.id,
      customerName: user.name,
      status: String(data.get("status"))
    };
    state.orders = state.orders.map((candidate) => (candidate.id === formId ? updatedOrder : candidate));
    save("orders", state.orders);
    closeEntity();
    showToast("Order saved.");
    render();
    return;
  }

  const item = state.items.find((candidate) => candidate.id === String(data.get("itemId")));
  const qty = Math.max(1, Number(data.get("qty")));

  if (!item) {
    showToast("Choose a valid item.");
    return;
  }

  const order = {
    id: createId("order"),
    userId: user.id,
    customerName: user.name,
    address: "",
    paymentMethod: "Admin",
    paymentReference: "Manual",
    status: String(data.get("status")),
    createdAt: new Date().toISOString(),
    items: [
      {
        itemId: item.id,
        name: item.name,
        price: Number(item.price),
        qty
      }
    ]
  };
  order.total = order.items.reduce((total, line) => total + line.price * line.qty, 0);

  state.orders.unshift(order);
  save("orders", state.orders);
  closeEntity();
  showToast("Order saved.");
  render();
}

function deleteOrder(orderId) {
  state.orders = state.orders.filter((candidate) => candidate.id !== orderId);
  save("orders", state.orders);
  showToast("Order deleted.");
  render();
}

function closeEntity() {
  els.entityModal.classList.add("hidden");
  els.entityModal.innerHTML = "";
}

function setView(view) {
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

function getCartLines() {
  return state.cart
    .map((line) => ({
      item: state.items.find((item) => item.id === line.itemId),
      qty: Number(line.qty)
    }))
    .filter((line) => line.item && line.qty > 0);
}

function getCurrentUser() {
  return state.users.find((user) => user.id === state.currentUserId) || null;
}

function isAdmin() {
  return getCurrentUser()?.role === "admin";
}

function ensureCurrentUserExists() {
  if (state.currentUserId && !getCurrentUser()) {
    state.currentUserId = "";
    localStorage.removeItem(`${STORAGE_PREFIX}currentUserId`);
  }
}

function wouldRemoveLastAdmin(userId, nextRole) {
  return state.users.filter((user) => (user.id === userId ? nextRole : user.role) === "admin").length === 0;
}

function renderEmptyState(title, copy, actionHtml) {
  return `
    <div class="empty-state">
      <div>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(copy)}</p>
        ${actionHtml || ""}
      </div>
    </div>
  `;
}

function renderLockedState(title, copy, buttonText, action) {
  return `
    <div class="locked-state">
      <div>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(copy)}</p>
        <button class="primary-button" type="button" data-action="${escapeAttribute(action)}" data-mode="login">${escapeHtml(buttonText)}</button>
      </div>
    </div>
  `;
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  els.toastArea.append(toast);
  window.setTimeout(() => toast.remove(), 3200);
}

function statusClass(status) {
  return String(status).toLowerCase().replace(/\s+/g, "-");
}

function formatMoney(value) {
  return `PHP ${Number(value || 0).toLocaleString("en-PH")}`;
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date();
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function createId(prefix) {
  const random = window.crypto?.randomUUID ? window.crypto.randomUUID().slice(0, 8) : Math.random().toString(16).slice(2, 10);
  return `${prefix}_${random}`;
}

function load(key, fallback) {
  try {
    const value = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    return value ? JSON.parse(value) : structuredClone(fallback);
  } catch (error) {
    return structuredClone(fallback);
  }
}

function save(key, value) {
  localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}
