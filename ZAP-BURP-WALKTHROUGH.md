# ZAP & Burp Walkthrough — IAS2 Commerce (deployed target)

Run industry scanners against the **live site**, produce report artifacts, and
know exactly what those scanners can and cannot prove for a static,
localStorage-only app. The app-layer evidence lives in
[SECURITY-TESTING.md](SECURITY-TESTING.md) (28-point checklist) and
[SECURITY-EVIDENCE.md](SECURITY-EVIDENCE.md); this walkthrough is the
**infrastructure layer** (ST-20…ST-23) of the same report.

| | |
| --- | --- |
| **Target** | `https://ias2.infinityfree.me` |
| **Evidence captured** | 2026-10-06 (Appendix A) |
| **Tools** | OWASP ZAP (free, full scan suite) · Burp Suite Community (free, manual toolkit) |
| **Budget** | ~15 min ZAP + ~10 min Burp |

---

## 0. Read this first — what a scanner can prove here

The app is a static site: no server code, no API, no database. All state is
in the browser's localStorage. That determines everything:

| Scanner capability | Result against this target |
| --- | --- |
| Passive checks (headers, CSP, cookies) | ✅ **real value — this is the deliverable** |
| Crawl / spider | ✅ discovers the page and assets (after the JS challenge) |
| Active scan (SQLi, command injection, path traversal) | ⚠️ empty — and **correctly** empty: nothing server-side to attack |
| XSS reflection tests | no server reflection; injected payloads never echo back |
| Auth / session / IDOR attacks | sessions are client-side; there is no server session to break |

**An empty active scan is the correct result, not a failed scan.** Do not pad
the report with unverifiable claims — attach §4 (what scanners cannot find
and what to submit instead) to explain it.

**Do not run active scans against InfinityFree.** Free shared hosting
throttles and can suspend accounts for heavy automated traffic. Baseline /
passive rules plus a few dozen manual requests only — and only against your
own site.

---

## 1. Access quirks — the InfinityFree JS challenge

The first hit without the `__test` cookie returns an **~857-byte challenge
page** that loads `/aes.js`, runs `slowAES.decrypt(...)`, writes
`__test` (max-age 21600) and reloads — the `i` query counter increments
(`?i=1` → `?i=2`). Only then do you get the real document.

Repro from any non-JS client (verified 2026-10-06):

```bash
curl -s https://ias2.infinityfree.me/index.html | head -3
# <html><body><script type="text/javascript" src="/aes.js" ></script>…
```

Replaying the `__test` value read out of the browser did **not** pass from
curl/node in our test either — don't try to script around it. **Use
browser-backed components** so the JS runs:

- **ZAP:** the traditional spider only sees the challenge page + `/aes.js`.
  Use the **Client Spider** (a real browser; ZAP's own July-2026 guidance
  recommends it for JS-heavy apps) or the AJAX spider so the cookie gets set.
  After that, passive scanning works on everything captured.
- **Burp Community:** there is no crawler in Community anyway — browse with
  **Burp's embedded browser** (already wired to the proxy) or your own
  browser + FoxyProxy. The challenge solves itself on first load.

**Cache trap.** `.js`/`.css` are served `immutable` for a year, so browsers
answer from cache (`transferSize: 0`) and you can silently scan yesterday's
build. Before any scan or screenshot: DevTools → Network → **Disable cache**,
or bust the document: `https://ias2.infinityfree.me/index.html?cb=<timestamp>`.

---

## 2. ZAP walkthrough (~15 minutes)

1. **Session → New Session**, put `https://ias2.infinityfree.me` in scope
   (Quick Start, or Global Options → Sessions → Sites in scope).
2. **Passive first pass:** Automated Scan, mode **Baseline** (spider +
   passive rules, no attack traffic), with the **Client Spider** so the AES
   challenge executes. A couple of minutes on `/` is enough.
3. Read the **Alerts** tab — expected results are tabulated below.
4. **Browse like a user** with the ZAP-proxied browser so JS-driven views get
   captured: shop grid → quick view → cart drawer → checkout → search with a
   no-match query → login modal (customer `user@ias2.test` / `user123`) →
   admin (`admin@ias2.test` / `admin123`).
5. **Export:** Report menu → Generate/Export Report (HTML or Markdown) →
   save as `zap-baseline-report.<ext>`. This file is a course deliverable.
6. **Skip the active scan on this host** (§0). If the professor wants to see
   one, run it against the *local* build — and expect the fake
   "security headers missing" findings listed in §6.

### Expected ZAP alerts (deployed, verified 2026-10-06)

