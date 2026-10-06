# Security Evidence Report — IAS2 Commerce

Hands-on verification of the defenses documented in
[SECURITY-TESTING.md](SECURITY-TESTING.md), executed **against the live
deployment at https://ias2.infinityfree.me** (the production host, not a
local dev server). Every result below records what was actually observed.

**Method & environment**

- Live site loaded in an isolated incognito browser profile (fresh storage;
  no stale session, no cached HTML). InfinityFree's first-visit `?i=1` JS
  challenge was present — that is hosting behavior, not an app finding.
- Each test was executed through the app's real code paths (forms, buttons,
  exported module functions), with results read back from the live DOM,
  `window.app.state`, `localStorage`, and the browser console.
- Interleaved checks confirmed the suite left no residue: seeded records
  removed, edited items restored byte-exact, cart untouched.

**Scope & honesty note:** this is a client-only demo (localStorage, no
backend). These tests verify the app's own defenses — CSP, escaping,
validation, lockout, session handling. A real attacker who can edit *their
own* localStorage can always fake *their own* local view; that is an
architectural property of no-backend apps, not a failure of these controls
(see the README's Security Model and the checklist's Known Limits).

---

## Results at a glance

| Test | Target | Verdict |
| --- | --- | --- |
| ST-01 | Stored XSS via product name | ✅ Pass |
| ST-02 | Reflected XSS via search input | ✅ Pass |
| ST-03 | DOM XSS through toast messages | ✅ Pass |
| ST-04 | CSP blocks injected script | ✅ Pass |
| ST-10 | Admin actions from a customer session | ✅ Pass |
| ST-11 | Cross-user order access | ✅ Pass |
| ST-16 | Control characters / oversize input | ✅ Pass |

---

## 1. XSS (Cross-Site Scripting)

### ST-01 — Stored XSS via product name

| Field | Content |
| --- | --- |
| Test ID | ST-01 |
| Target | Item name field (admin) → product card, hero banner, quick-view, admin table |
| Payload / steps | Logged in as admin via the real form; saved item name `<img src=x onerror="alert('XSS-STORED')">`; browsed shop, hovered the lamp card, opened quick-view |
| Expected | Name renders as literal text everywhere; no element created; no alert |
| Observed | The raw payload string renders as visible text in the card, hero, quick-view and admin table. No `<img>` element was created, no alert fired, no console errors. Value restored afterward. |
| Evidence | Screenshot captured during the live session; DOM inspection showed no `.product-card h3 img` element |
| Verdict | ✅ Pass — every dynamic value is HTML-escaped at render time |

### ST-02 — Reflected-style XSS via search input

| Field | Content |
| --- | --- |
| Test ID | ST-02 |
| Target | `#searchInput` → empty-state message |
| Payload / steps | `<script>alert('XSS-REFLECTED')</script><img src=x onerror=alert(1)>` typed into search |
| Expected | Query shown as escaped text; no script/img injection; no alert |
| Observed | Empty state printed the payload as literal text ("No results for …"). Script-tag count unchanged, no `img[src=x]` in the DOM, no alert. Search cleared afterward (grid back to 12 cards). |
| Evidence | Live DOM inspection: `querySelectorAll('script')` count unchanged; no injected image node |
| Verdict | ✅ Pass |

### ST-03 — DOM XSS through toast messages

| Field | Content |
| --- | --- |
| Test ID | ST-03 |
| Target | Toast sink (`showToast`) |
| Payload / steps | `showToast('<img src=x onerror="alert(\'XSS-TOAST\')">')` from the console |
| Expected | Payload displayed as text, escaped at the sink |
| Observed | Toast body contained `&lt;img` (escaped) — the HTML string never became a node; no alert |
| Evidence | `.toast span` innerHTML inspection during the session |
| Verdict | ✅ Pass (regression proof for the previously fixed sink) |

### ST-04 — CSP blocks an injected script tag even if escaping is bypassed

