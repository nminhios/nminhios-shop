# Security checklist for nminhios shop

## Before any real customers

- [ ] Keep `.env`, database files, backups and server logs private. `.gitignore` covers common local files, but verify repository history before pushing.
- [ ] Use HTTPS; set `NODE_ENV=production` and `PUBLIC_ORIGIN` to the exact HTTPS origin.
- [ ] Generate unique random `SESSION_SECRET`, `BANK_WEBHOOK_SECRET`, and 32-byte `DIGITAL_DELIVERY_KEY` values. Never put any of them in `public/`.
- [ ] Change the bootstrap admin password to a unique 16+ character password before allowing public traffic.
- [ ] Confirm the admin email actually exists and test that an ordinary customer receives HTTP 403 from every `/api/admin/*` endpoint.
- [ ] Adapt webhook signature checks to the official provider specification. Verify timestamp freshness if the provider supports it, reject stale/replayed transactions, and test duplicate events, wrong amount/currency, wrong order reference, and invalid signature.
- [ ] Test order expiry, concurrent stock purchases, cancellation, payment replay, inventory assignment, encryption key backup/restore, and order ownership.
- [ ] Add real account recovery and email verification before relying on customer accounts.
- [ ] Configure server/edge rate limiting, monitoring, database backups, log retention and incident response. Avoid logging passwords, raw payment credentials, webhook secrets or decrypted inventory.
- [ ] Obtain legal authorization to sell every key/account/digital product, and never store buyer passwords for unrelated third-party services.

## Design facts

Public web assets cannot be made secret: browsers must download HTML, CSS, JavaScript, images and any public configuration. Minification/obfuscation only adds friction and is not a security boundary. Protect confidential logic and credentials with server-side authorization and secret management.
