import { state } from "./state.js";
import { save } from "../utils/storage.js";
import { createId, escapeHtml, escapeAttribute, formatMoney } from "../utils/helpers.js";
import { refreshIcons, focusFirstFocusable, formatDate } from "../utils/helpers.js";
import { showToast, showError, showSuccess } from "../components/toast.js";
import { closeEntity } from "./modals.js";
import { getCurrentUser } from "./auth.js";
import { render } from "./ui.js";

let els = {};

export function initOrderAdmin(elements) {
  els = elements;
}

export function openOrderForm(orderId = "") {
  if (!state.users.length || !state.items.length) {
    showError("Create at least one user and one item first.");
    return;
  }

  const order = state.orders.find((candidate) => candidate.id === orderId);
  els.entityModal.innerHTML = renderOrderForm(order || {});
  els.entityModal.classList.remove("hidden");
  refreshIcons();
  focusFirstFocusable(els.entityModal);
}

export function saveOrder(form) {
  const formId = form.dataset.id;
  const data = new FormData(form);
  const user = state.users.find((candidate) => candidate.id === String(data.get("userId")));

  if (!user) {
    showError("Choose a valid customer.");
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
    showSuccess("Order saved.");
    render();
    return;
  }

  const item = state.items.find((candidate) => candidate.id === String(data.get("itemId")));
  const qty = Math.max(1, Number(data.get("qty")));

  if (!item) {
    showError("Choose a valid item.");
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
  showSuccess("Order saved.");
  render();
}

export function deleteOrder(orderId) {
  state.orders = state.orders.filter((candidate) => candidate.id !== orderId);
  save("orders", state.orders);
  showSuccess("Order deleted.");
  render();
}

export function openOrderDetail(orderId) {
  const order = state.orders.find((candidate) => candidate.id === orderId);
  if (!order) return;
  
  const user = state.users.find((candidate) => candidate.id === order.userId);
  const currentUser = state.users.find((candidate) => candidate.id === state.currentUserId);
  // Status editing is an admin-only action; customers get a read-only view of their order.
  const isAdminUser = currentUser?.role === "admin";
  
  els.orderDetailModal.innerHTML = renderOrderDetail(order, user, currentUser, isAdminUser);
  els.orderDetailModal.classList.remove("hidden");
  refreshIcons();
  focusFirstFocusable(els.orderDetailModal);
}

export function closeOrderDetail() {
  els.orderDetailModal.classList.add("hidden");
  els.orderDetailModal.innerHTML = "";
}

export function updateOrderStatus(orderId, newStatus) {
  // Guard at the action level too, not just the UI.
  if (getCurrentUser()?.role !== "admin") {
    showWarning("Only admins can change order status.");
    return;
  }

  const order = state.orders.find((candidate) => candidate.id === orderId);
  if (!order) return;
  
  order.status = newStatus;
  save("orders", state.orders);
  showSuccess(`Order status updated to ${newStatus}`);
  
  // Re-render if we're on the orders page
  if (state.view === "orders" || state.view === "admin") {
    render();
  }
  
  // Also update the detail modal if open
  if (!els.orderDetailModal.classList.contains("hidden")) {
    openOrderDetail(orderId);
  }
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
        ${isEditing ? "" : `
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
        `}
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

function renderOrderDetail(order, user, currentUser, isAdminUser) {
  // Only admins may change status, edit, or delete; owners get read-only details.
  const canEdit = isAdminUser;
  const statusOptions = ["Processing", "Paid", "Completed", "Cancelled"];
  const currentStatus = order.status || "Processing";
  
  return `
    <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="orderDetailTitle" style="max-width: 720px;">
      <div class="modal-header">
        <div>
          <p class="eyebrow">Order ${order.id}</p>
          <h2 id="orderDetailTitle">Order Details</h2>
        </div>
        <button class="icon-button" type="button" data-action="close-order-detail" aria-label="Close order details">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="order-detail-content">
        <div class="detail-section">
          <h3>Order Information</h3>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">Order ID</span>
              <span class="detail-value">${escapeHtml(order.id)}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Date</span>
              <span class="detail-value">${escapeHtml(formatDate(order.createdAt))}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Customer</span>
              <span class="detail-value">${escapeHtml(user?.name || order.customerName || "Guest")} (${escapeHtml(user?.email || "N/A")})</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Status</span>
              <span class="detail-value">
                <select class="status-select" data-action="update-order-status" data-id="${escapeAttribute(order.id)}" ${!canEdit ? "disabled" : ""}>
                  ${statusOptions.map(opt => `<option value="${opt}" ${opt === currentStatus ? "selected" : ""}>${opt}</option>`).join("")}
                </select>
              </span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Payment Method</span>
              <span class="detail-value">${escapeHtml(order.paymentMethod || "N/A")}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Payment Reference</span>
              <span class="detail-value">${escapeHtml(order.paymentReference || "N/A")}</span>
            </div>
            <div class="detail-item full-width">
              <span class="detail-label">Delivery Address</span>
              <span class="detail-value">${escapeHtml(order.address || "N/A")}</span>
            </div>
          </div>
        </div>
        
        <div class="detail-section">
          <h3>Items</h3>
          <div class="order-detail-items">
            ${order.items.map(item => `
              <div class="order-detail-item">
                <img src="${escapeAttribute(item.image || "assets/placeholder.svg")}" alt="${escapeAttribute(item.name)}" />
                <div class="item-info">
                  <h4>${escapeHtml(item.name)}</h4>
                  <p>${formatMoney(item.price)} x ${Number(item.qty)}</p>
                </div>
                <strong>${formatMoney(item.price * item.qty)}</strong>
              </div>
            `).join("")}
          </div>
        </div>
        
        <div class="detail-section total-section">
          <div class="detail-row">
            <span>Subtotal</span>
            <span>${formatMoney(order.items.reduce((t, i) => t + i.price * i.qty, 0))}</span>
          </div>
          <div class="detail-row total-row">
            <span>Total</span>
            <strong>${formatMoney(order.total)}</strong>
          </div>
        </div>
        
        ${canEdit ? `
          <div class="detail-actions">
            <button class="secondary-button" type="button" data-action="edit-order" data-id="${escapeAttribute(order.id)}">
              <i data-lucide="pencil"></i>
              Edit Order
            </button>
            <button class="danger-button" type="button" data-action="delete-order" data-id="${escapeAttribute(order.id)}">
              <i data-lucide="trash-2"></i>
              Delete Order
            </button>
          </div>
        ` : ""}
      </div>
    </div>
  `;
}
