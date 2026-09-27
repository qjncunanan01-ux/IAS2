// Session inactivity tracking: after 15 minutes without interaction the
// expire callback fires (main.js wires it to logout). Imports nothing from
// other app modules, so auth.js can safely use resetSessionActivity.
import { sessionExpired } from "../utils/security.js";

const CHECK_INTERVAL_MS = 10_000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "focus"];

let lastActivity = Date.now();
let timerId = null;
let expireCallback = null;

export function resetSessionActivity() {
  lastActivity = Date.now();
}

export function initSession(onExpire) {
  expireCallback = onExpire;
  ACTIVITY_EVENTS.forEach((name) => {
    document.addEventListener(name, resetSessionActivity, { passive: true });
  });
  if (timerId) clearInterval(timerId);
  timerId = setInterval(() => {
    if (!expireCallback) return;
    if (sessionExpired(lastActivity, Date.now())) {
      expireCallback();
    }
  }, CHECK_INTERVAL_MS);
}
