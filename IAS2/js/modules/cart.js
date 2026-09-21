import { state } from "../modules/state.js";
import { save } from "../utils/storage.js";
import { escapeHtml, escapeAttribute } from "../utils/helpers.js";
import { refreshIcons } from "../utils/helpers.js";
import { showToast, showError, showSuccess, showWarning } from "../components/toast.js";
import { formatMoney, focusFirstFocusable } from "../utils/helpers.js";
import { renderEmptyState } from "../components/render-helpers.js";

let els = {};

export function initCart(elements) {
  els = elements;
}

export function getCartLines() {
  return state.cart
    .map((line) => ({
      item: state.items.find((item) => item.id === line.itemId),
      qty: Number(line.qty)
    }))
    .filter((line) => line.item && line.qty > 0);
}

export function renderCart() {
  if (!els.cartLines || !els.cartCount || !els.cartTotal) return;
  
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
  
  refreshIcons();
}

export function addToCart(itemId) {
  const item = state.items.find((candidate) => candidate.id === itemId);
  if (!item || !item.active || Number(item.stock) < 1) {
    showError("Item is not available.");
    return;
  }

  const line = state.cart.find((candidate) => candidate.itemId === itemId);
  if (line) {
    if (line.qty >= Number(item.stock)) {
      showWarning("Cart quantity reached available stock.");
      return;
    }
    line.qty += 1;
  } else {
    state.cart.push({ itemId, qty: 1 });
  }

  save("cart", state.cart);
  renderCart();
  showSuccess(`${item.name} added to cart.`);
}

export function changeCartQty(itemId, delta) {
  const line = state.cart.find((candidate) => candidate.itemId === itemId);
  const item = state.items.find((candidate) => candidate.id === itemId);
  if (!line || !item) return;

  const nextQty = line.qty + delta;
  if (nextQty < 1) {
    removeFromCart(itemId);
    return;
  }

  if (nextQty > Number(item.stock)) {
    showWarning("Cart quantity reached available stock.");
    return;
  }

  line.qty = nextQty;
  save("cart", state.cart);
  renderCart();
}

export function removeFromCart(itemId) {
  state.cart = state.cart.filter((line) => line.itemId !== itemId);
  save("cart", state.cart);
  renderCart();
}

export function openCart() {
  renderCart();
  els.cartDrawer?.classList.remove("hidden");
  refreshIcons();
  focusFirstFocusable(els.cartDrawer);
}

export function closeCart() {
  els.cartDrawer?.classList.add("hidden");
}
