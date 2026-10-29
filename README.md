# nminhios shop — server-backed storefront

A responsive Vietnamese digital-goods storefront with a private Node.js backend. The browser files live in `public/`; authentication, product price validation, stock reservation, order status, inventory encryption and payment-webhook verification run on the server.

## Important security boundary

A website must send HTML, CSS and JavaScript to visitors' browsers, so those public files can always be viewed/copied. Splitting files or minifying JavaScript does **not** make frontend source secret. Keep private business logic in `server.js` (or another server-only module), keep `.env` and the SQLite database out of public hosting/repositories, and never put API secrets in `public/config.js`. Do not deploy this project as a static-only GitHub Pages site: server functions will not run there.

This is a full starter implementation that can run locally, but it is **not yet a production bank integration**. Bank transfer details are display-only environment values. The webhook endpoint is a generic HMAC-SHA256 adapter; its signature and payload mapping must be adjusted to the actual bank/payment provider's official spec before receiving real payments.

## Requirements

- Node.js **22.13 or newer** (uses the built-in `node:sqlite`; no npm packages required).
- A server/host that can run persistent Node.js and write to a persistent disk. For a public deployment, use HTTPS through a trusted reverse proxy/hosting platform.

Check your Node version:

```sh
node -v
```

## First-time setup

1. Copy `.env.example` to `.env`.
2. Generate secrets in a terminal and put their values in `.env`:

   ```sh
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Use the first output for `SESSION_SECRET`; use the second output for `DIGITAL_DELIVERY_KEY`. The session secret also protects the server-side session-token lookup hash; changing it invalidates existing sessions. The digital-delivery key is exactly 64 hex characters. Back it up securely: if lost, encrypted inventory entries cannot be decrypted.

3. Before the first start, set `ADMIN_EMAIL` and a unique strong `ADMIN_PASSWORD` (at least 14 characters; 16+ recommended). Admin bootstrap only creates the account if the email does not already exist. Changing the environment variables later will **not** replace an existing account's password.
4. For local testing, use `NODE_ENV=development`, `PUBLIC_ORIGIN=http://127.0.0.1:3000`, and `HOST=127.0.0.1`.
5. Start the server:

   ```sh
   npm start
   ```

   Or use `node server.js`. Open exactly `http://127.0.0.1:3000` in the browser. If using `localhost` instead of `127.0.0.1`, update `PUBLIC_ORIGIN` to match the browser origin. Stop/start the server after editing `.env`.

No `npm install` is required. Run the built-in syntax check with:

```sh
npm run check
```

## Production deployment

- Set `NODE_ENV=production` and `PUBLIC_ORIGIN=https://your-real-domain.example`.
- Keep the frontend and bundled backend same-origin by default. If you intentionally set a separate compatible API URL in the UI, its exact origin must be added to `CSP_CONNECT_ORIGINS`, and that API must allow credentialed CORS from the storefront origin; keep both on the same site for `SameSite=Lax` session cookies.
- Run the Node process behind a trusted HTTPS reverse proxy or a Node host that supplies TLS. This server does not itself implement HTTPS.
- Set a strong unique `SESSION_SECRET`, `ADMIN_PASSWORD`, `DIGITAL_DELIVERY_KEY`, and `BANK_WEBHOOK_SECRET` as **server environment secrets**, not in source or frontend settings.
- Use a persistent disk for the database. The server refuses to place the SQLite database under `public/`. Back up database and secrets separately. Do not upload `.env` or `shop.sqlite` to a public repository.
- Set a real database location using `DATABASE_FILE` when your hosting platform expects persistent data under a particular path.
- For higher traffic or multiple application instances, migrate SQLite to a managed database such as PostgreSQL and use a shared rate limiter/session store. The included in-memory rate limiter is a baseline, not a substitute for a production edge/WAF rate limit. Keep `TRUST_PROXY=false` unless a trusted reverse proxy is configured to overwrite `X-Forwarded-For`; otherwise clients could spoof their IP for rate limiting.

## What works now

- Product catalog with categories, search, sorting, price and available-stock display.
- Shopping cart, checkout, server-validated price and stock, server-side `NMINH10` discount, order creation and 30-minute pending-order stock reservation.
- Registration/login backed by SQLite. Passwords are stored as salted scrypt hashes; browser JS does not save passwords. Session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- Customer sees only their own orders; order and delivery endpoints check ownership.
- Admin-only product create/edit/archive, order list, pending-order cancellation, explicit manual fulfillment confirmation and inventory import.
- Optional encrypted digital-inventory storage (AES-256-GCM) and auto delivery after verified payment, for digital goods you are authorized to distribute.
- HMAC-SHA256 bank webhook verification, exact amount/currency/reference checks, unique event/transaction IDs and duplicate-event protection.
- Basic security headers, origin check on browser mutations, request-body limit, login/register rate limiting and audit events.

## Payment / auto-bank integration

The variables `BANK_PROVIDER_NAME`, `BANK_ACCOUNT_NAME`, and `BANK_ACCOUNT_NUMBER` only display transfer instructions. Setting them does not connect to a bank or prove payment. `POST /api/webhooks/bank` currently expects a JSON body with `eventId`, `transactionId`, `reference` (the order code), `amount` (integer VND), and `currency` (`VND` by default), signed as hex HMAC-SHA256 of the **raw request body** in `x-nminhios-signature` (optional `sha256=` prefix). Adapt verification and field mapping to the provider's authenticated webhook spec and perform their test-mode verification before using real money. Never mark an order paid from a browser redirect or user-provided field.

**Important expiration behavior:** a pending order reserves stock for 30 minutes, after which it may be cancelled and its stock released. A real bank transfer arriving after the order has expired/cancelled will not automatically reopen or fulfill that order. Before accepting real payments, either align the provider's transfer expiry with this window or implement a provider-specific late-payment reconciliation/review queue. Tell customers to contact support if they transferred after expiration; reconcile the bank statement before manually changing order status or delivering goods.

## Digital inventory

Create/edit a product and set **Delivery mode = Auto**, then import one authorized inventory item per line under **Quản trị cửa hàng → Kho số**. Each item is encrypted on the server. An all-auto order is delivered once inventory is available and the signed webhook confirms exact payment. Mixed/manual orders may require a manual admin handover. Do not import stolen accounts, third-party credentials, or data you are not authorized to sell. Do not share secrets through checkout notes.

## Main files

- `public/index.html`: page structure, no secrets.
- `public/styles.css`: responsive visual design.
- `public/app.js`: public UI behavior and same-origin API calls. It is visible to visitors by design.
- `public/config.js`: public settings only; no secrets.
- `server.js`: server-only route and business logic.
- `.env.example`: environment variable template; copy to `.env`, never commit `.env`.
- `api-contract.json`: API endpoint reference.
- `SECURITY.md`: additional security checklist.

## Current limitations to resolve before real launch

- Payment provider signature/payload must be adapted to your chosen bank/payment provider and tested end to end.
- No email/OTP verification, password-reset workflow, shipping provider, tax invoice, or customer support ticket backend is included yet.
- Admin roles are bootstrapped from environment on first startup; existing accounts are not overwritten. Secure the first admin login and deploy behind HTTPS.
- SQLite and in-memory rate limits are suitable for a small single-instance starter, not a high-scale multi-instance store.
- Product names/prices/stock are initial sample catalog data; edit them in the admin UI before selling.
