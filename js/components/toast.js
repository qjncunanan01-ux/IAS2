import { refreshIcons } from "../utils/helpers.js?v=7bbd16f9";
import { labUnsafeText } from "../utils/lab.js?v=8d55df8c";

const toastTypes = {
  success: { icon: "check-circle", color: "var(--green)" },
  error: { icon: "x-circle", color: "var(--danger)" },
  warning: { icon: "alert-triangle", color: "var(--amber)" },
  info: { icon: "info", color: "var(--brand)" }
};

function createToastElement(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  const { icon } = toastTypes[type] || toastTypes.info;
  toast.innerHTML = `
    <i data-lucide="${icon}" class="toast-icon"></i>
    <span>${labUnsafeText(message)}</span>
  `;
  return toast;
}

export function showToast(message, type = "info", duration = 3200) {
  const toastArea = document.querySelector("#toastArea");
  if (!toastArea) return;
  
  const toast = createToastElement(message, type);
  toastArea.append(toast);
  refreshIcons();
  
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "opacity 0.3s ease, transform 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

export function showSuccess(message, duration) {
  return showToast(message, "success", duration);
}

export function showError(message, duration) {
  return showToast(message, "error", duration);
}

export function showWarning(message, duration) {
  return showToast(message, "warning", duration);
}

export function showInfo(message, duration) {
  return showToast(message, "info", duration);
}