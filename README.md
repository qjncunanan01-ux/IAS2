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
- **Product Browsing**: Search, filter by category, sort (featured, price, stock)
- **Shopping Cart**: Add/remove items, quantity controls, persistent across sessions
- **Wishlist**: Save items for later with heart icons
- **Quick View**: Modal product preview without leaving the shop
- **Checkout**: Multi-step with address, payment method (Card/GCash/COD), reference
- **Order History**: View past orders with status tracking
- **Dark Mode**: Toggle with persistence, respects system preference

### Admin Features
- **Dashboard**: Metrics (users, items, orders, sales)
- **Item Management**: Full CRUD with image, category, price, stock, active status
- **User Management**: Create/edit/delete users, role assignment (user/admin)
- **Order Management**: View all orders, update status, create manual orders
- **Category Management**: View categories with item counts and stock totals
- **Low Stock Alerts**: Visual warnings for items with ≤5 stock
- **Data Tools**: Export/import full database as JSON, clear all data

### UX & Accessibility
- **Keyboard Shortcuts**: Press `Ctrl+/` for help
  - `G G` - Go to shop
  - `O` - Orders
  - `A` - Admin (admin only)
  - `C` - Cart
  - `L/R` - Login/Register
  - `T` - Toggle theme
  - `D` - Data tools (admin)
  - `Esc` - Close modals
  - `Ctrl+K` - Focus search
- **Focus Management**: Modals trap focus, restore on close
- **ARIA Labels**: Semantic HTML with proper roles and labels
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
│   │   ├── auth.js           # Authentication (async, hashed passwords)
│   │   ├── cart.js           # Cart operations
│   │   ├── checkout.js       # Checkout flow
│   │   ├── theme.js          # Dark/light mode + system preference
│   │   ├── ui.js             # Rendering, navigation, delegated actions
│   │   ├── item-admin.js
│   │   ├── user-admin.js
│   │   ├── order-admin.js
│   │   ├── category-tools.js # Category create/rename/delete
│   │   ├── wishlist.js       # Wishlist logic (view rendered in ui.js)
│   │   ├── quick-view.js
│   │   ├── data-tools.js     # Export/import/clear with validation
│   │   ├── keyboard.js       # Shortcuts + help overlay
│   │   └── modals.js
│   ├── components/       # Reusable UI components
│   │   ├── toast.js
│   │   └── render-helpers.js   # Product cards, order cards, stock chips
│   └── utils/            # Utilities
│       ├── storage.js    # localStorage abstraction (quota/corruption safe)
│       ├── password.js   # SHA-256 password hashing
│       └── helpers.js    # Formatting, escaping, debounce, etc.
└── assets/               # SVG product images
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

## Browser Support

Modern browsers with ES module support (Chrome 61+, Firefox 60+, Safari 11+, Edge 79+).

## Security Note

This is a **frontend demo only**. All state lives in localStorage and every restriction (roles, admin access) is client-side only. Passwords are stored as salted SHA-256 hashes (Web Crypto), which is still demo-grade — anyone with dev tools can read or rewrite localStorage. Do not use for production without:
- Server-side authentication (bcrypt/argon2)
- HTTPS-only cookies or JWT
- Payment gateway integration (Stripe, PayMongo, etc.)
- CSRF/XSS protection
- Input validation/sanitization on backend