| Alert | Severity | Verdict |
| --- | --- | --- |
| Missing `Strict-Transport-Security` | Medium/High | **The one real finding.** TLS is terminated by the host and HSTS is not set. Candidate fix: `Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"` in `.htaccess` — **untested on this host**, verify after deploying. |
| `server: openresty` banner | Low/Info | True, but hosting-controlled — record as accepted limitation. |
| Missing `robots.txt` / `sitemap.xml` / `security.txt` | Info | True (all return 404). Add them for quieter reports if you want. |
| Missing `X-XSS-Protection` (older rule sets) | Info | Ignore — the header is deprecated; browsers removed the XSS auditor. |
| CSP present & strict | Info (pass) | ✅ `script-src 'self'`, `frame-ancestors 'self'`, no `unsafe-inline` (Appendix A). |
| Clickjacking (XFO + `frame-ancestors`) | Info (pass) | ✅ `X-Frame-Options: SAMEORIGIN`. |
| Mixed content / insecure cookies | Info (pass) | ✅ all-HTTPS; the only cookie is the host's `__test`. |
| Anything SQLi / auth-bypass / IDOR-flavored | — | **Not reproducible — do not report.** See §4. |

---

## 3. Burp Community walkthrough (~10 minutes)

Burp Community is a **manual toolkit**: the automated Scanner (Dashboard →
New scan) is Professional/DAST-only, but passive checks run on traffic you
proxy, and Proxy / Repeater / Decoder are fully yours. Division of labor:
**ZAP produces the automated report; Burp produces request-level evidence
screenshots.**

1. Proxy → Options: default `127.0.0.1:8080`. Open **Burp's embedded
   browser** (no CA install needed), or Firefox + FoxyProxy +
   import `PortSwiggerCA`.
2. Target → Scope: add `https://ias2.infinityfree.me`. Keep `/aes.js` in
   scope — the challenge exchange *is* evidence.
3. Visit the site, let the challenge solve, then click through everything:
   shop → quick view → cart → checkout → search → customer login → admin
   login.
4. **Proxy → HTTP history:** open the first HTML request and screenshot the
   response headers — this is your ST-20/ST-22 evidence (expected values in
   Appendix A). Keep the challenge request/response too; it documents the
   hosting behavior the report will mention.
5. **Repeater experiments worth keeping:**
   - replay a challenge-page request → shows exactly what `curl` sees
     (proof that non-JS clients are stopped before the app);
   - `GET /does-not-exist` → **real 404** (custom `404.html`, 803 bytes) —
     *not* a soft-404, so scanners won't misreport dead pages as `200`;
   - `GET http://ias2.infinityfree.me/` → `301` → HTTPS (ST-22);
   - `OPTIONS`/`HEAD /` if verb tampering is requested — a static host has
     nothing app-level to leak either way.
6. Passive issues on proxied traffic should match ZAP's. If the two tools
   disagree, trust the raw headers in Appendix A.

Optional: Decoder on the `__test` cookie hex (it is slowAES output) — fun
screenshot for the challenge section, not a vulnerability.

---

## 4. What the scanners will NOT find — and what to submit instead

This is the intellectually honest core of the report; state it explicitly.

| Claim | Why a scanner cannot prove it | Evidence to submit instead |
| --- | --- | --- |
| No SQL injection | There is no SQL and no endpoint — "queries" are in-browser filters over localStorage | ST-12…ST-16 (validators, fail-closed import) + ST-28 Practice Mode console (concat vs parameterised) |
| Stored/DOM XSS blocked | Payloads never round-trip a server; a scanner's injection only lands in *its own* browser storage | ST-01 (admin item name), ST-03 (toast), ST-04 (CSP blocks execution) |
| Lockout / enumeration / timing | No server to time or rate-limit against | ST-05…ST-09 + `npm test` (101 unit tests) |
| Privilege escalation & IDOR | Authorization exists only as UI state in the same browser | ST-10, ST-11 |
| Session security | Session expiry is client-side math | ST-17…ST-19 |

**Practice Mode payloads are manual evidence, not scanner findings.** The
deliberate sinks (`labUnsafeText`, the SQL console) fire *after* page load on
your own machine — there is no request a scanner can craft that triggers
them. Demonstrate them by hand per ST-24…ST-28; the DOM assertions in
DevTools Console are the evidence. Keep the CSP caveat: even with escaping
off, `alert()` is refused (`script-src 'self'`) — escaping makes the payload
inert HTML, CSP is the second lock.

**Two deployment caveats to check before you scan or screenshot:**

- **Practice Mode is not deployed yet** (verified 2026-10-06: no
  `#labConsole` element, `window.app.lab === undefined`). It lives in the
  uncommitted working tree — commit + push first, or state in the report that
  `?lab=1` evidence comes from a local run (SECURITY-EVIDENCE §6 already
  labels it that way).
- **The deployed build still has the broken hero** (product grid rendered
  inside `#hero-banner`, 1-column grid, ~6,900 px page) and
  `last-modified: Fri, 02 Oct 2026`. Screenshots taken today show the old
  layout — note the build date in the report or redeploy first.

