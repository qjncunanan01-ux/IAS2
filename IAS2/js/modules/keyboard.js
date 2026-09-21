import { state } from "./state.js";
import { openAuth } from "./auth.js";
import { openCart } from "./cart.js";
import { toggleTheme } from "./theme.js";
import { setView } from "./ui.js";
import { openDataTools } from "./data-tools.js";
import { getCurrentUser, isAdmin } from "./auth.js";

let shortcutsEnabled = true;
let lastKey = "";
let lastKeyTime = 0;

export function initKeyboardShortcuts() {
  document.addEventListener("keydown", handleKeydown);
}

export function setShortcutsEnabled(enabled) {
  shortcutsEnabled = enabled;
}

function handleKeydown(event) {
  if (!shortcutsEnabled) return;
  
  // Don't trigger shortcuts when typing in inputs
  const activeElement = document.activeElement;
  const isInput = activeElement?.tagName === "INPUT" || 
                  activeElement?.tagName === "TEXTAREA" || 
                  activeElement?.tagName === "SELECT" ||
                  activeElement?.isContentEditable;
  
  if (isInput && !(event.ctrlKey || event.metaKey)) return;
  
  const key = event.key.toLowerCase();
  const ctrl = event.ctrlKey || event.metaKey;
  const shift = event.shiftKey;
  
  // Global shortcuts
  if (ctrl && key === "k") {
    event.preventDefault();
    focusSearch();
    return;
  }
  
  if (ctrl && key === "/") {
    event.preventDefault();
    showShortcutsHelp();
    return;
  }
  
  // Navigation shortcuts (without ctrl)
  if (!ctrl && !shift) {
    switch (key) {
      case "g":
        // Double tap 'g' to go to the shop
        if (lastKey === "g" && Date.now() - lastKeyTime < 600) {
          event.preventDefault();
          setView("shop");
          lastKey = "";
          return;
        }
        lastKey = "g";
        lastKeyTime = Date.now();
        return;
      case "o":
        event.preventDefault();
        setView("orders");
        break;
      case "a":
        if (isAdmin()) {
          event.preventDefault();
          setView("admin");
        }
        break;
      case "c":
        event.preventDefault();
        openCart();
        break;
      case "l":
        event.preventDefault();
        openAuth("login");
        break;
      case "r":
        event.preventDefault();
        openAuth("register");
        break;
      case "t":
        event.preventDefault();
        toggleTheme();
        break;
      case "d":
        if (isAdmin()) {
          event.preventDefault();
          openDataTools();
        }
        break;
    }
  }
  
  // Admin shortcuts with shift
  if (shift && !ctrl) {
    switch (key) {
      case "i":
        if (isAdmin()) {
          event.preventDefault();
          // Switch to items tab
          const tab = document.querySelector('[data-admin-tab="items"]');
          tab?.click();
        }
        break;
      case "u":
        if (isAdmin()) {
          event.preventDefault();
          const tab = document.querySelector('[data-admin-tab="users"]');
          tab?.click();
        }
        break;
      case "o":
        if (isAdmin()) {
          event.preventDefault();
          const tab = document.querySelector('[data-admin-tab="orders"]');
          tab?.click();
        }
        break;
    }
  }

  if (event.key === "Escape") {
    closeAllOverlays();
  }
}

function focusSearch() {
  const searchInput = document.querySelector("#searchInput");
  if (searchInput) {
    searchInput.focus();
    searchInput.select();
  }
}

function closeAllOverlays() {
  document.querySelectorAll(".modal-layer:not(.hidden)").forEach(modal => {
    modal.classList.add("hidden");
  });
  document.querySelector("#cartDrawer")?.classList.add("hidden");
}

function showShortcutsHelp() {
  const help = `
    <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="shortcutsTitle" style="max-width: 520px;">
      <div class="modal-header">
        <div>
          <p class="eyebrow">Help</p>
          <h2 id="shortcutsTitle">Keyboard Shortcuts</h2>
        </div>
        <button class="icon-button" type="button" data-action="close-entity" aria-label="Close shortcuts help">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="shortcuts-list">
        <h3>Navigation</h3>
        <dl>
          <dt>G G</dt><dd>Go to Shop (double tap)</dd>
          <dt>O</dt><dd>View Orders</dd>
          <dt>A</dt><dd>Admin Panel (admin only)</dd>
          <dt>C</dt><dd>Open Cart</dd>
          <dt>L</dt><dd>Login</dd>
          <dt>R</dt><dd>Register</dd>
          <dt>T</dt><dd>Toggle Dark Mode</dd>
          <dt>D</dt><dd>Data Tools (admin only)</dd>
        </dl>
        <h3>Global</h3>
        <dl>
          <dt>Ctrl+K</dt><dd>Focus Search</dd>
          <dt>Ctrl+/</dt><dd>Show This Help</dd>
          <dt>Esc</dt><dd>Close Modals</dd>
        </dl>
        <h3>Admin Tabs</h3>
        <dl>
          <dt>Shift+I</dt><dd>Items Tab</dd>
          <dt>Shift+U</dt><dd>Users Tab</dd>
          <dt>Shift+O</dt><dd>Orders Tab</dd>
        </dl>
      </div>
    </div>
  `;
  
  const modalLayer = document.querySelector("#entityModal");
  if (modalLayer) {
    modalLayer.innerHTML = help;
    modalLayer.classList.remove("hidden");
    if (window.lucide) window.lucide.createIcons();
  }
}