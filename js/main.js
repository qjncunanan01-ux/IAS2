import { state } from "./modules/state.js";
import { cacheElements, bindEvents, render } from "./modules/ui.js?v=a2fcb8e6";
import { initAuth } from "./modules/auth.js?v=aec43a94";
import { initCart } from "./modules/cart.js?v=b2fca542";
import { initTheme, applyTheme } from "./modules/theme.js?v=2364f364";
import { initCheckout } from "./modules/checkout.js?v=08d34311";
import { initItemAdmin } from "./modules/item-admin.js?v=8c4a97f2";
import { initUserAdmin } from "./modules/user-admin.js?v=c2d262b4";
import { initOrderAdmin } from "./modules/order-admin.js?v=4d38044b";
import { initModals } from "./modules/modals.js?v=266d3e8d";
import { initQuickView } from "./modules/quick-view.js?v=5f184dd6";
import { initLightbox } from "./modules/lightbox.js?v=990c66ab";
import { initDataTools } from "./modules/data-tools.js?v=b037983e";
import { initKeyboardShortcuts, setShortcutsEnabled as enableShortcuts } from "./modules/keyboard.js?v=1fe7d288";
import { initSession, rearmSession } from "./modules/session.js?v=f0f02091";
import { setView } from "./modules/ui.js?v=a2fcb8e6";
import { logout, enforceSessionExpiry } from "./modules/auth.js?v=aec43a94";

let elements = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheDOM();
  initializeModules();
  enforceSessionExpiry();
  applyTheme();
  bindEvents();
  render();
  // Auto-logout after 15 minutes of no interaction (security measure).
  initSession(
    () => logout("For your security, you were logged out after 15 minutes of inactivity."),
    () => Boolean(window.app.state.currentUserId)
  );
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
    lightboxModal: document.querySelector("#lightboxModal"),
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
  initLightbox(elements);
  initDataTools(elements);
  initKeyboardShortcuts();
}