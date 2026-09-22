import { state } from "./state.js";
import { escapeAttribute, refreshIcons } from "../utils/helpers.js";

let els = {};
let currentIndex = 0;

export function initLightbox(elements) {
  els = elements;
  // Arrow keys flip photos while the lightbox is open.
  document.addEventListener("keydown", (event) => {
    if (!els.lightboxModal || els.lightboxModal.classList.contains("hidden")) return;
    if (event.key === "ArrowLeft") navLightbox(-1);
    if (event.key === "ArrowRight") navLightbox(1);
  });
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
