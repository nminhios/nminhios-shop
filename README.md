# nminhios shop — GitHub Pages preview

This is the static, demo-only frontend for previewing the nminhios shop look and testing basic local cart/order interactions.

## Publish with GitHub Pages

1. Create a repository (for example `nminhios-shop-preview`).
2. Upload the *contents* of this folder into the repository root: `index.html`, `styles.css`, `storefront.css`, `app.js`, and `config.js`.
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/(root)`, then save.
5. Open the GitHub Pages URL shown on that page.

## Important

- This is preview mode only. Demo orders and profiles use the browser's local storage and are not shared across devices.
- Payment information is fake in demo mode; do not send money to the sample account shown by this page.
- The frontend must be publicly delivered to browsers and its HTML/CSS/JavaScript can be inspected. Do not place private keys, bank secrets, passwords or the full backend source in a public preview repository.
- GitHub Pages cannot run Node.js routes, SQLite, server-side login or signed bank webhooks. Those require a separate Node.js host. To use the full-stack project, follow the README in the full-stack ZIP and set `DEMO_MODE: false` only when you are ready to use the backend.


## Add/edit products in preview mode

Open **Quản trị demo → Sản phẩm → Thêm sản phẩm**. You can set the current sale price, an optional higher original price, stock, category, short and long descriptions, a cover image URL and up to five gallery image URLs (one HTTPS URL per line). Changes are stored only in the current browser's localStorage, not shared with visitors on other devices. Host images first and paste direct HTTPS links; this preview does not upload image files. The provided nminhios avatar image URL is used for the brand avatar.


To change the shop avatar later, edit the public `BRAND_AVATAR_URL` field in `config.js`. It should be a public HTTPS image URL.
