import { state } from "./state.js";
import { escapeAttribute, refreshIcons } from "../utils/helpers.js";

let els = {};
let currentIndex = 0;

// Touch swipe tracking
let swipeTracking = false;
let swipeIntent = false;
let swipeStartX = 0;
let swipeStartY = 0;

// Zoom / pan state
const ZOOM_SCALE = 2.5;
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_PX = 30;
let zoom = null; // { tx, ty } while zoomed
let lastTapTime = 0;
let lastTapX = 0;
let lastTapY = 0;
let panning = false;
let panStartX = 0;
let panStartY = 0;
let panStartTx = 0;
let panStartTy = 0;

const SWIPE_COMMIT_PX = 48;
const SWIPE_INTENT_PX = 14;

export function initLightbox(elements) {
  els = elements;
  const layer = els.lightboxModal;
  if (!layer) return;

  document.addEventListener("keydown", (event) => {
    if (!isOpen()) return;
    if (event.key === "ArrowLeft") navLightbox(-1);
    if (event.key === "ArrowRight") navLightbox(1);
    // While zoomed, the first Escape un-zooms instead of closing. This
    // listener registers before keyboard.js, so stopping the event here
    // keeps the lightbox open; a second Escape then closes as usual.
    if (event.key === "Escape" && zoom) {
      event.preventDefault();
      event.stopImmediatePropagation();
      resetZoom();
    }
  });

  // Touch swipe gestures (swipe navigation is disabled while zoomed)
  layer.addEventListener("touchstart", onTouchStart, { passive: true });
  layer.addEventListener("touchmove", onTouchMove, { passive: true });
  layer.addEventListener("touchend", onTouchEnd);
  layer.addEventListener("touchcancel", onTouchEnd);

  // Double-tap zoom and drag-to-pan via pointer events (mouse + touch)
  layer.addEventListener("pointerdown", onPointerDown);
  layer.addEventListener("pointermove", onPointerMove);
  layer.addEventListener("pointerup", onPointerUp);
  layer.addEventListener("pointercancel", onPointerUp);
}

function isOpen() {
  return !!els.lightboxModal && !els.lightboxModal.classList.contains("hidden");
}

/* ---------- opening / closing / navigation ---------- */

export function openLightbox(itemId) {
  if (!els.lightboxModal) return;
  const index = state.items.findIndex((item) => item.id === itemId);
  if (index < 0) return;
  currentIndex = index;
  zoom = null;
  panning = false;
  renderLightbox();
  els.lightboxModal.classList.remove("hidden");
  refreshIcons();
  els.lightboxModal.querySelector(".lightbox-close")?.focus();
}

export function navLightbox(delta) {
  const total = state.items.length;
  if (total < 2 || !isOpen()) return;
  jumpLightbox((currentIndex + delta + total) % total);
}

export function jumpLightbox(index) {
  const total = state.items.length;
  if (index < 0 || index >= total || !isOpen()) return;
  currentIndex = index;
  updateLightboxContent();
}

export function closeLightbox() {
  if (!els.lightboxModal) return;
  zoom = null;
  panning = false;
  els.lightboxModal.classList.add("hidden");
  els.lightboxModal.innerHTML = "";
}

function currentItem() {
  return state.items[currentIndex];
}

