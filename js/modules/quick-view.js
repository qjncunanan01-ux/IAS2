import { state } from "./state.js";
import { escapeHtml, escapeAttribute, formatMoney } from "../utils/helpers.js";
import { refreshIcons, focusFirstFocusable } from "../utils/helpers.js";
import { closeEntity } from "./modals.js";
import { addToCart } from "./cart.js";
import { relatedItems } from "./stats.js";
import { renderStockChip, renderCategoryChip } from "../components/render-helpers.js";

let els = {};

export function initQuickView(elements) {
  els = elements;
}

export function openQuickView(itemId) {
  const item = state.items.find((candidate) => candidate.id === itemId);
  if (!item) return;

  els.quickViewModal.innerHTML = renderQuickView(item);
  els.quickViewModal.classList.remove("hidden");
  refreshIcons();
  focusFirstFocusable(els.quickViewModal);
}

// Re-render the open quick view after a wishlist toggle from inside it, so
// the button label and the related rail's hearts stay in sync.
export function refreshQuickView(itemId) {
  if (!els.quickViewModal || els.quickViewModal.classList.contains("hidden")) return;
  const item = state.items.find((candidate) => candidate.id === itemId);
  if (!item) return;
  els.quickViewModal.innerHTML = renderQuickView(item);
  refreshIcons();
}

export function closeQuickView() {
  els.quickViewModal.classList.add("hidden");
  els.quickViewModal.innerHTML = "";
}

function renderQuickView(item) {
  const disabled = !item.active || Number(item.stock) < 1;
  const inWishlist = state.wishlist?.includes(item.id);
  
  return `
    <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="quickViewTitle" style="max-width: 680px;">
      <div class="modal-header">
        <div>
          <p class="eyebrow">${escapeHtml(item.category)}</p>
          <h2 id="quickViewTitle">${escapeHtml(item.name)}</h2>
        </div>
        <button class="icon-button" type="button" data-action="close-entity" aria-label="Close quick view">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="quick-view-content">
        <figure class="quick-view-media">
          <button class="media-zoom-button" type="button" data-action="open-lightbox" data-id="${escapeAttribute(item.id)}" aria-label="View ${escapeAttribute(item.name)} full size">
            <img src="${escapeAttribute(item.image || "assets/placeholder.svg")}" alt="${escapeAttribute(item.name)}" />
            <span class="media-zoom-hint"><i data-lucide="zoom-in"></i> View full size</span>
          </button>
        </figure>
        <div class="quick-view-info">
          <div class="quick-view-price">${formatMoney(item.price)}</div>
          <div class="tag-row">
            ${renderCategoryChip(item.category)}
            ${renderStockChip(item)}
            <span class="status-pill ${item.active ? "paid" : "cancelled"}">${item.active ? "Active" : "Inactive"}</span>
          </div>
          <p>${escapeHtml(item.description)}</p>
          <div class="quick-view-actions">
            <button class="primary-button wide" type="button" data-action="add-cart" data-id="${escapeAttribute(item.id)}" ${disabled ? "disabled" : ""}>
              <i data-lucide="shopping-cart"></i>
              Add to Cart
            </button>
            <button class="secondary-button wide" type="button" data-action="${inWishlist ? "remove-wishlist" : "add-wishlist"}" data-id="${escapeAttribute(item.id)}">
              <i data-lucide="${inWishlist ? "heart-off" : "heart"}"></i>
              ${inWishlist ? "Remove from Wishlist" : "Save for Later"}
            </button>
          </div>
        </div>
      </div>
      ${renderRelatedItems(item)}
    </div>
  `;
}

function renderRelatedItems(item) {
  const related = relatedItems(item.id, 3);
  if (!related.length) return "";
  return `
    <div class="quick-view-related">
      <h3>You might also like</h3>
      <div class="related-rail">
        ${related
          .map(
            (candidate) => `
              <button class="related-card" type="button" data-action="quick-view" data-id="${escapeAttribute(candidate.id)}" aria-label="Quick view ${escapeAttribute(candidate.name)}">
                <img src="${escapeAttribute(candidate.image || "assets/placeholder.svg")}" alt="" loading="lazy" />
                <span class="related-name">${escapeHtml(candidate.name)}</span>
                <strong class="related-price">${formatMoney(candidate.price)}</strong>
              </button>`
          )
          .join("")}
      </div>
    </div>
  `;
}
