import { state } from "./state.js";
import { save } from "../utils/storage.js";
import { showToast, showSuccess } from "../components/toast.js";
import { render } from "./ui.js";

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
}
