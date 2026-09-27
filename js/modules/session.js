// Session inactivity tracking: after 15 minutes without interaction the
// user is logged out automatically. A 60-second warning banner with a live
// countdown and a "Stay signed in" button gives them a chance to keep
// working; any interaction during the warning window cancels the expiry.
//
// The expiry is latched — it fires at most once per login — and re-armed on
// the next successful login (rearmSession). The interval skips everything
// while isActive() reports no logged-in user, so guests never see the
// warning banner. Imports nothing from other app modules, so auth.js can
// safely use resetSessionActivity without an import cycle.

import { sessionExpired, shouldWarnSession, SESSION_TIMEOUT_MS, LAST_ACTIVITY_KEY } from "../utils/security.js";

const CHECK_INTERVAL_MS = 10_000;
const WRITE_THROTTLE_MS = 30_000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "focus"];

// Seeded from the persisted timestamp so the idle clock survives reloads:
// a user idle 14 minutes who reloads does not get 15 fresh minutes.
let lastActivity = (() => {
  try {
    const stored = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || "0");
    return stored || Date.now();
  } catch {
    return Date.now();
  }
})();
let lastWrite = 0;
let timerId = null;
let expireCallback = null;
let isActiveCheck = null;
let expiredFired = false;

export function resetSessionActivity() {
  lastActivity = Date.now();
  // Throttle the persisted write: user events can fire many times a second.
  const now = Date.now();
  if (now - lastWrite > WRITE_THROTTLE_MS) {
    lastWrite = now;
    try {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
    } catch {
      /* storage unavailable: expiry-on-reload just degrades */
    }
  }
  hideWarning();
}

// Re-arm after a fresh login so the next idle period expires normally.
export function rearmSession() {
  expiredFired = false;
  lastActivity = Date.now();
  hideWarning();
}

export function initSession(onExpire, isActive) {
  expireCallback = onExpire;
  isActiveCheck = isActive || (() => true);
  ACTIVITY_EVENTS.forEach((name) => {
    document.addEventListener(name, resetSessionActivity, { passive: true });
  });
  if (timerId) clearInterval(timerId);
  timerId = setInterval(() => {
    if (!expireCallback || !isActiveCheck()) return;
    if (expiredFired) return;
    const now = Date.now();
    if (sessionExpired(lastActivity, now)) {
      expiredFired = true;
      hideWarning();
      expireCallback();
      return;
    }
    if (shouldWarnSession(lastActivity, now)) {
      showWarning();
    } else {
      hideWarning();
    }
  }, CHECK_INTERVAL_MS);
}

/* ---------- warning banner ---------- */

let countdownTimerId = null;

function showWarning() {
  let banner = document.getElementById("sessionWarning");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "sessionWarning";
    banner.className = "session-warning";
    banner.setAttribute("role", "alert");
    banner.innerHTML = `
      <span class="session-warning-text">You'll be signed out for security in <strong id="sessionCountdown">1:00</strong> due to inactivity.</span>
      <button class="secondary-button" type="button" id="sessionStay">Stay signed in</button>
    `;
    document.body.append(banner);
    banner.querySelector("#sessionStay")?.addEventListener("click", () => {
      rearmSession();
    });
  }
  banner.classList.add("is-visible");
  if (countdownTimerId) clearInterval(countdownTimerId);
  countdownTimerId = setInterval(() => {
    // Countdown to the actual expiry (not from the warning start): the idle
    // clock already includes the 14 quiet minutes before the banner appeared.
    const remaining = SESSION_TIMEOUT_MS - (Date.now() - lastActivity);
    const target = document.getElementById("sessionCountdown");
    if (target) {
      target.textContent = formatCountdownLabel(remaining);
    }
    if (remaining <= 0) {
      clearInterval(countdownTimerId);
      countdownTimerId = null;
    }
  }, 1000);
}

function hideWarning() {
  const banner = document.getElementById("sessionWarning");
  if (banner) banner.classList.remove("is-visible");
  if (countdownTimerId) {
    clearInterval(countdownTimerId);
    countdownTimerId = null;
  }
}

function formatCountdownLabel(msRemaining) {
  const seconds = Math.max(0, Math.ceil(msRemaining / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
