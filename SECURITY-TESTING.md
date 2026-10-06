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

Section 8 goes the other way on purpose: **Practice Mode** (`?lab=1`) turns a
few of those defenses off in one flag so the risk classes — stored/DOM/
reflected XSS and SQL injection — can be demonstrated and then shown fixed.
It is off on every normal URL; nothing in sections 1–7 changes.

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
app.showToast('<img src=x onerror="alert(\'XSS-TOAST\')">', 'warning', 20000);
```

**Expected:** ✅ The toast displays the payload as text. Inspect it:
`document.querySelector('.toast span').innerHTML` starts with
`&lt;img` — escaped at the sink. (`showToast` is exposed on `window.app` so
this test does not depend on guessing a module path.)

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
unsafe-inline; connect-src 'self' plus `https://*.supabase.co` /
`wss://*.supabase.co` for the optional Supabase backend — data only, no
cross-origin code execution), `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options:
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

**Expected:** ✅ Every request goes to your own domain. Both vendored
libraries — the icon set (`assets/vendor/lucide.min.js`) and the
Supabase client (`assets/vendor/supabase.min.js`) — are served from it;
there is no CDN, no analytics, no third-party script of any kind —
nothing outside your origin can run on the page (`script-src 'self'`
never moved). The single off-origin CSP entry, `connect-src` →
`*.supabase.co`, is data-only and stays dormant while the
`supabase-url` / `supabase-anon-key` metas in `index.html` are empty, so
with the shipped defaults the Network tab still shows zero off-origin
requests. `app.db.status()` in the console reports
`{ configured: false, connected: false }` for the same reason.

### Tool-assisted pass (ZAP / Burp)

ST-20…ST-23 can also be evidenced with OWASP ZAP and Burp Suite Community
against the deployed URL. **[ZAP-BURP-WALKTHROUGH.md](ZAP-BURP-WALKTHROUGH.md)**
is the step-by-step runbook: expected alerts (the one real finding is the
missing HSTS header), the InfinityFree `?i=1` JS-challenge that stops
non-JS scanners, project-specific false-positive traps, and what becomes
scannable after a backend is added.

---

## 7. Automated regression layer

The payloads above that test *pure logic* (lockout math, validators,
image-path guard, import sanitization, session expiry, escaping) are also
unit tests — 101 of them run in CI before every deploy:

```bash
npm test        # node --test — auto-discovers every tests/*.test.js file
```

`tests/security.test.js` (validators, image guard, lockout) and
`tests/import-session.test.js` (import sanitizers, session math) are the
security-relevant suites. If you change any `js/utils/security.js`
behavior, extend these tests alongside the checklist entry.

`tests/lab-mode.test.js` pins the other direction: that Practice Mode is off
without the flag, that `labUnsafeText()` is exactly `escapeHtml()` when it is
off, that the bypass has one implementation and two call sites, and that each
bundled payload still parses as the injection it claims to be.

`tests/tag-balance.test.js` guards the markup itself: every template literal
in `js/` and both static pages must balance their tags — the mechanical check
that would have caught the missing `</section>` in `renderHero()` before it
shipped — and it self-tests with known-bad fragments so the checker itself
can never go silently vacuous.

---

## 8. Practice Mode — demonstrating the risks (?lab=1)

Everything above tests a **defense**. This section does the opposite: it turns
a handful of defenses off *on purpose*, one flag at a time, so the class can
watch an attack succeed and then see the fix.

> **How it is gated.** Practice Mode is **off unless the URL contains
> `?lab=1`.** On the normal URL there is no banner, no SQL console, and every
> sink still escapes — verified by `tests/lab-mode.test.js` and by ST-25
> below. The flag is read once at boot by `js/utils/lab.js`.
>
> **Never ship this on with real data.** The whole point of the mode is that
> these code paths are known-bad. A red banner names the mode on screen while
> it is on.

The gate has exactly one implementation and three call sites — this is the
complete inventory of deliberate flaws:

| # | Sink | Vulnerable behavior | Normal build |
| --- | --- | --- | --- |
| 1 | `renderProductCard()` — `item.name` | product name rendered raw | `escapeHtml()` |
| 2 | `createToastElement()` — `message` | toast message rendered raw | `escapeHtml()` |
| 3 | `renderShop()` — search empty state | query echoed raw | `escapeHtml()` |
| 4 | `runQuery()` — SQL console | value concatenated into SQL | parameterised `?` |

Sinks 1–3 are reached through one shared helper, `labUnsafeText()`, so
`grep -rn labUnsafeText js/` is the whole attack surface. Sink 4 is a separate
*simulated* SQL engine (`js/modules/lab-sql.js`).

### ST-24 — Stored XSS in Practice Mode (payload lands in the DOM)

**Steps:**
1. Open `index.html?lab=1` — confirm the red **Practice Mode — deliberate
   flaws ON** banner at the bottom-left.
2. Log in as admin (`admin@ias2.test` / `admin123`).
3. Admin → Items → Edit **Aura Desk Lamp** and set the name to:
   ```html
   <img src=x onerror="alert('XSS-STORED')">
   ```
4. Save, then go to the shop.

**Expected:** ⚠️ **The defense does not hold — that is the point.** The
product card now contains a real `<img>` element:
`document.querySelector('.product-card h3 img')` is **not** `null`, and the
`<h3>`'s `innerHTML` starts with `<img src=` instead of `&lt;img src=`.

**Then note the honest caveat:** the Console shows
`Refused to execute inline event handler … "script-src 'self'"` — the
**`alert()` does not fire**, because the CSP in `index.html` still blocks
inline handlers (ST-04). This is the real lesson of the exercise: *escaping is
what makes the payload inert HTML; CSP is the second lock on the door.* To
show visible, purely-HTML impact with no JavaScript at all, use
`<b>owned</b>` or `<img src=x>` as the name — it renders, it breaks the layout,
and it needs no script execution.

**Restore:** edit the item back to `Aura Desk Lamp`, and leave `?lab=1` before
re-running ST-01.

### ST-25 — Practice Mode does not leak into the normal build

**Steps:** load plain `index.html` (no query string) and repeat ST-24's
payload.

**Expected:** ✅ The payload renders as literal text, no `<img>` is created,
`document.querySelector('#labBanner')` is `null`,
`app.lab.isEnabled()` is `false`, `app.lab.isRequested()` is `false`, and
`app.lab.openConsole()` refuses with a toast instead of opening anything.
This is the test that proves the mode is a demo harness and not a regression.

### ST-26 — DOM XSS through the toast, in Practice Mode

**Steps (Console, on `?lab=1`):**
```js
app.showToast('<b>INJECTED-TOAST</b>', 'warning', 20000);
```

**Expected:** ⚠️ `document.querySelector('.toast span b')` is **not** `null` —
the payload became a live element. With the flag off, the same call renders
`&lt;b&gt;` as text (ST-03).

### ST-27 — Reflected XSS through the search box, in Practice Mode

**Steps:** on `?lab=1`, type this into the search box (use a query that
matches nothing so the empty state renders):
```
<b>INJECTED-SEARCH</b><img src=x onerror="alert('XSS-REFLECTED')">
```

**Expected:** ⚠️ `document.querySelector('.empty-state p b')` is **not** `null`
and the `<p>`'s `innerHTML` contains `<b>`. No new `<script>` element is added
(the payload only injects markup — see ST-02/ST-04). Toggle Practice Mode off
from the banner and re-type: the same text renders escaped again.

### ST-28 — SQL injection in the simulated console

Open `?lab=1`, press **SQL console** in the banner, and log in as admin first
(the `users` table is admin-only, matching ST-10).

> This app has **no database** — state is in localStorage. The console is a
> **simulator**: it builds the real SQL string by concatenation and replays the
> effect each payload shape would have. It never executes SQL and never changes
> your data.

**Step 1 — the tautology (`Bypass the filter`):**
```js
' OR '1'='1
```
**Expected:** ⚠️ The statement shown on screen is
```sql
SELECT id, name, category, price, stock, active FROM items WHERE name = '' OR '1'='1';
```
— the payload closed the string literal. The result header reads
`items · 12 rows (leaked)` instead of one row. **This is how an auth check
`WHERE password = '<input>'` is bypassed.**

**Step 2 — cross-table exfiltration (`Steal another table`):**
```js
' UNION SELECT id, name, email, role, password FROM users --
```
**Expected:** ⚠️ A second table appears: `users · 2 rows (appended by UNION)`,
including the `password` column — a salted SHA-256 hash
(`sha256:<salt>:<hash>`) for accounts that have logged in at least once, or the
legacy seed value for accounts that have not. One extra result set is all an
attacker needs to read a table the UI never offers them.

**Step 3 — stacked statement (`Stack a DROP`):**
```js
'; DROP TABLE items; --
```
**Expected:** ⚠️ The console reports
`Stacked statement detected: DROP (simulated)` and returns no rows. **Your data
is untouched** — the simulator reports destructive payloads rather than running
them. Re-open Admin → Items to confirm all 12 products are still there. (On a
real server this is where a table disappears.)

**Step 4 — time-based blind injection (`Time-based blind`):**
```js
' OR SLEEP(5) --
```
**Expected:** ⚠️ Detected and explained: the response delay would be the data
channel. No delay is simulated — the page never blocks. The other three
payloads leak data *visibly*; this one is what a blind attacker would use when
the UI shows nothing.

**Step 5 — the fix, on the same payload:** press **Run parameterised instead**.
**Expected:** ✅ The statement becomes
`SELECT … FROM items WHERE name = ?` with no payload in it, and the result is
`items · 0 rows`. The payload was bound as *data*, so it is compared literally
and matches nothing. That is the whole remedy — prepared statements, not
input filtering.

**Restore:** close the console; no restore step needed (nothing is mutated).

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
- **Practice Mode is a client-side flag** — `?lab=1` unlocks the deliberate
  flaws for anyone who knows about it, so it is a *demonstration* switch, not
  a security boundary. On a hosted copy it is available to any visitor who
  types the query string; the reason it is acceptable here is that the
  "database" is each visitor's own localStorage, so the worst a lab visitor
  can break is their own copy. A real deployment must remove the code path
  entirely (or gate it server-side) rather than rely on obscurity.
- **The SQL console is simulated, not a real engine** — it classifies payload
  shapes and replays their documented effect. It is faithful about *which*
  payloads break out of the literal and what a real server would return; it is
  not a SQL parser, and no injection is ever executed.