| Field | Content |
| --- | --- |
| Test ID | ST-04 |
| Target | Document body — last line of defense |
| Payload / steps | `document.body.insertAdjacentHTML('beforeend', "<script>alert('CSP-FAIL')</script>")` then the `<img src=x onerror="alert('CSP-FAIL')">` variant; `window.alert` hooked with a counter first |
| Expected | No alert; console shows CSP refusals under `script-src 'self'` |
| Observed | `alertsFired: 0` despite the hook. The injected `<script>` node sat inert in the DOM (parsed but never executed). Console recorded two violations: *"Refused to execute inline event handler because it violates the following Content Security Policy directive: \"script-src 'self'\""*. The only console noise besides the violations were two 404s — the payload's own `img src=x` request, which is the attack itself failing. |
| Evidence | Hooked-alert counter `0`; `document.scripts` count unchanged by execution; CSP refusal messages in the console log |
| Verdict | ✅ Pass — even a hypothetical escaping bypass cannot execute |

---

## 2. Privilege escalation (action-level authorization)

### ST-10 — Customer cannot invoke admin operations

| Field | Content |
| --- | --- |
| Test ID | ST-10 |
| Target | `deleteItem`, `deleteUser`, `deleteOrder`, `handleClearAll` (data-tools reset) |
| Payload / steps | Logged in as the plain customer (`user@ias2.test`); invoked each function directly from the console with real IDs |
| Expected | Every entry point refuses with "Admin access required."; nothing is mutated |
| Observed | All four calls returned **"Admin access required."** The lamp item still existed (`items.some(i => i.id === 'item_lamp')` → true), the admin account survived, no store reset occurred (item count unchanged at 12) |
| Evidence | Toast text captured per call; state assertions after each call |
| Verdict | ✅ Pass — UI hiding is backed by action-level guards |

**Re-verified 2026-10-02 (live, current build):** re-run as the customer
(`user@ias2.test`) against a fresh load of the deployed build
(`main.js?v=a75d0069`, matching local HEAD). All four console-invoked
operations returned **"Admin access required."** with zero state change
(12 items, 2 users, 0 orders throughout). Console clean.

### ST-11 — Customer cannot view another user's order

| Field | Content |
| --- | --- |
| Test ID | ST-11 |
| Target | `openOrderDetail` ownership guard |
| Payload / steps | Seeded a foreign order (`userId: 'user_admin'`) and an own order (`userId: 'user_demo'`) into in-memory state; invoked `openOrderDetail` on each via the app's own fingerprinted module instance |
| Expected | Foreign order: warning toast, modal never opens. Own order: modal opens, status select disabled for customers |
| Observed | **Foreign:** toast *"You can only view your own orders."*, modal stayed hidden (`.hidden` class present, `innerHTML` length 0). **Own:** modal opened with full detail (3.3 KB render), status `<select>` present and `disabled`, order id rendered; closed cleanly on `closeOrderDetail` |
| Evidence | Per-step DOM/state readback after each call (modal class, innerHTML length, select state, toast text) |
| Verdict | ✅ Pass — fail-closed for foreign orders, functional for owned ones |

**Re-verified 2026-10-02 (live, current build):** foreign order refused
with the warning toast, modal stayed hidden (innerHTML length 0); own
order opened with the status select `disabled`; cleanup verified (orders
back to 0, seed data intact).

**Operational caveat found during this re-run:** a browser profile that
had cached the **pre-fingerprint `index.html`** silently kept running the
old, unguarded modules — there `deleteItem` and `deleteOrder` executed
from a customer session with **no** admin check at all (observed directly
before the cache-busted reload). The fixed app was fine; the stale cache
was the risk. This is the concrete failure mode that content-hash
fingerprinting plus `no-cache` HTML (this release) closes: stragglers
holding HTML cached before 2026-09-27 run the old build until it expires,
so a hard refresh (Ctrl+F5) is the fix for any user reporting "admin
actions work".

> **Note from this test (why it matters):** an earlier probe crashed here
> because it imported `order-admin.js` **bare** (no `?v=` fingerprint) —
> ESM keyed that as a second module instance whose `els` was empty. The app
> itself was never wrong: `main.js` and `ui.js` share the fingerprinted
> specifier. That failure mode is now pinned by invariant tests
> (`tests/module-identity.test.js`): every app-module import must carry its
> fingerprint, except the sanctioned `state.js` singleton — the exact
> contract the cache policy (`tests/cache-policy.test.js`) protects from the
> serving side.

