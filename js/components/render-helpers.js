import { escapeHtml, escapeAttribute, formatMoney, formatDate, statusClass, refreshIcons } from "../utils/helpers.js";
import { state } from "../modules/state.js";

// Stable hue per category name: same name -> same color, everywhere.
const categoryHues = new Map();

function categoryHue(category) {
  if (!categoryHues.has(category)) {
    categoryHues.set(category, categoryHues.size % 8);
  }
  return categoryHues.get(category);
}

export function renderCategoryChip(category) {
  const hue = categoryHue(String(category));
  return `<span class="chip hue-${hue}" data-hue="${hue}">${escapeHtml(category)}</span>`;
}

export function renderEmptyState(title, copy, actionHtml) {
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

export function renderLockedState(title, copy, buttonText, action) {
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

export function renderProductCard(item) {
  const disabled = !item.active || Number(item.stock) < 1;
  const inWishlist = state.wishlist?.includes(item.id);
  return `
    <article class="product-card">
      <figure class="product-media">
        <img src="${escapeAttribute(item.image || "assets/placeholder.svg")}" alt="${escapeAttribute(item.name)}" loading="lazy" />
        <button class="quick-view-button icon-button" type="button" data-action="quick-view" data-id="${escapeAttribute(item.id)}" aria-label="Quick view ${escapeAttribute(item.name)}">
          <i data-lucide="eye"></i>
        </button>
      </figure>
      <div class="product-info">
        <div class="product-title">
          <h3>${escapeHtml(item.name)}</h3>
          <strong class="price">${formatMoney(item.price)}</strong>
        </div>
        <div class="tag-row">
          ${renderCategoryChip(item.category)}
          ${renderStockChip(item)}
        </div>
        <p>${escapeHtml(item.description)}</p>
        <div class="product-footer">
          <div class="table-actions">
            <button class="icon-button wishlist-button ${inWishlist ? "is-active" : ""}" type="button" data-action="${inWishlist ? "remove-wishlist" : "add-wishlist"}" data-id="${escapeAttribute(item.id)}" aria-label="${inWishlist ? "Remove from" : "Add to"} wishlist">
              <i data-lucide="heart"></i>
            </button>
            <span class="status-pill ${item.active ? "paid" : "cancelled"}">${item.active ? "Active" : "Inactive"}</span>
          </div>
          <button class="primary-button" type="button" data-action="add-cart" data-id="${escapeAttribute(item.id)}" ${disabled ? "disabled" : ""}>
            <i data-lucide="plus"></i>
            Add
          </button>
        </div>
      </div>
    </article>
  `;
}

export function renderStockChip(item) {
  const stock = Number(item.stock) || 0;
  if (!item.active || stock < 1) {
    return '<span class="chip warning">Out of stock</span>';
  }
  if (stock <= 5) {
    return `<span class="chip warning">Low stock · ${stock} left</span>`;
  }
  return `<span class="chip">${stock} in stock</span>`;
}

export function renderOrderCard(order, users, isAdminUser) {
  const user = users.find((candidate) => candidate.id === order.userId);
  const actions = isAdminUser
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
        <button class="secondary-button" type="button" data-action="view-order" data-id="${escapeAttribute(order.id)}">
          <i data-lucide="eye"></i>
          View
        </button>
      </div>
    `
    : `
      <div class="table-actions">
        <button class="secondary-button" type="button" data-action="view-order" data-id="${escapeAttribute(order.id)}">
          <i data-lucide="eye"></i>
          View
        </button>
      </div>
    `;

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
        ${order.items.map((line) => `<li>${escapeHtml(line.name)} × ${Number(line.qty)} — ${formatMoney(line.price * line.qty)}</li>`).join("")}
      </ul>
      <div class="product-footer">
        <strong>${formatMoney(order.total)}</strong>
        ${actions}
      </div>
    </article>
  `;
}
