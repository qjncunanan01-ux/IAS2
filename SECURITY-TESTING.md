# Security Testing Checklist — IAS2 Commerce

A hands-on checklist for verifying the store's defenses against concrete
attacks. Every payload below was **run against the live app** during
development; the *Expected* column records the observed behavior, not just
the design intent. Use it for regression testing after changes, for a class
demonstration, or as the evidence log for a security report.

**Scope & honesty note:** this is a client-only demo (localStorage, no
backend). These tests verify the app's own defenses — CSP, escaping,
validation, lockout, session handling. A real attacker who can edit their
*own* localStorage can always fake *their own* local view; that is an
architectural property of no-backend apps, not a failure of these controls
(see the README's Security Model).

**How to run:** serve the app (`npx http-server -p 8080`), open DevTools
(F12) with the Console visible, and work through the tests in order. Some
tests mutate data — restore steps are included, and Test ST-10 wipes
everything clean at the end. Take a screenshot of each result for your
documentation.

Legend: ✅ = defense held as designed.

---

## 1. XSS (Cross-Site Scripting)

### ST-01 — Stored XSS via product name (the classic e-commerce attack)

An admin-stored value that renders for *every* visitor is the highest-value
XSS target in the app.

**Steps:**
1. Log in as admin (`admin@ias2.test` / `admin123`).
2. Admin → Items → Edit **Aura Desk Lamp**.
3. Replace the name with the payload below and save.
4. Return to the shop and hover the lamp card; watch the Console.

**Payload:**
```html
<img src=x onerror="alert('XSS-STORED')">
```

**Expected:** ✅ The name renders as **literal text** on the card — the
string `<img src=x onerror=...>` is visible on the page, no element is
created, and **no alert fires** (verified live). Every dynamic value is
HTML-escaped at render time.

**Also verify the same value in these sinks:** quick-view title, hero
banner title, cart line, order card, wishlist. All escape — check the
page renders text, and `document.querySelector('.product-card h3 img')`
returns `null`.

**Restore:** edit the item back to `Aura Desk Lamp`.

### ST-02 — Reflected-style XSS via search input

**Steps:** paste into the search box:

```
<script>alert('XSS-REFLECTED')</script><img src=x onerror=alert(1)>
```

**Expected:** ✅ The empty state shows the query as escaped text ("No
results for `<script>…</script>…`"), no alert fires, and the DOM contains
no injected `<script>` element (`document.querySelector('script')` count is
unchanged). Console shows no new errors.

### ST-03 — DOM XSS through toast messages

Toasts were a real sink (fixed); this proves the fix.

**Steps (Console, on any page):**
```js
showToast('<img src=x onerror="alert(\'XSS-TOAST\')">');
```

**Expected:** ✅ The toast displays the payload as text. Inspect it:
`document.querySelector('.toast span').innerHTML` starts with
`&lt;img` — escaped at the sink.

### ST-04 — CSP blocks an injected script tag even if escaping is bypassed

The last line of defense: even a hypothetical injection must not execute.

**Steps (Console):**
```js
document.body.insertAdjacentHTML('beforeend', "<script>alert('CSP-FAIL')</script>");
document.body.insertAdjacentHTML('beforeend', '<img src=x onerror="alert(\'CSP-FAIL\')">');
```

**Expected:** ✅ No alert. The Console shows a
`Refused to execute inline script` / `Refused to execute inline event
handler` **Content-Security-Policy violation**. No inline script runs
anywhere on the page (`script-src 'self'`; the only scripts are the two
same-origin files, no `onclick=` handlers, no inline `style=""`).

---

## 2. Brute force & account lockout

### ST-05 — Lockout engages and even correct passwords are rejected

**Steps:** log out; in the login form use `user@ias2.test` and submit a
wrong password 5 times (any string without a digit will do, e.g.
`wrongpass1`).

**Expected:**
- ✅ Attempt 4 shows the inline hint: *"Warning: 1 attempt remaining
  before a temporary lock."*
- ✅ Attempt 5 shows the red in-form banner **"Account temporarily
  locked"** with a live countdown ("You can try again in **0:30**") and
  the submit button disabled (reads "Locked").
- ✅ A toast repeats the generic message; no message ever says the
  password was right.
- ✅ **Now enter the CORRECT password (`user123`)** — it is still
  rejected with the countdown. Verify the persisted record:
  ```js
  JSON.parse(localStorage.getItem('ias2.commerce.lockout.user@ias2.test'))
  // { count: >=5, until: <future timestamp> }
  ```
- ✅ Close and reopen the login modal: the banner, countdown, and
  prefilled email persist.
- ✅ When the countdown ends the form re-enables itself and a "Login
  unlocked" toast appears; the correct password now works.

### ST-06 — Lockout penalties escalate

**Expected:** ✅ The first lock is 30s; each additional failure after a
lock grows the penalty (60s, 90s, … capped at 15 min). Watch the initial
countdown on each round, or check `until - Date.now()` from the record
above. (Unit-tested in `tests/security.test.js`.)

### ST-07 — No account enumeration via error messages

**Steps:** attempt logins with a **nonexistent email** and with a **real
email + wrong password**; compare the messages. Also try registering with
`admin@ias2.test` (an account that exists).

**Expected:** ✅ Identical generic error text in all cases ("Email or
password did not match.") — nothing reveals which emails hold accounts.
Registration also uses the generic message.

### ST-08 — No timing oracle for account existence

**Steps (Console, after opening the login modal):**
```js
const time = async (email) => {
  const form = document.querySelector('#authForm');
  form.querySelector('#authEmail').value = email;
  form.querySelector('#authPassword').value = 'TotallyWrong1';
  const t0 = performance.now();
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 400));
  return performance.now() - t0;
};
await time('nobody@nowhere.test');   // unknown account
await time('admin@ias2.test');       // real account
```

**Expected:** ✅ Both paths run the same SHA-256 work, so timings are in
the same ballpark (differences of a few ms run-to-run are noise; a
clear multi-fold gap would be a finding).

### ST-09 — Password policy enforced at credential creation

**Steps:** register (`R` shortcut or the Register tab) and try, in order:
`short`, `alllowercase1`, `ALLUPPERCASE1`, `NoDigitsHere`, then
`StrongPass1`.

**Expected:** ✅ The first four are rejected with specific messages
(length / lowercase / uppercase / digit). The fifth succeeds. (Legacy
demo accounts like `admin123` still log in — policy applies at creation,
not login.)

**Cleanup:** delete the test account via Admin → Users, or clear data at
the end (ST-10).

---

## 3. Privilege escalation (action-level authorization)

The UI hides admin buttons from customers; these tests prove the actions
themselves are guarded against console invocation.

### ST-10 — Customer cannot invoke admin operations

**Steps:** log in as the plain customer (`user@ias2.test` / `user123`),
open the Console, and run each line one at a time:

```js
const items = await import('/js/modules/item-admin.js');
items.deleteItem('item_lamp');            // try to delete a product

const users = await import('/js/modules/user-admin.js');
users.deleteUser('user_admin');           // try to delete the admin

const orders = await import('/js/modules/order-admin.js');
orders.deleteOrder('order_whatever');     // try to delete an order

const data = await import('/js/modules/data-tools.js');
data.handleClearAll();                    // try to wipe the whole store
```

**Expected:** ✅ Each shows **"Admin access required."**; the lamp still
exists (`app.state.items.some(i => i.id === 'item_lamp')` → `true`), the
admin account survives, and no reset happens. Every admin entry point
re-checks privileges at the action level.

### ST-11 — Customer cannot view another user's order

**Steps (still as the customer):**
```js
// Seed a foreign order, then try to open its details
app.state.orders.unshift({ id: 'order_foreign', userId: 'user_admin',
  customerName: 'Admin User', address: 'x', paymentMethod: 'Card',
  paymentReference: '1', status: 'Paid', createdAt: new Date().toISOString(),
  items: [{ itemId: 'item_lamp', name: 'Lamp', price: 1290, qty: 1 }], total: 1290 });
const oa = await import('/js/modules/order-admin.js');
oa.openOrderDetail('order_foreign');
```

**Expected:** ✅ Toast: *"You can only view your own orders."* and the
detail modal never opens. Then verify a **customer's own order still
opens** (seed one with `userId: 'user_demo'` and open it — the modal
appears, with the status select disabled).

**Cleanup:** `app.state.orders = []` (and restore any real orders you
kept), then `app.render()`.

---

## 4. Input validation & malicious data

### ST-12 — Image path guard (remote URL / traversal)

**Steps:** as admin, edit any item and set **Image Path** to each of:

```
https://evil.example/steal.jpg
../../etc/passwd.jpg
javascript:alert(1)
assets/img/x.jpg?track=1
```

**Expected:** ✅ Rejected on save with clear errors — "Image must be a
local path (no URLs)." for the URL, "Image path contains forbidden
characters." for traversal/query strings — and the form stays open.
A legitimate path (`assets/img/headphones.jpg`) saves fine. Admin-stored
paths can never point at remote trackers, non-image files, or traversal
targets.

### ST-13 — Field validation on items

**Steps:** in the item form try: price `-5`, price `99999999`, stock
`-2`, name `a`, category with 500 characters, description blank.

**Expected:** ✅ Each rejected with a specific message ("Price cannot be
below 0.", "Price cannot exceed 10000000.", "Quantity cannot be below
0.", name minimum length, category length cap, description required).
Legit values save.

### ST-14 — Checkout refuses deactivated items and tiny orders

**Steps:**
1. As customer, add any item to the cart.
2. In another tab (or via admin first): log in as admin and set that
   item **Inactive**. Then back as customer, open the cart and
   checkout.
3. Separately, cart nothing but attempt a manual sub-100 order via
   Admin → Orders → New Order (item price < 100 impossible in seed data —
   verify instead that a cart totaling < PHP 100 is blocked if you
   create a cheap item as admin first).

**Expected:** ✅ Checkout shows *"…is no longer available. Remove it to
continue."* and does not create an order. (The PHP 100 minimum is
enforced in `openCheckout`.)

### ST-15 — Fail-closed data import

**Steps:** Admin → Data Tools → Export JSON to get a valid file. Then
import each of these mutated versions:

1. Same file with one item's `price` changed to `-5`.
2. Same file with one item's `image` changed to `https://evil/x.jpg`.
3. Same file with an order's `total` changed to `999999` (or any absurd
   number).
4. Same file with one user's `email` changed to `not-an-email`.
5. The unmodified original.

**Expected:** ✅ Versions 1–4 are **rejected wholesale** with a message
naming the offending collection ("Import rejected: \"items\" contains
invalid records.") and *nothing* is written (reload — old data intact).
✅ Version 5 imports cleanly. ✅ Note version 3 especially: even if it
passed shape checks, totals are **always recomputed from the validated
lines**, so a tampered envelope cannot inflate recorded revenue.

### ST-16 — Control characters and oversize input

**Steps:** in any text field (e.g., item name) paste a string containing
zero-width/control characters and 10,000 characters:
```js
navigator.clipboard.writeText('bad\u0000\u0007name' + 'x'.repeat(10000))
```
then paste (Ctrl+V) into the field and save.

**Expected:** ✅ Saved cleanly but **sanitized**: control characters
stripped and the value hard-capped at the field's max length (inspect
`app.state.items.find(i => i.name.startsWith('bad'))?.name.length`).
No storage blow-ups, no rendering glitches.

---

## 5. Session security

### ST-17 — Session inactivity timeout

**Steps:**
1. Log in as any user.
2. Wait 15 minutes without touching the page (or, for a quicker demo,
   in Console set the persisted activity back before the idle clock
   would expire):
   ```js
   localStorage.setItem('ias2.commerce.lastActivity', String(Date.now() - 15 * 60_000 - 1000));
   ```
   then **reload the page**.

**Expected:** ✅ On reload you are logged out with *"Session expired.
Please log in again."* Reloading does **not** grant a fresh 15 minutes —
the idle clock is seeded from the persisted timestamp.

### ST-18 — Session timeout warning banner

**Steps:** stay logged in and idle for ~14 minutes (or shorten the
timeout for the demo in `js/utils/security.js` — `SESSION_TIMEOUT_MS`),
watch the bottom of the screen.

**Expected:** ✅ During the final minute a banner appears: "You'll be
signed out for security in 0:55 due to inactivity" with a live countdown
and a **Stay signed in** button. Clicking it dismisses the banner and
re-arms the 15-minute window. Guests (logged-out visitors) never see it.

### ST-19 — Logout clears everything

**Steps:** as any user, open the Console and note
`localStorage.getItem('ias2.commerce.currentUserId')` and
`...lastActivity`; then log out via the nav button.

**Expected:** ✅ Both keys are removed, the view resets to the shop, and
admin-only navigation (pressing `A` for admin) re-prompts for login.

---

## 6. Transport, headers & infrastructure

### ST-20 — Security headers on the live site

**Steps:** on your deployed InfinityFree URL (or any host serving the
`.htaccess`), run in a terminal:

```bash
curl -sI https://YOUR-SITE.infinityfree.me/ | grep -iE "content-security|x-frame|x-content|referrer|permissions|cross-origin"
```

**Expected:** ✅ `Content-Security-Policy` (script-src 'self', no
unsafe-inline), `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options:
nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy` (camera/mic/geolocation/payment/usb denied),
`Cross-Origin-Opener-Policy` / `Cross-Origin-Resource-Policy`. Note:
InfinityFree injects its own headers and the first visit shows a JS
challenge (`?i=1`) — that is hosting behavior, not a finding. The CSP
`<meta>` tag in `index.html` protects the page even where the host
strips headers.

### ST-21 — Clickjacking

**Steps:** save locally as `frame.html` and open it:
```html
<iframe src="https://YOUR-SITE.infinityfree.me/" width="800" height="600"></iframe>
```

**Expected:** ✅ The frame stays blank / the browser blocks it
(`X-Frame-Options: SAMEORIGIN` + CSP `frame-ancestors 'self'`).

### ST-22 — HTTPS enforcement

**Steps:** `curl -sI http://YOUR-SITE.infinityfree.me/ | head -5`

**Expected:** ✅ A `301` redirect to the `https://` URL.

### ST-23 — No supply-chain code

**Steps:** DevTools → Network tab → reload the site → filter by domain.

**Expected:** ✅ Every request goes to your own domain. The icon library
is vendored (`assets/vendor/lucide.min.js`); there is no CDN, no
analytics, no third-party script of any kind — nothing outside your
origin can run on the page.

---

## 7. Automated regression layer

The payloads above that test *pure logic* (lockout math, validators,
image-path guard, import sanitization, session expiry, escaping) are also
unit tests — 77 of them run in CI before every deploy:

```bash
npm test        # node --test — auto-discovers every tests/*.test.js file
```

`tests/security.test.js` (validators, image guard, lockout) and
`tests/import-session.test.js` (import sanitizers, session math) are the
security-relevant suites. If you change any `js/utils/security.js`
behavior, extend these tests alongside the checklist entry.

---

## Reporting template

For each test in your documentation:

| Field | Content |
| --- | --- |
| Test ID | e.g. ST-01 |
| Target | page / module under test |
| Payload / steps | the exact input used |
| Expected | what the defense should do |
| Observed | what actually happened |
| Evidence | screenshot / console excerpt |
| Verdict | Pass / Fail |

---

## Known limits (document these honestly)

- **Client-side authorization** — role checks run in the browser; a user
  editing their own localStorage can flip their local role to admin and
  see admin UI for *their own browser's* data. With no server there is
  nothing to actually attack — but it's the architectural ceiling.
- **localStorage is user-readable** — password *hashes* (salted SHA-256)
  sit in a store the user can read; the hashes protect against
  credential reuse, not local tampering.
- **Lockout is per-browser** — persisted per email in that browser's
  storage; a distributed or multi-device brute force is out of scope
  for a static app (and would be server-side in production).
- **Payments are simulated** — no real card data is processed; payment
  fields are demo placeholders.