---

## 3. Input validation & malicious data

### ST-16 — Control characters and oversize input

| Field | Content |
| --- | --- |
| Test ID | ST-16 |
| Target | Item name field (admin form → `validateName`/`sanitizeText` → state → localStorage) |
| Payload / steps | Submitted through the real form: `'bad\u0000\u0007name' + 'x'.repeat(10000)`, then `'y'.repeat(10000)`; original value snapshotted first |
| Expected | Saved cleanly but sanitized: control characters stripped, value hard-capped at the field max (80) |
| Observed | Stored name = `badname` + x… at exactly **80 chars**, control-character regex over the stored value returned false. The 10,000-char input also capped at 80. State restored byte-exact afterward (persisted copy verified). |
| Evidence | `state.items` + `localStorage` readback with lengths and control-char scan |
| Verdict | ✅ Pass — no storage blow-ups, no rendering glitches |

---

## 4. Deployed-infrastructure verification

Verified against the production host during this evidence cycle:

- **Content-hash fingerprinting live:** the page references
  `/js/main.js?v=…`, `/styles.css?v=…`, `/assets/vendor/lucide.min.js?v=…`
  with hashes matching the local build (`npm run fingerprint` / `--check`
  gate green in CI on every push).
- **Cache policy:** fingerprinted `.js`/`.css` served
  `public, max-age=31536000, immutable`; HTML served no-cache so the graph
  re-resolves from the top on every visit.
  **Exception (this release):** `js/modules/state.js` is deliberately
  unfingerprinted (ESM singleton identity) and is now served
  `no-cache, must-revalidate` via a `.htaccess` `FilesMatch` — pinned by
  `tests/cache-policy.test.js`.
- **Security headers:** `Content-Security-Policy` (script-src 'self', no
  `unsafe-inline`), `X-Frame-Options: SAMEORIGIN`,
  `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`
  (camera/mic/geolocation/payment/usb denied), `Cross-Origin-Opener-Policy`,
  `Cross-Origin-Resource-Policy`. A `<meta>` CSP in `index.html` protects
  the page even where a host strips headers.
- **HTTPS enforcement:** HTTP → 301 → HTTPS.
- **No supply-chain code:** no third-party code can execute — both
  vendored libraries (`assets/vendor/lucide.min.js`,
  `assets/vendor/supabase.min.js`) are served from the origin and
  `script-src 'self'` blocks every CDN. `connect-src` additionally
  permits `https://*.supabase.co` / `wss://*.supabase.co` for the
  optional Supabase backend (scaffold: `supabase/schema.sql` +
  `js/modules/db.js`); while the `supabase-url`/`supabase-anon-key`
  metas are empty the client never initialises and no off-origin
  request is made — with the shipped defaults live traffic still never
  leaves the origin. No analytics, no third-party scripts.

---

## 5. Automated regression layer

All of the above has a CI backstop — **101 dependency-free unit tests** run
on every push before the deploy job (`node --test` auto-discovers
`tests/*.test.js`):

- `tests/security.test.js` — validators, image-path guard, lockout math
- `tests/import-session.test.js` — import sanitizers (fail-closed, totals
  recomputed), session-expiry math
- `tests/lab-mode.test.js` — Practice Mode stays off without `?lab=1`, the
  escaping bypass has one implementation / two call sites, and every bundled
  payload still parses as an injection
- `tests/password.test.js` — salted hashing / verification
- `tests/fingerprint.test.js` — the fingerprint tool end-to-end
- `tests/cache-policy.test.js` — `.htaccess` ↔ fingerprint cache contract
  (immutable for hashed assets, no-cache for the `state.js` exception)
- `tests/module-identity.test.js` — no bare app-module imports (the
  double-instance trap behind the ST-11 harness crash), HTML script refs
  fingerprinted
