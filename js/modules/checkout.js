import { state } from "./state.js";
import { save } from "../utils/storage.js?v=ff51bd7c";
import { createId, escapeHtml, escapeAttribute, formatMoney } from "../utils/helpers.js?v=7bbd16f9";
import { sanitizeText, sanitizeMultiline } from "../utils/security.js?v=fbf2cc5d";
import { refreshIcons, focusFirstFocusable } from "../utils/helpers.js?v=7bbd16f9";
import { showToast, showError, showSuccess } from "../components/toast.js?v=ce0cbc8e";
import { getCartLines, renderCart } from "./cart.js?v=ca844d25";
import { getCurrentUser, openAuth } from "./auth.js?v=aec43a94";
import { closeCart } from "./cart.js?v=ca844d25";
import { render } from "./ui.js?v=f811eaeb";
import { closeAuth } from "./auth.js?v=aec43a94";

let els = {};

// Cash on Delivery is the one method with no payment reference to check —
// the reference field's native `required` flag tracks this value.
const COD_METHOD = "Cash on Delivery";

export function initCheckout(elements) {
  els = elements;

  const methodSelect = els.checkoutForm?.querySelector("#paymentMethod");
  const referenceInput = els.checkoutForm?.querySelector("#paymentReference");
  const syncReferenceRequirement = () => {
    // Fail closed: if the select is ever missing, the requirement stays on.
    referenceInput?.toggleAttribute("required", methodSelect?.value !== COD_METHOD);
  };
  methodSelect?.addEventListener("change", syncReferenceRequirement);
  syncReferenceRequirement();
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

  // Block deactivated items at checkout: they may have been switched off
  // after being carted, and an admin order for them would be invalid.
  const blockedLine = lines.find((line) => !line.item.active);
  if (blockedLine) {
    showError(`${blockedLine.item.name} is no longer available. Remove it to continue.`);
    renderCart();
    return;
  }

  const orderTotal = lines.reduce((total, line) => total + line.item.price * line.qty, 0);
  if (orderTotal < 100) {
    showError("Orders start at PHP 100 — add a little more to check out.");
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

  const unavailableLine = lines.find(({ item, qty }) => qty > Number(item.stock) || !item.active);
  if (unavailableLine) {
    showError(`${unavailableLine.item.name} has less stock now.`);
    renderCart();
    return;
  }

  const data = new FormData(form);
  const customerName = sanitizeText(data.get("name"), 80);
  const address = sanitizeMultiline(data.get("address"), 300);
  if (!customerName || !address) {
    showError("Please complete the delivery details.");
    return;
  }

  const paymentMethod = String(data.get("method"));
  const paymentReference = sanitizeText(data.get("reference"), 40);

  // Defense in depth: the browser's native `required` already blocks an
  // empty reference for Card/GCash, and COD releases it on the field. This
  // mirrors the rule in app logic so a markup change or programmatic submit
  // can't bypass it — same pattern as the deactivated-item check above.
  if (paymentMethod !== COD_METHOD && !paymentReference) {
    showError("Add the payment reference, or choose Cash on Delivery.");
    return;
  }

  const order = {
    id: createId("order"),
    userId: currentUser.id,
    customerName,
    address,
    paymentMethod,
    paymentReference,
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
