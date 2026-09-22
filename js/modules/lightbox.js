import { state } from "./state.js";
import { escapeAttribute, refreshIcons } from "../utils/helpers.js";

let els = {};
let currentIndex = 0;

// Touch swipe tracking
let swipeTracking = false;
let swipeIntent = false;
let swipeStartX = 0;
let swipeStartY = 0;

const SWIPE_COMMIT_PX = 48;
const SWIPE_INTENT_PX = 14;

export function initLightbox(elements) {
  els = elements;
  // Arrow keys flip photos while the lightbox is open.
  document.addEventListener("keydown", (event) => {
    if (!els.lightboxModal || els.lightboxModal.classList.contains("hidden")) return;
    if (event.key === "ArrowLeft") navLightbox(-1);
    if (event.key === "ArrowRight") navLightbox(1);
  });

  // Touch gestures: drag-follow while swiping, commit past a threshold.
  // Listeners live on the layer itself so they survive content re-renders.
  const layer = els.lightboxModal;
  if (!layer) return;
  layer.addEventListener("touchstart", onTouchStart, { passive: true });
  layer.addEventListener("touchmove", onTouchMove, { passive: true });
  layer.addEventListener("touchend", onTouchEnd);
  layer.addEventListener("touchcancel", onTouchEnd);
}

function onTouchStart(event) {
  if (event.touches.length !== 1 || state.items.length < 2) return;
  swipeTracking = true;
  swipeIntent = false;
  swipeStartX = event.touches[0].clientX;
  swipeStartY = event.touches[0].clientY;
}

function onTouchMove(event) {
  if (!swipeTracking || event.touches.length !== 1) return;
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

  // Release the photo: back to the stylesheet transition, clear the drag.
  const img = els.lightboxModal.querySelector(".lightbox-figure img");
  if (img) {
    img.style.transition = "";
    img.style.transform = "";
  }

  if (swipeIntent && Math.abs(dx) > SWIPE_COMMIT_PX && Math.abs(dx) > Math.abs(dy) * 1.2) {
    navLightbox(dx < 0 ? 1 : -1);
  }
  swipeIntent = false;
}

export function openLightbox(itemId) {
  if (!els.lightboxModal) return;
  const index = state.items.findIndex((item) => item.id === itemId);
  if (index < 0) return;
  currentIndex = index;
  renderLightbox();
  els.lightboxModal.classList.remove("hidden");
  refreshIcons();
  els.lightboxModal.querySelector(".lightbox-close")?.focus();
}

export function navLightbox(delta) {
  const total = state.items.length;
  if (total < 2 || !els.lightboxModal || els.lightboxModal.classList.contains("hidden")) return;
  currentIndex = (currentIndex + delta + total) % total;
  updateLightboxContent();
}

export function closeLightbox() {
  if (!els.lightboxModal) return;
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
        </figcaption>
      </figure>
    </div>
  `;
}

// Swap image/caption/counter in place so navigation feels instant and the
// entrance animation does not replay on every flip.
function updateLightboxContent() {
  const item = currentItem();
  const panel = els.lightboxModal.querySelector(".lightbox-panel");
  if (!panel) return;

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
}
