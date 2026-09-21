import { showError, showWarning } from "../components/toast.js";

const STORAGE_PREFIX = "ias2.commerce.";
const PERSISTED_KEYS = ["users", "items", "orders", "cart", "wishlist"];
const DATA_VERSION = 1;

function isQuotaError(error) {
  return error && (error.name === "QuotaExceededError" || error.code === 22 || error.code === 1014);
}

function load(key, fallback) {
  try {
    const value = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!value) return structuredClone(fallback);
    return JSON.parse(value);
  } catch {
    showWarning(`Saved "${key}" data was corrupted, so it has been reset to defaults.`);
    try {
      localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
    } catch {
      /* storage unavailable; nothing else to do */
    }
    return structuredClone(fallback);
  }
}

function save(key, value) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
  } catch (error) {
    if (isQuotaError(error)) {
      showError("Browser storage is full — your latest change was not saved.");
    } else {
      showError(`Could not save "${key}" — your latest change was not saved.`);
    }
  }
}

function exportData() {
  return {
    version: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    users: load("users", []),
    items: load("items", []),
    orders: load("orders", []),
    cart: load("cart", []),
    wishlist: load("wishlist", []),
    theme: localStorage.getItem(`${STORAGE_PREFIX}theme`) || "light"
  };
}

function importData(data) {
  PERSISTED_KEYS.forEach((key) => {
    if (Array.isArray(data[key])) save(key, data[key]);
  });
  if (data.theme === "light" || data.theme === "dark") {
    localStorage.setItem(`${STORAGE_PREFIX}theme`, data.theme);
  }
}

function clearAllData() {
  [...PERSISTED_KEYS, "currentUserId", "theme"].forEach((key) => {
    try {
      localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
    } catch {
      /* ignore */
    }
  });
}

export { load, save, exportData, importData, clearAllData, STORAGE_PREFIX };
