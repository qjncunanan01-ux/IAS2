import { state } from "./modules/state.js";
import { cacheElements, bindEvents, render } from "./modules/ui.js";
import { initAuth } from "./modules/auth.js";
import { initCart } from "./modules/cart.js";
import { initTheme, applyTheme } from "./modules/theme.js";
import { initCheckout } from "./modules/checkout.js";
import { initItemAdmin } from "./modules/item-admin.js";
import { initUserAdmin } from "./modules/user-admin.js";
import { initOrderAdmin } from "./modules/order-admin.js";
import { initModals } from "./modules/modals.js";
import { initQuickView } from "./modules/quick-view.js";
import { initDataTools } from "./modules/data-tools.js";
import { initKeyboardShortcuts, setShortcutsEnabled as enableShortcuts } from "./modules/keyboard.js";
import { setView } from "./modules/ui.js";

let elements = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheDOM();
  initializeModules();
  applyTheme();
  bindEvents();
  render();
});

window.app = {
  state,
  elements: {},
  render,
  setView,
  setShortcutsEnabled: enableShortcuts
};

function cacheDOM() {
  elements = {
    viewRoot: document.querySelector("#viewRoot"),
    storeToolbar: document.querySelector("#storeToolbar"),
    searchInput: document.querySelector("#searchInput"),
    categoryFilter: document.querySelector("#categoryFilter"),
    sortFilter: document.querySelector("#sortFilter"),
    cartCount: document.querySelector("#cartCount"),
    cartDrawer: document.querySelector("#cartDrawer"),
    cartLines: document.querySelector("#cartLines"),
    cartTotal: document.querySelector("#cartTotal"),
    authButton: document.querySelector("#authButton"),
    userBadge: document.querySelector("#userBadge"),
    authModal: document.querySelector("#authModal"),
    authForm: document.querySelector("#authForm"),
    authTitle: document.querySelector("#authTitle"),
    authEyebrow: document.querySelector("#authEyebrow"),
    checkoutModal: document.querySelector("#checkoutModal"),
    checkoutForm: document.querySelector("#checkoutForm"),
    entityModal: document.querySelector("#entityModal"),
    orderDetailModal: document.querySelector("#orderDetailModal"),
    quickViewModal: document.querySelector("#quickViewModal"),
    dataToolsModal: document.querySelector("#dataToolsModal"),
    toastArea: document.querySelector("#toastArea"),
    themeToggle: document.querySelector("#themeToggle")
  };
  window.app.elements = elements;
}

function initializeModules() {
  cacheElements(elements);
  initAuth(elements);
  initCart(elements);
  initTheme(elements);
  initCheckout(elements);
  initItemAdmin(elements);
  initUserAdmin(elements);
  initOrderAdmin(elements);
  initModals(elements);
  initQuickView(elements);
  initDataTools(elements);
  initKeyboardShortcuts();
}