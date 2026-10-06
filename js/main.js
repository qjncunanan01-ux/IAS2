import { state } from "./modules/state.js";
import { cacheElements, bindEvents, render } from "./modules/ui.js?v=f811eaeb";
import { initAuth } from "./modules/auth.js?v=aec43a94";
import { initCart } from "./modules/cart.js?v=ca844d25";
import { initTheme, applyTheme } from "./modules/theme.js?v=2364f364";
import { initCheckout } from "./modules/checkout.js?v=70b4337b";
import { initItemAdmin } from "./modules/item-admin.js?v=8c4a97f2";
import { initUserAdmin } from "./modules/user-admin.js?v=c2d262b4";
import { initOrderAdmin } from "./modules/order-admin.js?v=78d320da";
import { initModals } from "./modules/modals.js?v=266d3e8d";
import { initQuickView } from "./modules/quick-view.js?v=5f184dd6";
import { initLightbox } from "./modules/lightbox.js?v=990c66ab";
import { initDataTools } from "./modules/data-tools.js?v=b037983e";
import { showToast } from "./components/toast.js?v=ce0cbc8e";
import { initLab, openConsole as openLabConsole, closeConsole as closeLabConsole, runLabQuery, LAB_SINKS } from "./modules/lab-panel.js?v=b679f4a5";
import { isLabEnabled, setLabEnabled, toggleLabEnabled, isLabRequested } from "./utils/lab.js?v=8d55df8c";
import { SAMPLE_PAYLOADS } from "./modules/lab-sql.js?v=f324aa97";
import { initKeyboardShortcuts, setShortcutsEnabled as enableShortcuts } from "./modules/keyboard.js?v=6e1ca5bd";
import { initSession, rearmSession } from "./modules/session.js?v=f0f02091";
import { getDb, getDbStatus, isSupabaseConfigured, resetDbClient } from "./modules/db.js?v=0d2368ed";
import { initOverlayA11y } from "./modules/overlay-a11y.js?v=dd846150";
import { setView } from "./modules/ui.js?v=f811eaeb";
import { logout, enforceSessionExpiry } from "./modules/auth.js?v=aec43a94";

let elements = {};

document.addEventListener("DOMContentLoaded", () => {
  initOverlayA11y();
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
  setShortcutsEnabled: enableShortcuts,
  // Exposed so ST-03 (DOM XSS through the toast sink) is runnable from the
  // Console without guessing a module path: app.showToast(payload).
  showToast,
  // Practice Mode surface (see js/utils/lab.js). Without ?lab=1, isEnabled()
  // is false and isRequested() is false, so everything here is inert.
  lab: {
    isEnabled: isLabEnabled,
    isRequested: isLabRequested,
    enable: () => setLabEnabled(true),
    disable: () => setLabEnabled(false),
    toggle: toggleLabEnabled,
    openConsole: openLabConsole,
    closeConsole: closeLabConsole,
    runQuery: runLabQuery,
    sinks: LAB_SINKS,
    payloads: SAMPLE_PAYLOADS
  },
  // Supabase scaffold (js/modules/db.js): not wired into app state —
  // localStorage is still the source of truth. All accessors are
  // fail-closed, so today app.db.client() === null and app.db.status()
  // reports { libLoaded: true, configured: false, connected: false }.
  db: {
    client: getDb,
    isConfigured: isSupabaseConfigured,
    status: getDbStatus,
    reset: resetDbClient
  }
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
    topbarAccount: document.querySelector("#topbarAccount"),
    accountMenu: document.querySelector("#accountMenu"),
    accountMenuToggle: document.querySelector("#accountMenuToggle"),
    accountMenuInitials: document.querySelector("#accountMenuInitials"),
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
    labConsole: document.querySelector("#labConsole"),
    lightboxModal: document.querySelector("#lightboxModal"),
    toastArea: document.querySelector("#toastArea"),
    cartAnnouncer: document.querySelector("#cartAnnouncer"),
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
  // Practice Mode: gated on ?lab=1, so this is a no-op on the normal URL.
  initLab(elements, render);
  initKeyboardShortcuts();
}