function renderLightbox() {
  const item = currentItem();
  els.lightboxModal.innerHTML = `
    <div class="lightbox-panel" role="dialog" aria-modal="true" aria-label="Product photos">
      <button class="icon-button lightbox-close" type="button" data-action="close-lightbox" aria-label="Close full-size view">
        <i data-lucide="x"></i>
      </button>
      <button class="lightbox-nav lightbox-nav-prev" type="button" data-action="lightbox-prev" aria-label="Previous product photo">
        <i data-lucide="chevron-left"></i>
      </button>
      <button class="lightbox-nav lightbox-nav-next" type="button" data-action="lightbox-next" aria-label="Next product photo">
        <i data-lucide="chevron-right"></i>
      </button>
      <figure class="lightbox-figure">
        <img src="${escapeAttribute(item.image || "assets/placeholder.svg")}" alt="${escapeAttribute(item.name)}" />
        <figcaption class="lightbox-caption">
          <span class="lightbox-name">${escapeAttribute(item.name)}</span>
          <span class="lightbox-counter">${currentIndex + 1} / ${state.items.length}</span>
          <span class="lightbox-zoom-hint">double-tap to zoom</span>
        </figcaption>
      </figure>
      <div class="lightbox-thumbs" role="tablist" aria-label="Product photos">
        ${state.items.map((candidate, index) => `
          <button class="lightbox-thumb ${index === currentIndex ? "is-active" : ""}" type="button"
            role="tab" aria-selected="${index === currentIndex}" aria-label="Go to ${escapeAttribute(candidate.name)}"
            data-action="lightbox-jump" data-index="${index}">
            <img src="${escapeAttribute(candidate.image || "assets/placeholder.svg")}" alt="" loading="lazy" />
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

// Swap image/caption/counter in place so navigation feels instant and the
// entrance animation does not replay on every flip.
function updateLightboxContent() {
  const item = currentItem();
  const panel = els.lightboxModal.querySelector(".lightbox-panel");
  if (!panel) return;
  resetZoom();

  const img = panel.querySelector("img");
  const name = panel.querySelector(".lightbox-name");
  const counter = panel.querySelector(".lightbox-counter");

  if (img) {
    panel.classList.add("is-swapping");
    img.src = item.image || "assets/placeholder.svg";
    img.alt = item.name;
    const settle = () => panel.classList.remove("is-swapping");
    img.complete ? settle() : img.addEventListener("load", settle, { once: true });
  }
  if (name) name.textContent = item.name;
  if (counter) counter.textContent = `${currentIndex + 1} / ${state.items.length}`;

  // Move the active highlight and keep the strip scrolled to it.
  els.lightboxModal.querySelectorAll(".lightbox-thumb").forEach((thumb) => {
    const isActive = Number(thumb.dataset.index) === currentIndex;
    thumb.classList.toggle("is-active", isActive);
    thumb.setAttribute("aria-selected", String(isActive));
  });
  const strip = els.lightboxModal.querySelector(".lightbox-thumbs");
  const activeThumb = strip?.querySelector(".lightbox-thumb.is-active");
  if (strip && activeThumb) {
    strip.scrollLeft = activeThumb.offsetLeft - (strip.clientWidth - activeThumb.clientWidth) / 2;
  }
}

/* ---------- swipe (disabled while zoomed) ---------- */

function onTouchStart(event) {
  if (zoom || event.touches.length !== 1 || state.items.length < 2) return;
  swipeTracking = true;
  swipeIntent = false;
  swipeStartX = event.touches[0].clientX;
  swipeStartY = event.touches[0].clientY;
}

function onTouchMove(event) {
  if (!swipeTracking || zoom || event.touches.length !== 1) return;
  const dx = event.touches[0].clientX - swipeStartX;
  const dy = event.touches[0].clientY - swipeStartY;

  // Only claim the gesture once it is clearly horizontal.
  if (!swipeIntent) {
    if (Math.abs(dx) > SWIPE_INTENT_PX && Math.abs(dx) > Math.abs(dy) * 1.4) {
      swipeIntent = true;
    } else {
      return;
    }
  }

  // Photo follows the finger with resistance while dragging.
  const img = els.lightboxModal.querySelector(".lightbox-figure img");
  if (img) {
    img.style.transition = "none";
    img.style.transform = `translateX(${dx * 0.35}px)`;
  }
}

function onTouchEnd(event) {
  if (!swipeTracking) return;
  swipeTracking = false;

  const touch = event.changedTouches?.[0];
  const dx = touch ? touch.clientX - swipeStartX : 0;
  const dy = touch ? touch.clientY - swipeStartY : 0;

  // A zoom that started mid-gesture takes over: no follow cleanup, no nav.
  if (zoom || !swipeIntent) {
    swipeIntent = false;
    return;
  }

  // Release the photo: back to the stylesheet transition, clear the drag.
  const img = els.lightboxModal.querySelector(".lightbox-figure img");
  if (img) {
    img.style.transition = "";
    img.style.transform = "";
  }

  if (Math.abs(dx) > SWIPE_COMMIT_PX && Math.abs(dx) > Math.abs(dy) * 1.2) {
    navLightbox(dx < 0 ? 1 : -1);
  }
  swipeIntent = false;
}

/* ---------- double-tap zoom & drag-to-pan ---------- */

function onPointerDown(event) {
  if (!isOpen() || event.button > 0) return;
  // Only taps on the main photo; thumbnail images live outside .lightbox-figure.
  const img = els.lightboxModal.querySelector(".lightbox-figure img");
  if (!img || event.target !== img) return;

  const now = Date.now();
  const doubleTap = now - lastTapTime < DOUBLE_TAP_MS &&
    Math.hypot(event.clientX - lastTapX, event.clientY - lastTapY) < DOUBLE_TAP_PX;
  lastTapTime = now;
  lastTapX = event.clientX;
  lastTapY = event.clientY;

  if (doubleTap) {
    if (zoom) {
      resetZoom();
    } else {
      zoomAt(event, img);
    }
    // Consume the tap clock so an immediate pan (a third quick press) is not
    // misread as another double-tap.
    lastTapTime = 0;
    return;
  }

  if (zoom) {
    startPan(event, img);
  }
}

function zoomAt(event, img) {
  const w = img.offsetWidth;
  const h = img.offsetHeight;
  const rect = img.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const limitX = (w / 2) * (ZOOM_SCALE - 1);
  const limitY = (h / 2) * (ZOOM_SCALE - 1);

  // Center the tapped point in the frame, clamped so edges never detach.
  zoom = {
    tx: clamp(-ZOOM_SCALE * (x - w / 2), -limitX, limitX),
    ty: clamp(-ZOOM_SCALE * (y - h / 2), -limitY, limitY)
  };
  img.closest(".lightbox-figure")?.classList.add("is-zoomed");
  applyTransform(img, true);
  setHint("drag to pan · double-tap to reset");
}

function startPan(event, img) {
  panning = true;
  panStartX = event.clientX;
  panStartY = event.clientY;
  panStartTx = zoom.tx;
  panStartTy = zoom.ty;
  img.style.transition = "none";
  try {
    img.setPointerCapture(event.pointerId);
  } catch {
    /* synthetic events may not support capture; panning still works */
  }
}

function onPointerMove(event) {
  if (!panning || !zoom) return;
  const img = els.lightboxModal.querySelector(".lightbox-figure img");
  if (!img) return;

  const limitX = (img.offsetWidth / 2) * (ZOOM_SCALE - 1);
  const limitY = (img.offsetHeight / 2) * (ZOOM_SCALE - 1);
  zoom.tx = clamp(panStartTx + (event.clientX - panStartX), -limitX, limitX);
  zoom.ty = clamp(panStartTy + (event.clientY - panStartY), -limitY, limitY);
  applyTransform(img, false);
}

function onPointerUp() {
  if (!panning) return;
  panning = false;
  const img = els.lightboxModal.querySelector(".lightbox-figure img");
  if (img) img.style.transition = "";
}

function applyTransform(img, animated) {
  img.style.transition = animated ? "" : "none";
  img.style.transform = zoom ? `translate(${zoom.tx}px, ${zoom.ty}px) scale(${ZOOM_SCALE})` : "";
}

function resetZoom() {
  const wasZoomed = Boolean(zoom);
  zoom = null;
  panning = false;
  const img = els.lightboxModal?.querySelector(".lightbox-figure img");
  if (img && wasZoomed) applyTransform(img, true);
  els.lightboxModal?.querySelector(".lightbox-figure")?.classList.remove("is-zoomed");
  setHint("double-tap to zoom");
}

function setHint(text) {
  const hint = els.lightboxModal?.querySelector(".lightbox-zoom-hint");
  if (hint) hint.textContent = text;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
