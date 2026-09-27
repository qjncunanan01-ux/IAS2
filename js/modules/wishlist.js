import { state } from "./state.js";
import { save } from "../utils/storage.js?v=ff51bd7c";
import { showToast, showSuccess } from "../components/toast.js?v=083997a1";
import { render } from "./ui.js?v=a2fcb8e6";
import { refreshQuickView } from "./quick-view.js?v=5f184dd6";

export function getWishlistLines() {
  return state.wishlist
    .map((itemId) => state.items.find((item) => item.id === itemId))
    .filter(Boolean);
}

export function isInWishlist(itemId) {
  return state.wishlist.includes(itemId);
}

export function toggleWishlist(itemId) {
  const item = state.items.find((candidate) => candidate.id === itemId);
  if (!item) return;

  const index = state.wishlist.indexOf(itemId);
  if (index >= 0) {
    state.wishlist.splice(index, 1);
    save("wishlist", state.wishlist);
    showToast(`${item.name} removed from wishlist.`);
  } else {
    state.wishlist.push(itemId);
    save("wishlist", state.wishlist);
    showSuccess(`${item.name} added to wishlist.`);
  }
  render();
  refreshQuickView(itemId);
}
