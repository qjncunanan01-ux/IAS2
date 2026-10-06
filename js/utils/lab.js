// ============================================================================
// PRACTICE MODE — deliberate, flag-gated vulnerabilities for classroom demo.
// ============================================================================
//
// The store ships SECURE. This module is the one and only switch that turns
// on intentionally weak code paths so the course requirements ("demonstrate
// potential risks such as XSS and SQL injection") can be shown live, by
// hand, on demand.
//
// Contract (do not weaken this):
//   * OFF unless the URL carries ?lab=1 (or ?lab=true|on|yes).
//   * OFF for every visitor who opens the normal URL. The banner, the SQL
//     console and the unsafe render branches are all unreachable, so the
//     default site is byte-for-byte the secure build.
//   * ON is visible: a fixed banner names the mode and offers a way out.
//
// Everything here is deliberately boring and greppable. `grep -rn labUnsafe
// js/` is the complete inventory of deliberately-unescaped sinks, and
// `grep -rn isLabEnabled js/` is the complete inventory of lab gates. If you
// add a sink, it must go through labUnsafeText() — never inline a raw
// `${value}` into an innerHTML template outside a file that opts in here.
//
// SECURITY NOTE: practice mode is a demonstration harness, not a real
// deployment mode. Never ship it enabled to real users or real data — the
// whole point is that these code paths are known-bad.

import { escapeHtml } from "./helpers.js?v=7bbd16f9";

/** Query-string key that unlocks the lab UI. */
export const LAB_PARAM = "lab";

/** Accepted "on" values. Anything else (absent, "0", "false", "banana") = off. */
const TRUTHY = new Set(["1", "true", "on", "yes"]);

/**
 * Pure parser for the flag, so it can be unit-tested without a DOM.
 * @param {string} search e.g. "?lab=1" or "lab=1&x=2" or "".
 * @returns {boolean}
 */
export function detectLabFlag(search) {
  if (typeof search !== "string" || !search) return false;
  const query = search.startsWith("?") ? search.slice(1) : search;
  if (!query) return false;
  return query.split("&").some((pair) => {
    const [key, ...rest] = pair.split("=");
    if (key !== LAB_PARAM) return false;
    let value = rest.join("=");
    try {
      value = decodeURIComponent(value.replaceAll("+", " "));
    } catch {
      /* malformed percent-encoding: fall back to the raw value */
    }
    return TRUTHY.has(value.trim().toLowerCase());
  });
}

/**
 * Current practice-mode state. Module-level on purpose: every consumer must
 * share ONE instance, which is why every import of this file carries the
 * ?v= fingerprint (see tools/fingerprint.mjs UNFINGERPRINTED + the
 * module-identity test). A second instance would be a silent dead toggle.
 */
let enabled = false;

/** True once the URL asked for the lab, even after the user turns it back off. */
let requested = false;

/**
 * @returns {boolean} true when practice mode was unlocked by the URL. The
 * banner stays available in that case even with the flaws switched off, so the
 * toggle can always be flipped back.
 */
export function isLabRequested() {
  return requested;
}

/** @returns {boolean} true when the vulnerable render paths are active. */
export function isLabEnabled() {
  return enabled;
}

/** Turn the deliberate flaws on/off. Used by the banner toggle + Console. */
export function setLabEnabled(value) {
  enabled = Boolean(value);
  return enabled;
}

/** Flip practice mode; returns the new state. */
export function toggleLabEnabled() {
  return setLabEnabled(!enabled);
}

/**
 * Initialize from the URL. Called once at boot.
 * @param {string} [search] defaults to window.location.search.
 * @returns {boolean} whether practice mode starts enabled.
 */
export function initLabFromUrl(search) {
  const raw = typeof search === "string" ? search : globalThis.location?.search || "";
  requested = detectLabFlag(raw);
  return setLabEnabled(requested);
}

/**
 * THE DELIBERATE BYPASS — the only sanctioned way to render unescaped text.
 *
 * Safe build: identical to escapeHtml(). Practice mode: returns the raw
 * value, which lets attacker-controlled HTML reach an innerHTML sink. This
 * is intentionally the one place that makes the vulnerability greppable.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function labUnsafeText(value) {
  if (enabled) return String(value ?? "");
  return escapeHtml(value);
}