- `tests/tag-balance.test.js` — every shipped HTML fragment (both static
  pages and every template literal in `js/`, nested ones included) balances
  its tags: the guard that would have caught the missing `</section>` in
  `renderHero()` pre-deploy, plus a self-test so the checker stays non-vacuous
- `tests/contrast.test.js` — the WCAG contrast fixes pinned as unit tests:
  light/dark theme token pairs parsed straight out of `styles.css` must clear
  4.5:1 (text) / 3:1 (focus), the dark cart-badge override rule must stay in
  place, and the dual focus ring keeps both layers — any palette change that
  drops a pair below its bar fails CI (mutation-proven: the pre-fix
  `--muted` and the missing badge override both turn the suite red)
- plus analytics/stats and helper suites

The `fingerprint --check` step fails the build if any asset URL lacks its
current `?v=<hash>`.

---

## 6. Practice Mode — verified locally, not deployed

Practice Mode (`?lab=1`) deliberately disables four defenses so the risk
classes can be demonstrated. It was executed against a **local dev server**
(`node tools/dev-server.mjs`) and is **not part of the live deployment
evidence above** — the flag stays off for every visitor of
`ias2.infinityfree.me`, and ST-01…ST-04 were re-confirmed on the live host
after the code was added.

| Test | Target | Verdict |
| --- | --- | --- |
| ST-24 | Stored XSS in Practice Mode | ⚠️ Defense off (payload becomes a live element) |
| ST-25 | Practice Mode absent from the normal build | ✅ Pass |
| ST-26 | DOM XSS through the toast, Practice Mode | ⚠️ Defense off |
| ST-27 | Reflected XSS through search, Practice Mode | ⚠️ Defense off |
| ST-28 | SQL injection (tautology / UNION / stacked / blind) | ⚠️ Defense off |

Observed, with the app served locally:

- **ST-24** — with `?lab=1` and the product name set to
  `<img src=x onerror="alert('XSS-STORED')">`, the card's `<h3>.innerHTML` was
  the raw payload and `document.querySelector('.product-card h3 img')` was not
  `null`. Console logged
  `Refused to execute inline event handler … "script-src 'self'"` — the element
  is injected, **the `alert()` does not fire**, because the CSP was left
  intact. Visible-impact payloads (`<b>…`, `<img src=x>`) need no script
  execution.
- **ST-25** — on the plain URL the same stored payload rendered as literal
  text, `#labBanner` was `null`, `app.lab.isEnabled()`/`isRequested()` were
  `false`, and `app.lab.openConsole()` refused with a toast.
- **ST-26** — `app.showToast('<b>INJECTED-TOAST</b>')` produced a live `<b>`
  inside the toast; with the flag off the same call rendered `&lt;b&gt;`.
- **ST-27** — searching `<b>INJECTED-SEARCH</b><img src=x onerror=…>` produced a
  live `<b>` in `.empty-state p`; flipping the banner toggle off re-escaped it
  on the next render.
- **ST-28** — `' OR '1'='1` produced
  `SELECT id, name, category, price, stock, active FROM items WHERE name = '' OR '1'='1';`
  and `items · 12 rows (leaked)`. As admin,
  `' UNION SELECT id, name, email, role, password FROM users --` appended
  `users · 2 rows (appended by UNION)` including the salted SHA-256 hash;
  as a customer the same payload was refused ("this session is not an admin").
  `'; DROP TABLE items; --` reported `DROP (simulated)` and left all 12 items
  intact. **Run parameterised instead** on the same tautology produced
  `… WHERE name = ?` and `items · 0 rows`.

Evidence for this section is a local run, not a production run; treat it as a
reproduction guide rather than a penetration test.

---

## Status

All executed checks **pass** (section 6's Practice Mode entries are the
deliberate exceptions — they record that a defense was turned *off* on
purpose, locally). Remaining checklist items (ST-05 lockout flow,
ST-08 timing oracle, ST-12–ST-15 validation/import matrix, ST-17–ST-19
session, ST-21–ST-23 framing/transport/supply-chain) are documented in
[SECURITY-TESTING.md](SECURITY-TESTING.md) for periodic re-runs; ST-20's
header list is summarized in section 4 above.
