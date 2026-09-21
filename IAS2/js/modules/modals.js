import { refreshIcons, focusFirstFocusable } from "../utils/helpers.js";

let els = {};

export function initModals(elements) {
  els = elements;
}

export function closeEntity() {
  els.entityModal?.classList.add("hidden");
  els.entityModal.innerHTML = "";
}

export function closeAuthModal() {
  els.authModal?.classList.add("hidden");
}

export function closeCheckoutModal() {
  els.checkoutModal?.classList.add("hidden");
}

export function closeOrderDetailModal() {
  els.orderDetailModal?.classList.add("hidden");
  els.orderDetailModal.innerHTML = "";
}

export function openModal(modalElement, content) {
  if (!modalElement) return;
  modalElement.innerHTML = content;
  modalElement.classList.remove("hidden");
  refreshIcons();
  focusFirstFocusable(modalElement);
}
