# IAS2 Commerce

A modular, feature-rich static e-commerce demo with customer and admin flows. Built with vanilla JavaScript (ES modules), CSS custom properties, and localStorage for persistence.

## Quick Start

Serve the folder over HTTP (ES modules don't load from `file://`):

```bash
npx http-server -p 8080
# then open http://localhost:8080
```

## Demo Accounts

- **Admin**: `admin@ias2.test` / `admin123`
- **User**: `user@ias2.test` / `user123`

## Features

### Customer Features
- **Authentication**: Login/register with email/password
- **Featured Hero Banner**: Admin-picked spotlight product shown above the shop grid
- **Product Browsing**: Search, filter by category, sort (featured, price, stock)
- **Shopping Cart**: Add/remove items, quantity controls, persistent across sessions
- **Wishlist**: Save items for later with heart icons
- **Quick View**: Modal product preview without leaving the shop
- **Checkout**: Multi-step with address, payment method (Card/GCash/COD), reference
- **Order History**: View past orders with status tracking
- **Dark Mode**: Toggle with persistence, respects system preference

### Admin Features
- **Dashboard**: Metrics (users, items, orders, sales) plus an inline **sales-by-category chart** and **best-sellers** list (appears once there is order history)
- **Restock Suggestions**: Items ranked by how fast they sell relative to remaining stock
- **Item Management**: Full CRUD with image, category, price, stock, active status
- **User Management**: Create/edit/delete users, role assignment (user/admin)
- **Order Management**: View all orders, update status, create manual orders — order details show product photos
- **Category Management**: View categories with item counts and stock totals, create empty categories
- **Low Stock Alerts**: Visual warnings for items with ≤5 stock; the alert jumps to a stock-sorted shop listing
- **Data Tools**: Export/import full database as JSON (richer import stats), clear all data

### UX & Accessibility
- **Keyboard Shortcuts**: Press `Ctrl+/` for help
  - `G G` - Go to shop
  - `O` - Orders
  - `A` - Admin (admin only)
  - `C` - Cart
  - `L/R` - Login/Register
  - `T` - Toggle theme
  - `D` - Data tools (admin)
  - `Esc` - Close modals (un-zooms the lightbox first)
  - `Ctrl+K` - Focus search
- **Skip Link**: `Tab` from page load jumps straight to the product grid
- **Focus Management**: Modals trap focus, restore on close
- **ARIA Labels**: Semantic HTML with proper roles and labels
- **Search**: Multi-word matching across name, category, and description ("desk lamp" or "lamp desk" both work), with a helpful empty state and one-click clear
- **Related Products**: Quick view suggests items from the same category
- **Responsive Design**: Mobile-first, works down to 320px
- **Toast Notifications**: Typed toasts (success, error, warning, info) with animations

## Project Structure

```
├── index.html            # Main HTML entry point
├── styles.css            # All styles (CSS custom properties)
├── js/
│   ├── main.js           # Application entry point
│   ├── modules/          # Feature modules
│   │   ├── state.js          # Shared state & defaults
│   │   ├── auth.js           # Authentication (async, hashed passwords, lockout)
│   │   ├── cart.js           # Cart operations
│   │   ├── checkout.js       # Checkout flow
│   │   ├── stats.js          # Pure analytics helpers (sales, restock, related)
│   │   ├── theme.js          # Dark/light mode + system preference
│   │   ├── ui.js             # Rendering, navigation, delegated actions
│   │   ├── item-admin.js
│   │   ├── user-admin.js
│   │   ├── order-admin.js
│   │   ├── category-tools.js # Category create/rename/delete
│   │   ├── wishlist.js       # Wishlist logic (view rendered in ui.js)
│   │   ├── quick-view.js
│   │   ├── lightbox.js       # Full-size gallery: swipe, thumbs, zoom
│   │   ├── data-tools.js     # Export/import/clear with validation
│   │   ├── keyboard.js       # Shortcuts + help overlay
│   │   └── modals.js
│   ├── components/       # Reusable UI components
│   │   ├── toast.js
│   │   └── render-helpers.js   # Product cards, order cards, stock chips
│   └── utils/            # Utilities
│       ├── storage.js    # localStorage abstraction (quota/corruption safe)
│       ├── password.js   # SHA-256 password hashing
│       ├── security.js   # Sanitizers, validators, image-path guard, lockout
│       └── helpers.js    # Formatting, escaping, debounce, etc.
├── tests/                # Unit tests (node --test, no dependencies)
└── assets/               # Product photos
```

## Architecture Notes

- **ES Modules**: All JS uses native `import`/`export` (serve via HTTP — opening `index.html` from `file://` blocks module loading)
- **Single State Object**: Centralized in `state.js`, mutated by modules
- **Event Delegation**: Single click/submit/change listeners on `document.body` with a `[data-action]` map
- **No Framework**: Pure vanilla JS
- **Persistence**: `localStorage` under the `ias2.commerce.` prefix; every write is quota-guarded and every read falls back to defaults on corruption (with a toast)
- **Passwords**: salted SHA-256 (`sha256:<salt>:<hash>`); legacy plaintext demo seeds upgrade transparently on first login
- **Exports**: versioned JSON envelope (`version`, `exportedAt`); imports are validated before anything is written

## Role Restrictions

| Capability | Customer | Admin |
| --- | --- | --- |
| Browse, search, filter, sort | ✓ | ✓ |
| Cart, checkout, wishlist | ✓ | ✓ |
| View own orders | ✓ | ✓ (all users') |
| Change order status | read-only | ✓ |
| Admin panel, data tools | — | ✓ |
| Manage items / users / orders / categories | — | ✓ |

The last admin account cannot be deleted or demoted, and the logged-in account cannot delete itself.

## Deployment (InfinityFree)

The deploy zip is **built automatically by GitHub Actions on every push** to `main`:

- Workflow: [`.github/workflows/build-deploy-zip.yml`](.github/workflows/build-deploy-zip.yml)
- Each run syntax-checks every JS module, verifies required files, and packages `index.html`, `styles.css`, `js/`, `assets/`, and `README.md` into `ias2-deploy.zip`.
- Download it from the run's **Artifacts** section, or from the **latest** release:
  `https://github.com/<owner>/IAS2/releases/latest`

To deploy: upload the zip to your InfinityFree account's `htdocs` folder via the File Manager (or FTP), extract it in place, and make sure `index.html` sits directly inside `htdocs`. The app is fully static — no PHP or database needed.

## Development

Run the dependency-free unit tests (68 tests: analytics logic, password hashing,
XSS escaping, input validation, the lockout state machine, import sanitization,
session expiry, asset fingerprinting):

```bash
npm test          # or: node --test "tests/*.test.js"
```

The same suite runs in CI on every push, before the deploy zip is built — a failing test blocks the release.

### Asset cache-busting

JS/CSS references are fingerprinted at build time (`styles.css?v=3074a736`),
so browsers can never pair a new deploy with stale cached modules. After
touching any asset, run `npm run fingerprint` (or `node tools/fingerprint.mjs
--apply`) to refresh every reference — CI also gates deploys on
`npm run fingerprint:check` passing. `js/modules/state.js` is deliberately
kept bare (ESM module identity requires it) and is served no-cache.

## Browser Support

Modern browsers with ES module support (Chrome 61+, Firefox 60+, Safari 11+, Edge 79+).

## Security Model

This is a **frontend-only demo** — all state lives in localStorage, and every
restriction is enforced client-side. A determined user with dev tools can read
or rewrite their own localStorage, and there is no real server authority.
Within that scope, the app is hardened aggressively:

**Content Security Policy (strict)** — both a `<meta>` policy and Apache
headers: `script-src 'self'`, `style-src 'self'`, `object-src 'none'`,
`base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'self'`. Zero inline
scripts, zero inline `style=""` attributes, zero third-party code — the icon
set is vendored into `assets/vendor/`. Any injected `<script>` or `onerror`
handler simply does not execute.

**Security headers** — `X-Content-Type-Options: nosniff`, `X-Frame-Options`,
`Referrer-Policy`, a restrictive `Permissions-Policy` (camera, mic, geolocation,
payment, usb all disabled), `Cross-Origin-Opener-Policy` / `Cross-Origin-Resource-Policy`,
HTTPS redirect, and denied access to source maps and docs.

**XSS defenses** — every dynamic value is HTML/attribute-escaped, including
toast messages (an unescaped one was a real stored-XSS sink — fixed). Item
image paths are validated server-grade: relative only, no URLs, no `..`
traversal, image extensions only — so admin-stored paths can never become
script vectors or load remote trackers.

**Input validation** — every persisted field (names, emails, prices, stock,
quantities, addresses, categories) passes sanitization (control-character
stripping, length caps) and range validation before storage. The password
policy (8+ chars, mixed case, digits) is enforced at credential creation.

**Brute-force resistance** — after 5 failed logins an account key locks with
escalating delays (30s → 15min, persisted across reloads); while locked even
the correct password is rejected. The login form itself shows a persistent
lockout notice with a live countdown and a disabled submit button — it
persists across modal close/reopen (with the attempted email prefilled) and
the form re-enables itself the moment the lock lifts. As the limit
approaches, an inline warning shows the attempts remaining. Error messages
are deliberately generic (`"Email or password did not match."`) so attackers
cannot enumerate which emails hold accounts, and both success/failure paths
do equivalent hashing work to blunt timing analysis.

**Session inactivity timeout** — after 15 minutes without interaction the user
is logged out automatically. A 60-second warning banner with a live countdown
and a "Stay signed in" button appears before expiry; guests never see it, the
expiry fires at most once per login, and the idle clock is seeded from the
persisted timestamp — so reloading the page does not buy a fresh 15 minutes
(the check also runs on page load, revoking stale logins immediately).

**Defense against privilege escalation** — admin operations (items, users,
orders, categories, data tools) re-check privileges at the action level, not
just in the UI: console-invoked calls from a customer session fail closed.
Customers can only open order details for their own orders.

**Fail-closed imports** — imported JSON is fully validated and sanitized
(emails, roles, image paths, prices, quantities, order statuses) before
anything is written; one malformed record rejects the entire file, and order
totals are always recomputed from the validated lines so tampered envelopes
cannot inflate revenue.

All of this logic is pure and covered by `tests/security.test.js` and
`tests/import-session.test.js` (68 tests total). For hands-on verification,
**[SECURITY-TESTING.md](SECURITY-TESTING.md)** provides a 23-point checklist
with concrete attack payloads (stored XSS, CSP bypass, brute force, lockout,
privilege escalation, malicious imports, session attacks) and expected
outcomes.

Still true regardless: **do not use for real commerce without a backend** —
server-side auth (bcrypt/argon2), server-enforced authorization, real payment
processing, and server-side validation. Client-side "security" is UX, not a
trust boundary.