# nminhios shop — Admin/Seller demo (static preview)

## Start here
Open `index.html` directly to inspect the UI, or upload **all files in this folder** to the root of a GitHub repository and enable GitHub Pages (`Settings → Pages → Deploy from a branch → main → /(root)`).

This static package includes every linked frontend file (`styles.css`, `storefront.css`, `admin-enhancements.css`, `config.js`, `app.js`). It is intentionally demo-only and does not contain backend code or private secrets.

## Try Admin + Seller
1. Open **Quản trị cửa hàng** from the left menu. On a phone, tap the top-left menu button first.
2. Select **Khách hàng & Seller**.
3. Tap **Tài khoản** → **Tạo tài khoản**, fill a test name/email/password, and submit.
4. Return to Admin → **Khách hàng & Seller**, select `Seller`, set a private discount from 0–90%, and press **Lưu thay đổi**.
5. The **Kênh Seller** section becomes available while that test account is signed in. Add a product, set price/original price/stock/category, add a cover image URL and up to five HTTPS gallery-image URLs, write description/details, and save it.
6. Visit the store to see the product. In the Seller section you can edit or hide your own listing.

Demo users, product changes, and orders are stored in this browser's localStorage only. They are not shared across devices and are not real accounts/orders/payments. Do not use a static demo as a real admin panel.

## Visuals and assets
- Uses your requested avatar URL: `https://cdn.upanhlaylink.com/i/TLOGJDhT.png`.
- Product cover and gallery images are entered as HTTPS URLs. Static hosting does not include an image upload server.

## For a real shop
Use the separate full-stack package. Run Node.js on a server and keep `.env`, secrets, and the SQLite database outside the public directory. GitHub Pages cannot execute Node.js routes or protect admin actions.
