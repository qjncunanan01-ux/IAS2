import { state } from "./state.js";
import { refreshIcons } from "../utils/helpers.js";

let els = {};

export function initTheme(elements) {
  els = elements;
  // First-run: respect the OS preference until the user picks a theme.
  if (!localStorage.getItem("ias2.commerce.theme")) {
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    state.theme = prefersDark ? "dark" : "light";
  }
}

export function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
  if (els.themeToggle) {
    els.themeToggle.innerHTML = state.theme === "light"
      ? '<i data-lucide="sun"></i>'
      : '<i data-lucide="moon"></i>';
    els.themeToggle.setAttribute("aria-label", state.theme === "light" ? "Switch to dark mode" : "Switch to light mode");
    refreshIcons();
  }
}

export function toggleTheme() {
  state.theme = state.theme === "light" ? "dark" : "light";
  localStorage.setItem("ias2.commerce.theme", state.theme);
  applyTheme();
}