---

## 5. After the Supabase migration — what becomes scannable

Scaffold status (updated 2026-10-06): the CSP amendment and vendoring
are **already in the working tree** — `connect-src 'self'
https://*.supabase.co wss://*.supabase.co` in `index.html` **and**
`.htaccess`, client vendored at `assets/vendor/supabase.min.js`
(`script-src 'self'` never moved), and ST-20/ST-23 plus
SECURITY-EVIDENCE §4 amended to match. What still has to happen before
any of the bullets below is real:

- **Fill in the config:** set the `supabase-url` / `supabase-anon-key`
  metas in `index.html` (or the `ias2.commerce.supabase` localStorage
  override) and run `supabase/schema.sql` (items/users/orders + RLS).
  Until then `app.db.status()` reports `{ configured: false,
  connected: false }`, zero off-origin requests are made, and the
  Appendix A header capture above is still what a scan sees.
- **API traffic becomes visible:** `https://<ref>.supabase.co/rest/v1/...`
  appears in ZAP/Burp history — passive checks then cover CORS, verbose
  error bodies, and auth handling on real responses.
- **RLS tampering becomes testable in Burp:** capture a customer's token,
  replay `GET /rest/v1/orders?user_id=eq.<someone-else>` with edited claims →
  that is the IDOR/RLS evidence that *cannot* exist today.
- **Active scanning finally means something** on PostgREST query parameters
  and any Edge Functions. PostgREST is parameterised by construction, so a
  real SQLi demo still needs the deliberately vulnerable path
  (`EXECUTE format(...)`) — on a **separate dev project**, never the one RLS
  protects.
- The anon key in JS is public by design — the finding to hunt is **data
  exposure (RLS off)**, not key leakage.

---

## 6. False-positive traps (this project specifically)

| Trap | Symptom | Correct approach |
| --- | --- | --- |
| Local dev server (`node tools/dev-server.mjs`) | "CSP / security headers missing" — it sends only `Content-Type` | Scan the **deployed** site for header truth |
| Browser/app cache | Old HTML without current features (`transferSize: 0`) | Disable cache, or `?cb=<timestamp>` |
| AES challenge page | Scanner reports a 857-byte page with one script as "the site" | Browser-backed spider (Client Spider / embedded browser) |
| `http://` scan | Fake "insecure connection / cookie" findings | Scan `https://` only (ST-22 already proves the 301) |
| Expecting Practice Mode on live | No red banner, `?lab=1` does nothing | Not deployed yet — §4 |
| Active scan noise | SQLi/auth alerts with no reproducible request | §4 — static app, do not report |

---

## 7. Deliverables checklist

- [ ] ZAP baseline report file (HTML or Markdown) from the deployed URL
- [ ] Raw response-header dump pasted into the evidence (Appendix A)
- [ ] Screenshots: challenge page · ZAP Alerts tab · Burp HTTP-history
      headers · ST-28 Practice Mode console
- [ ] One-paragraph note attached to the report: "active scan is empty
      because the target is a static client-only app" (§0/§4)
- [ ] Version note: `last-modified` of the scanned build + the two deployment
      caveats from §4

---

## Appendix A — verified response headers (2026-10-06, status 200)

Captured in-browser after the challenge solved (`GET /index.html`,
`last-modified: Fri, 02 Oct 2026 12:55:10 GMT`):

```http
content-security-policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'
x-content-type-options: nosniff
x-frame-options: SAMEORIGIN
referrer-policy: strict-origin-when-cross-origin
permissions-policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
cross-origin-opener-policy: same-origin
cross-origin-resource-policy: same-origin
cache-control: no-cache, must-revalidate
content-type: text/html; charset=UTF-8
server: openresty
strict-transport-security: <absent — the one real finding>
```

> Pre-migration capture: the working tree has since amended
> `connect-src` with `https://*.supabase.co wss://*.supabase.co`
> (Supabase scaffold, §5) in both `index.html` and `.htaccess` —
> re-capture this dump after the next deploy. Everything else in the
> set is unchanged.

Source of truth for the CSP and cache lines is `.htaccess`; a `<meta>` CSP in
`index.html` protects the page even if the host strips headers.

## Appendix B — repro snippets

```bash
# What a non-JS client sees (the challenge):
curl -s https://ias2.infinityfree.me/index.html | head -3

# Cache-busted document URL for scanning/screenshots:
echo "https://ias2.infinityfree.me/index.html?cb=$(date +%s)"
```

```js
// In the deployed page's Console (same-origin, cookies already set):
fetch('/index.html', {cache: 'no-store'}).then(r => {
  r.headers.forEach((v, k) => console.log(k + ': ' + v));
});
```
