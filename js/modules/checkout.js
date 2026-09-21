import { state } from "./state.js";
import { save } from "../utils/storage.js";
import { createId, escapeHtml, escapeAttribute, formatMoney } from "../utils/helpers.js";
import { refreshIcons, focusFirstFocusable } from "../utils/helpers.js";
import { showToast, showError, showSuccess } from "../components/toast.js";
import { getCartLines, renderCart } from "./cart.js";
import { getCurrentUser, openAuth } from "./auth.js";
import { closeCart } from "./cart.js";
import { render } from "./ui.js";
import { closeAuth } from "./auth.js";

let els = {};

export function initCheckout(elements) {
  els = elements;
}

export function openCheckout() {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    closeCart();
    openAuth("login");
    return;
  }

  const lines = getCartLines();
  if (!lines.length) {
    showError("Your cart is empty.");
    return;
  }

  const nameInput = document.querySelector("#checkoutName");
  if (nameInput) nameInput.value = currentUser.name;

  const totalInput = document.querySelector("#checkoutTotal");
  if (totalInput) {
    totalInput.textContent = formatMoney(lines.reduce((total, line) => total + line.item.price * line.qty, 0));
  }

  els.checkoutModal?.classList.remove("hidden");
  refreshIcons();
  focusFirstFocusable(els.checkoutModal);
}

export function closeCheckout() {
  els.checkoutModal?.classList.add("hidden");
}

export function placeCheckoutOrder(form) {
  const currentUser = getCurrentUser();
  const lines = getCartLines();
  if (!currentUser || !lines.length) return;

  const unavailableLine = lines.find(({ item, qty }) => qty > Number(item.stock));
  if (unavailableLine) {
    showError(`${unavailableLine.item.name} has less stock now.`);
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
  showSuccess("Payment accepted and order placed.");
  render();
}
