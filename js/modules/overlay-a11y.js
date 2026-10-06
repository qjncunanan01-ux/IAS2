// Accessibility layer for overlays: modals, cart drawer, lightbox.
//
// Every overlay here is a `.modal-layer` / `#cartDrawer` toggled by flipping
// the `hidden` class directly from ~15 call sites. Rather than retrofitting
// an open()/close() helper everywhere (and trusting every future call site),
// this module OBSERVES those toggles and layers on the behaviors a dialog
// needs that markup alone cannot provide:
//
//   1. initial focus — a newly opened overlay receives focus unless the
//      opener already moved it there (MutationObserver callbacks run as a
//      microtask, i.e. after the opener's synchronous code);
//   2. focus restore — closing returns focus to the element that triggered
//      the open (the last pointer/keyboard interaction outside any overlay);
//   3. containment — while any overlay is open the background gets the
//      `inert` attribute, so Tab cannot wander into the page behind, stray
//      clicks cannot hit it, and assistive tech drops the background
//      entirely. aria-modal already promises that to screen readers; inert
//      makes it true for the keyboard too.
//
// Toasts (#toastArea) and the cart announcer (#cartAnnouncer) live OUTSIDE
// .app-shell, so they are never inert and keep announcing while a dialog is
// open. Because state is derived from the DOM — not from call sites —
// Escape's close-all path, dynamically injected templates, and any future
// overlay are covered automatically.

const OVERLAY_SELECTOR = ".modal-layer, #cartDrawer";
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Last interaction outside any overlay — the candidate focus-restoration
// target for the next overlay that opens.
let lastTrigger = null;
// overlay element -> invoker captured when it opened.
const invokers = new WeakMap();
// Overlays currently tracked as open (added on open, deleted on close).
const openOverlays = new WeakSet();
let started = false;

function isOverlay(element) {
  return element instanceof Element && element.matches(OVERLAY_SELECTOR);
}

function isVisible(element) {
  return Boolean(element && element.isConnected && element.getClientRects().length);
}

// The invoker is only usable if it still exists and is on screen when the
// overlay closes (the page behind may have re-rendered meanwhile).
function validInvoker() {
  return isVisible(lastTrigger) ? lastTrigger : null;
}

function focusableWithin(root) {
  return root.querySelector(FOCUSABLE_SELECTOR);
}

function topLevelOverlay() {
  const open = [...document.querySelectorAll(".modal-layer:not(.hidden), #cartDrawer:not(.hidden)")];
  return { open, top: open.length ? open[open.length - 1] : null };
}

// Recompute containment from current DOM state. Order matters on close:
// this runs BEFORE focus restoration so the invoker is focusable again.
function syncContainment() {
  const { open, top } = topLevelOverlay();
  const shell = document.querySelector(".app-shell");
  if (shell) shell.inert = open.length > 0;
  for (const overlay of open) overlay.inert = overlay !== top;
  // Clear any stale inert left on elements that are no longer overlays/open.
  for (const element of document.querySelectorAll("[inert]")) {
    if (element !== shell && !open.includes(element)) element.inert = false;
  }
}

function handleToggle(overlay) {
  const visible = !overlay.classList.contains("hidden");
  const wasOpen = openOverlays.has(overlay);

  if (visible && !wasOpen) {
    // Opening: record the invoker, move focus in if the opener did not, and
    // only then push inert onto the background (focusing an element that is
    // about to become inert would knock focus back to <body>).
    openOverlays.add(overlay);
    invokers.set(overlay, validInvoker());
    const active = document.activeElement;
    if (!active || active === document.body || !overlay.contains(active)) {
      const target = focusableWithin(overlay);
      (target || overlay).focus({ preventScroll: true });
    }
    syncContainment();
    return;
  }

  if (!visible && wasOpen) {
    // Closing: drop containment first, then hand focus back. If the original
    // trigger is gone, hidden, or sitting in the still-inert background
    // (stacked overlays — e.g. checkout closes back onto the open cart
    // drawer), fall back to the top overlay that remains so focus never
    // lands on <body> while a dialog is still open.
    const invoker = invokers.get(overlay) || null;
    openOverlays.delete(overlay);
    invokers.delete(overlay);
    syncContainment();
    const { top } = topLevelOverlay();
    if (invoker && isVisible(invoker) && !invoker.closest("[inert]")) {
      invoker.focus({ preventScroll: true });
    } else if (top && !top.contains(document.activeElement)) {
      (focusableWithin(top) || top).focus({ preventScroll: true });
    }
  }
}

export function initOverlayA11y() {
  if (started) return;
  started = true;

  // Capture-phase so we record the trigger BEFORE any click handler opens
  // an overlay. Interactions INSIDE an overlay never update it — the
  // invoker of the open below must stay the outer trigger.
  document.addEventListener(
    "pointerdown",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest(OVERLAY_SELECTOR)) return;
      const focusable = target.closest(FOCUSABLE_SELECTOR);
      if (focusable) lastTrigger = focusable;
    },
    true
  );

  // Keyboard-triggered opens (the shortcut layer fires on bare keydown):
  // remember the currently focused element — but never a text field, which
  // mirrors the shortcut layer's own input exclusion.
  document.addEventListener(
    "keydown",
    () => {
      const active = document.activeElement;
      if (!active || active === document.body || active.closest(OVERLAY_SELECTOR)) return;
      const tag = active.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || active.isContentEditable) return;
      if (active.matches(FOCUSABLE_SELECTOR)) lastTrigger = active;
    },
    true
  );

  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "attributes" || mutation.attributeName !== "class") continue;
      if (isOverlay(mutation.target)) handleToggle(mutation.target);
    }
  }).observe(document.documentElement, {
    attributes: true,
    subtree: true,
    attributeFilter: ["class"]
  });
}
