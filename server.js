'use strict';

/*
 * nminhios shop API — Node.js 22.13+ (built-in SQLite, no third-party packages).
 * Run behind HTTPS in production. Secrets belong in the server environment only.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
loadDotEnv(path.join(ROOT, '.env'));
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '127.0.0.1';
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const PUBLIC_ORIGIN = (process.env.PUBLIC_ORIGIN || '').replace(/\/$/, '');
const COOKIE_NAME = 'nminhios_session';
const SESSION_HOURS = 12;
const REMEMBER_DAYS = 7;
const MAX_BODY_BYTES = 1024 * 1024;
const DATABASE_FILE = path.resolve(process.env.DATABASE_FILE || path.join(ROOT, 'shop.sqlite'));

if (SESSION_SECRET.length < 32 || SESSION_SECRET.startsWith('replace-with-')) {
  console.error('ERROR: Set SESSION_SECRET to a fresh random value of at least 32 characters in .env/server environment.');
  process.exit(1);
}
if (DATABASE_FILE === PUBLIC_DIR || DATABASE_FILE.startsWith(PUBLIC_DIR + path.sep)) {
  console.error('ERROR: DATABASE_FILE must be outside public/.');
  process.exit(1);
}
if (IS_PROD && !PUBLIC_ORIGIN.startsWith('https://')) {
  console.error('ERROR: In production, set PUBLIC_ORIGIN to your HTTPS site origin.');
  process.exit(1);
}

const db = new DatabaseSync(DATABASE_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price INTEGER NOT NULL CHECK(price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved >= 0),
  icon TEXT NOT NULL DEFAULT '✦',
  badge TEXT NOT NULL DEFAULT 'DIGITAL',
  description TEXT NOT NULL DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 999,
  theme TEXT NOT NULL DEFAULT 'blue',
  delivery_mode TEXT NOT NULL DEFAULT 'manual' CHECK(delivery_mode IN ('manual','auto')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  subtotal INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'VND',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','delivered','cancelled')),
  fulfillment_status TEXT NOT NULL DEFAULT 'pending' CHECK(fulfillment_status IN ('pending','partial','delivered','manual')),
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  paid_at TEXT,
  delivered_at TEXT
);
CREATE INDEX IF NOT EXISTS orders_user_idx ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_expiry_idx ON orders(status, expires_at);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  icon TEXT NOT NULL DEFAULT '✦',
  delivery_mode TEXT NOT NULL DEFAULT 'manual'
);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','failed')),
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'VND',
  reference TEXT NOT NULL,
  provider_transaction_id TEXT UNIQUE,
  created_at TEXT NOT NULL,
  paid_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS payments_pending_order_unique_idx ON payments(order_id) WHERE status='pending';
CREATE TABLE IF NOT EXISTS webhook_events (
  event_id TEXT PRIMARY KEY,
  provider_transaction_id TEXT,
  status TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS webhook_txn_unique_idx ON webhook_events(provider_transaction_id) WHERE provider_transaction_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  cipher_text TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','assigned')),
  order_id TEXT REFERENCES orders(id),
  created_at TEXT NOT NULL,
  assigned_at TEXT
);
CREATE INDEX IF NOT EXISTS inventory_available_idx ON inventory(product_id, status, created_at);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
`);

const seedProducts = [
  ['key-weekly','Menu Premium 7 ngày','Menu Key',135000,99,'⌘','BÁN CHẠY','Quyền truy cập 7 ngày • Cấp key sau xác minh',1,'blue','manual'],
  ['key-monthly','Menu Premium 30 ngày','Menu Key',225000,60,'✦','TIẾT KIỆM','Gói 30 ngày • Phù hợp sử dụng dài hạn',2,'violet','manual'],
  ['key-day','Menu Starter 1 ngày','Menu Key',45000,120,'⚡','STARTER','Gói trải nghiệm • Thời hạn 24 giờ',3,'green','manual'],
  ['acc-game-pro','Acc Game — Premium','Acc Game',99000,14,'◈','NỔI BẬT','Tài khoản số bạn có quyền phân phối',4,'violet','manual'],
  ['acc-game-plus','Acc Game — Plus','Acc Game',159000,8,'🎮','LIMITED','Gói tài khoản số • Chi tiết khi bàn giao',5,'blue','manual'],
  ['acc-clone-basic','Acc Clone — Basic','Acc Clone',25000,30,'▣','GIÁ TỐT','Tài khoản số mẫu • Chỉ cung cấp tài khoản hợp pháp',6,'orange','manual'],
  ['acc-clone-pack','Acc Clone — Pack 5','Acc Clone',99000,15,'▤','COMBO','Gói nhiều tài khoản • Dữ liệu catalog mẫu',7,'orange','manual'],
  ['service-setup','Hỗ trợ cài đặt','Dịch vụ số',50000,999,'✳','HỖ TRỢ','Hỗ trợ thiết lập từ xa theo phạm vi dịch vụ',8,'green','manual'],
  ['service-vip','Dịch vụ VIP 30 ngày','Dịch vụ số',125000,40,'✧','VIP','Dịch vụ số • Tùy chỉnh nội dung trong quản trị',9,'violet','manual'],
  ['key-trial','Menu Test 3 ngày','Menu Key',75000,75,'◉','MỚI','Gói dùng thử 3 ngày • Key demo',10,'blue','manual']
];
const seedStmt = db.prepare(`INSERT OR IGNORE INTO products
(id,name,category,price,stock,reserved,icon,badge,description,featured,theme,delivery_mode,active,created_at)
VALUES (?,?,?,?,?,0,?,?,?,?,?,?,1,?)`);
const startupNow = new Date().toISOString();
for (const row of seedProducts) seedStmt.run(...row.slice(0,5), row[5], row[6], row[7], row[8], row[9], row[10], startupNow);

// First-run administrator bootstrap. Existing accounts are never overwritten by env changes.
if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  const email = normalizeEmail(process.env.ADMIN_EMAIL);
  const password = String(process.env.ADMIN_PASSWORD);
  if (!validEmail(email) || password.length < 14) {
    console.error('WARNING: ADMIN_EMAIL is invalid or ADMIN_PASSWORD is shorter than 14 characters; admin bootstrap skipped.');
  } else if (!db.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE').get(email)) {
    const hash = hashPasswordSync(password);
    db.prepare('INSERT INTO users(id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,?,?)')
      .run(randomId('usr'), 'Store Admin', email, hash, 'admin', new Date().toISOString());
    console.log(`Bootstrapped first admin account for ${email}. Change the .env password after securing the account.`);
  }
}
if (IS_PROD && !db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get()) {
  console.error('ERROR: Production requires a valid admin account. Set ADMIN_EMAIL and a strong ADMIN_PASSWORD before first startup.');
  process.exit(1);
}

const MIME = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon', '.txt':'text/plain; charset=utf-8'
};
const rateBuckets = new Map();

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}
function nowISO() { return new Date().toISOString(); }
function randomId(prefix='NM') { return `${prefix}-${crypto.randomBytes(8).toString('hex').toUpperCase()}`; }
function normalizeEmail(s) { return String(s || '').trim().toLowerCase(); }
function validEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254; }
function safeEqual(a,b) { const aa=Buffer.from(String(a)); const bb=Buffer.from(String(b)); return aa.length===bb.length && crypto.timingSafeEqual(aa,bb); }
function hashPasswordSync(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64*1024*1024 });
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}
function verifyPassword(password, encoded) {
  const [saltHex, hashHex] = String(encoded || '').split(':');
  if (!saltHex || !hashHex || !/^[a-f0-9]{32}$/i.test(saltHex) || !/^[a-f0-9]{128}$/i.test(hashHex)) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length, { N: 16384, r: 8, p: 1, maxmem: 64*1024*1024 });
  return crypto.timingSafeEqual(actual, expected);
}
// Used for missing-email login attempts to reduce response-time account enumeration.
const DUMMY_PASSWORD_HASH = hashPasswordSync(crypto.randomBytes(32).toString('hex'));
function publicUser(user) { return { id:user.id, name:user.name, email:user.email, role:user.role, createdAt:user.created_at }; }
function json(res, status, data, extraHeaders={}) {
  const out = Buffer.from(JSON.stringify(data));
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Content-Length':out.length, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', ...extraHeaders });
  res.end(out);
}
function fail(res, status, message, code='request_failed') { return json(res,status,{ok:false,error:code,message}); }
function parseCookies(req) {
  const out={};
  for(const part of String(req.headers.cookie||'').split(';')) {
    const i=part.indexOf('='); if(i<0) continue;
    try { out[part.slice(0,i).trim()] = decodeURIComponent(part.slice(i+1).trim()); } catch(_) {}
  }
  return out;
}
function cookieHeader(token,maxAge) {
  const parts = [`${COOKIE_NAME}=${encodeURIComponent(token)}`,'Path=/','HttpOnly','SameSite=Lax',`Max-Age=${maxAge}`];
  if (IS_PROD) parts.push('Secure');
  return parts.join('; ');
}
function clearCookieHeader() {
  const parts = [`${COOKIE_NAME}=`, 'Path=/','HttpOnly','SameSite=Lax','Max-Age=0'];
  if (IS_PROD) parts.push('Secure');
  return parts.join('; ');
}
function audit(actor, action, target, detail='') {
  db.prepare('INSERT INTO audit_log(actor_user_id,action,target,detail,created_at) VALUES(?,?,?,?,?)')
    .run(actor?.id || null, action, String(target), String(detail).slice(0,500), nowISO());
}
function normalizedOrigin(value) {
  try { return new URL(String(value || '')).origin; } catch(_) { return ''; }
}
function applyCors(req, res) {
  // Only reflect the configured storefront origin. Never use wildcard CORS with cookies.
  const origin = String(req.headers.origin || '');
  if (PUBLIC_ORIGIN && origin && normalizedOrigin(origin) === normalizedOrigin(PUBLIC_ORIGIN)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
  }
}
function requireSameOrigin(req) {
  const origin = req.headers.origin;
  const expected = PUBLIC_ORIGIN || `${IS_PROD?'https':'http'}://${req.headers.host}`;
  return normalizedOrigin(origin) !== '' && normalizedOrigin(origin) === normalizedOrigin(expected);
}
function rateLimit(req, key, max=10, windowMs=15*60*1000) {
  // Forwarded IP headers are client-controlled unless a trusted proxy is explicitly configured.
  const forwarded = process.env.TRUST_PROXY === 'true' ? req.headers['x-forwarded-for'] : '';
  const ip = String(forwarded || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const bucketKey = `${key}:${ip}`; const now=Date.now();
  let b=rateBuckets.get(bucketKey);
  if (!b || now>=b.resetAt) b={count:0,resetAt:now+windowMs};
  b.count++; rateBuckets.set(bucketKey,b);
  if (rateBuckets.size>5000) for (const [k,v] of rateBuckets) if(now>=v.resetAt) rateBuckets.delete(k);
  return { allowed:b.count<=max, retryAfter:Math.max(1,Math.ceil((b.resetAt-now)/1000)) };
}
async function readRawBody(req) {
  const chunks=[]; let size=0;
  for await (const chunk of req) {
    size += chunk.length;
    if(size>MAX_BODY_BYTES) { const e=new Error('Request body quá lớn.'); e.status=413; throw e; }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function readJSON(req) {
  const raw=await readRawBody(req);
  if (!raw.length) return {};
  const type=String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') { const e=new Error('API yêu cầu Content-Type: application/json.'); e.status=415; throw e; }
  try { return JSON.parse(raw.toString('utf8')); } catch(_) { const e=new Error('JSON không hợp lệ.'); e.status=400; throw e; }
}
function sessionUser(req) {
  const token = parseCookies(req)[COOKIE_NAME]; if(!token || !/^[a-f0-9]{64}$/i.test(token)) return null;
  const tokenHash = crypto.createHmac('sha256', SESSION_SECRET).update(token).digest('hex');
  const row = db.prepare(`SELECT u.id,u.name,u.email,u.role,u.created_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`).get(tokenHash, nowISO());
  return row ? { ...row, tokenHash } : null;
}
function requireUser(req,res,admin=false) {
  const user=sessionUser(req);
  if(!user) { fail(res,401,'Vui lòng đăng nhập lại.','unauthenticated'); return null; }
  if(admin && user.role!=='admin') { fail(res,403,'Bạn không có quyền quản trị.','forbidden'); return null; }
  return user;
}
function productRow(row) {
  return { id:row.id, name:row.name, category:row.category, price:row.price, stock:Math.max(0,row.stock-row.reserved), storedStock:row.stock, reserved:row.reserved, availableStock:Math.max(0,row.stock-row.reserved), icon:row.icon, badge:row.badge, description:row.description, featured:row.featured, theme:row.theme, deliveryMode:row.delivery_mode, active:Boolean(row.active) };
}
function listProducts(includeInactive=false) {
  const rows=includeInactive ? db.prepare('SELECT * FROM products ORDER BY featured,id').all() : db.prepare('SELECT * FROM products WHERE active=1 ORDER BY featured,id').all();
  return rows.map(productRow);
}
function fullOrder(row) {
  const items=db.prepare('SELECT product_id AS id,product_id AS productId,name,category,unit_price AS price,quantity AS qty,icon,delivery_mode AS deliveryMode FROM order_items WHERE order_id=?').all(row.id);
  return { id:row.id, createdAt:row.created_at, updatedAt:row.updated_at, customer:{name:row.customer_name,email:row.customer_email}, items, subtotal:row.subtotal, discount:row.discount, total:row.total, currency:row.currency, status:row.status, fulfillmentStatus:row.fulfillment_status, paymentMethod:row.payment_method, note:row.note, demo:false, expiresAt:row.expires_at };
}
function getOrder(code) { const row=db.prepare('SELECT * FROM orders WHERE id=?').get(String(code||'').toUpperCase()); return row ? fullOrder(row) : null; }
function releaseExpiredOrders() {
  const expired=db.prepare("SELECT id FROM orders WHERE status='pending' AND expires_at<=?").all(nowISO());
  if(!expired.length) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for(const {id} of expired) {
      const items=db.prepare('SELECT product_id,quantity FROM order_items WHERE order_id=?').all(id);
      for(const item of items) db.prepare('UPDATE products SET reserved=MAX(0,reserved-?) WHERE id=?').run(item.quantity,item.product_id);
      db.prepare("UPDATE orders SET status='cancelled',updated_at=?,note=CASE WHEN note='' THEN 'Hết hạn thanh toán' ELSE note || ' | Hết hạn thanh toán' END WHERE id=? AND status='pending'").run(nowISO(),id);
      db.prepare("UPDATE payments SET status='failed' WHERE order_id=? AND status='pending'").run(id);
    }
    db.exec('COMMIT');
  } catch(e) { db.exec('ROLLBACK'); throw e; }
}
function encryptionKey() {
  const raw=String(process.env.DIGITAL_DELIVERY_KEY||'');
  if(!/^[a-f0-9]{64}$/i.test(raw)) return null;
  return Buffer.from(raw,'hex');
}
function encryptDelivery(value) {
  const key=encryptionKey(); if(!key) throw new Error('Chưa cấu hình DIGITAL_DELIVERY_KEY 64 ký tự hex.');
  const iv=crypto.randomBytes(12); const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const cipherText=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);
  return {cipher_text:cipherText.toString('base64'),iv:iv.toString('hex'),auth_tag:cipher.getAuthTag().toString('hex')};
}
function decryptDelivery(row) {
  const key=encryptionKey(); if(!key) throw new Error('Chưa cấu hình DIGITAL_DELIVERY_KEY.');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(row.iv,'hex'));
  decipher.setAuthTag(Buffer.from(row.auth_tag,'hex'));
  return Buffer.concat([decipher.update(Buffer.from(row.cipher_text,'base64')),decipher.final()]).toString('utf8');
}
function tryAutoFulfill(orderId) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const order=db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
    if(!order || !['paid','delivered'].includes(order.status)) { db.exec('COMMIT'); return {ok:false,reason:'order_not_paid'}; }
    const rows=db.prepare('SELECT * FROM order_items WHERE order_id=?').all(orderId);
    let hasManual=false;
    // Preflight every auto-delivery line before assigning any inventory to avoid partial writes.
    const assignPlan=[];
    for(const item of rows) {
      if(item.delivery_mode!=='auto') { hasManual=true; continue; }
      const already=db.prepare("SELECT COUNT(*) AS n FROM inventory WHERE order_id=? AND product_id=? AND status='assigned'").get(orderId,item.product_id).n;
      const need=Math.max(0,item.quantity-already);
      if(!need) continue;
      const available=db.prepare("SELECT id FROM inventory WHERE product_id=? AND status='available' ORDER BY created_at,id LIMIT ?").all(item.product_id,need);
      if(available.length<need) { db.exec('ROLLBACK'); return {ok:false,reason:'inventory_insufficient'}; }
      assignPlan.push(...available.map(inv=>({inventoryId:inv.id,productId:item.product_id})));
    }
    for(const entry of assignPlan) db.prepare("UPDATE inventory SET status='assigned',order_id=?,assigned_at=? WHERE id=? AND status='available'").run(orderId,nowISO(),entry.inventoryId);
    const autoItems=rows.filter(i=>i.delivery_mode==='auto');
    const assignedAuto=autoItems.every(i=>db.prepare("SELECT COUNT(*) AS n FROM inventory WHERE order_id=? AND product_id=? AND status='assigned'").get(orderId,i.product_id).n>=i.quantity);
    const allAuto=rows.length>0 && rows.every(i=>i.delivery_mode==='auto');
    const fulfillment=allAuto && assignedAuto ? 'delivered' : (autoItems.length && assignedAuto ? 'partial' : 'manual');
    const status=allAuto && assignedAuto ? 'delivered' : order.status;
    db.prepare("UPDATE orders SET fulfillment_status=?,status=?,delivered_at=CASE WHEN ?='delivered' THEN COALESCE(delivered_at,?) ELSE delivered_at END,updated_at=? WHERE id=?")
      .run(fulfillment,status,status,nowISO(),nowISO(),orderId);
    db.exec('COMMIT');
    return {ok:allAuto && assignedAuto,reason:hasManual?'manual_items':(assignedAuto?'fulfilled':'inventory_insufficient')};
  } catch(e) { db.exec('ROLLBACK'); throw e; }
}
function createSession(userId, rememberMe) {
  const token=crypto.randomBytes(32).toString('hex');
  const tokenHash=crypto.createHmac('sha256', SESSION_SECRET).update(token).digest('hex');
  const maxAge=rememberMe ? REMEMBER_DAYS*24*60*60 : SESSION_HOURS*60*60;
  const expires=new Date(Date.now()+maxAge*1000).toISOString();
  db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(tokenHash,userId,nowISO(),expires);
  return {token,maxAge};
}
function orderAccess(order,user) { return !!order && !!user && order.user_id===user.id; }
function parseMoney(v) { const n=Number(v); return Number.isSafeInteger(n) && n>=0 ? n : null; }
function safeProductInput(input, existing=null) {
  const name=String(input.name||'').trim();
  const category=String(input.category||'').trim();
  const price=parseMoney(input.price);
  const stock=parseMoney(input.stock ?? (existing?existing.stock:0));
  const allowedCategories=['Menu Key','Acc Game','Acc Clone','Dịch vụ số'];
  const themes=['blue','violet','orange','green'];
  if(name.length<2||name.length>90) throw new Error('Tên sản phẩm cần từ 2 đến 90 ký tự.');
  if(!allowedCategories.includes(category)) throw new Error('Danh mục không hợp lệ.');
  if(price===null || stock===null) throw new Error('Giá và tồn kho phải là số nguyên không âm.');
  if(existing && stock < existing.reserved) throw new Error('Tồn kho không được thấp hơn số lượng đang giữ chỗ.');
  const deliveryMode=input.deliveryMode==='auto'?'auto':'manual';
  return { name,category,price,stock,icon:String(input.icon||'✦').slice(0,8),badge:String(input.badge||'DIGITAL').trim().slice(0,24),description:String(input.description||'').trim().slice(0,220),featured:parseMoney(input.featured)??(existing?.featured??999),theme:themes.includes(input.theme)?input.theme:(existing?.theme||'blue'),deliveryMode,active:input.active===false||input.active===0?0:1 };
}
function sendStatic(req,res,urlPath) {
  let pathname;
  try { pathname=decodeURIComponent(urlPath); } catch(_) { return fail(res,400,'Đường dẫn không hợp lệ.'); }
  if(pathname==='/' || pathname==='') pathname='/index.html';
  const resolved=path.resolve(PUBLIC_DIR, `.${pathname}`);
  if(!resolved.startsWith(PUBLIC_DIR+path.sep) && resolved!==path.join(PUBLIC_DIR,'index.html')) return fail(res,403,'Không được phép truy cập.');
  fs.stat(resolved,(err,st)=>{
    if(err || !st.isFile()) { res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff'}); return res.end('Not found'); }
    const ext=path.extname(resolved).toLowerCase();
    const extraConnectOrigins=String(process.env.CSP_CONNECT_ORIGINS||'').split(',').map(x=>normalizedOrigin(x.trim())).filter(x=>/^https?:\/\//.test(x));
    const connectSources=["'self'",...new Set(extraConnectOrigins)].join(' ');
    const headers={
      'Content-Type':MIME[ext]||'application/octet-stream','X-Content-Type-Options':'nosniff',
      'X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin',
      'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy':`default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src ${connectSources}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`,
      'Cache-Control':ext==='.html'||ext==='.js'?'no-cache':'public, max-age=3600'
    };
    res.writeHead(200,headers); fs.createReadStream(resolved).pipe(res);
  });
}

async function handler(req,res) {
  const url=new URL(req.url, `http://${req.headers.host||'localhost'}`);
  const pathname=url.pathname;
  applyCors(req,res);
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');

  if(pathname.startsWith('/api/') && req.method!=='OPTIONS') releaseExpiredOrders();
  if(req.method==='OPTIONS') {
    if (req.headers.origin && PUBLIC_ORIGIN && normalizedOrigin(req.headers.origin)!==normalizedOrigin(PUBLIC_ORIGIN)) return fail(res,403,'Nguồn gốc trình duyệt không được cho phép.','origin_rejected');
    res.writeHead(204,{'Allow':'GET,POST,PUT,PATCH,DELETE,OPTIONS','Cache-Control':'no-store'}); return res.end();
  }
  if(pathname==='/health' && req.method==='GET') return json(res,200,{ok:true,service:'nminhios-shop-api',version:'1.0.0',time:nowISO()});
  if(!pathname.startsWith('/api/')) {
    if(req.method!=='GET' && req.method!=='HEAD') return fail(res,405,'Phương thức không được hỗ trợ.');
    return sendStatic(req,res,pathname);
  }

  // Webhook uses a provider signature, not a browser session. Verify the signature before trusting fields.
  if(pathname==='/api/webhooks/bank' && req.method==='POST') {
    const secret=String(process.env.BANK_WEBHOOK_SECRET||'');
    if(secret.length<24) return fail(res,503,'Chưa cấu hình khóa webhook ngân hàng.','webhook_not_configured');
    let raw;
    try { raw=await readRawBody(req); } catch(e) { return fail(res,e.status||400,e.message); }
    const signature=String(req.headers['x-nminhios-signature']||'').replace(/^sha256=/i,'').toLowerCase();
    const expected=crypto.createHmac('sha256',secret).update(raw).digest('hex');
    if(!/^[a-f0-9]{64}$/.test(signature)||!safeEqual(signature,expected)) return fail(res,401,'Chữ ký webhook không hợp lệ.','bad_signature');
    let event; try { event=JSON.parse(raw.toString('utf8')); } catch(_) { return fail(res,400,'JSON webhook không hợp lệ.'); }
    const eventId=String(event.eventId||'').slice(0,160), transactionId=String(event.transactionId||'').slice(0,160), reference=String(event.reference||'').trim().toUpperCase();
    const amount=parseMoney(event.amount), currency=String(event.currency||'VND').toUpperCase();
    if(!eventId||!transactionId||!reference||amount===null) return fail(res,422,'Webhook thiếu eventId, transactionId, reference hoặc amount.');
    const existing=db.prepare('SELECT event_id FROM webhook_events WHERE event_id=? OR provider_transaction_id=?').get(eventId,transactionId);
    if(existing) return json(res,200,{ok:true,duplicate:true});
    const orderRow=db.prepare('SELECT * FROM orders WHERE id=?').get(reference);
    if(!orderRow) {
      db.prepare('INSERT INTO webhook_events(event_id,provider_transaction_id,status,received_at) VALUES(?,?,?,?)').run(eventId,transactionId,'unknown_order',nowISO());
      audit(null,'bank_webhook_unknown_order',reference,`event=${eventId}`);
      return fail(res,404,'Không tìm thấy mã đơn trong webhook.','order_not_found');
    }
    if(amount!==orderRow.total||currency!==orderRow.currency) {
      db.prepare('INSERT INTO webhook_events(event_id,provider_transaction_id,status,received_at) VALUES(?,?,?,?)').run(eventId,transactionId,'amount_mismatch',nowISO());
      audit(null,'bank_webhook_amount_mismatch',reference,`amount=${amount};expected=${orderRow.total};currency=${currency}`);
      return fail(res,422,'Số tiền hoặc loại tiền không khớp đơn hàng.','amount_mismatch');
    }
    if(orderRow.status!=='pending') {
      db.prepare('INSERT INTO webhook_events(event_id,provider_transaction_id,status,received_at) VALUES(?,?,?,?)').run(eventId,transactionId,'order_not_pending',nowISO());
      return json(res,200,{ok:true,ignored:true,reason:'order_not_pending'});
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO webhook_events(event_id,provider_transaction_id,status,received_at) VALUES(?,?,?,?)').run(eventId,transactionId,'accepted',nowISO());
      db.prepare("UPDATE orders SET status='paid',paid_at=?,updated_at=? WHERE id=? AND status='pending'").run(nowISO(),nowISO(),reference);
      const items=db.prepare('SELECT product_id,quantity FROM order_items WHERE order_id=?').all(reference);
      for(const item of items) db.prepare('UPDATE products SET reserved=MAX(0,reserved-?),stock=MAX(0,stock-?) WHERE id=?').run(item.quantity,item.quantity,item.product_id);
      db.prepare("UPDATE payments SET status='paid',provider_transaction_id=?,paid_at=? WHERE order_id=? AND status='pending'").run(transactionId,nowISO(),reference);
      audit(null,'bank_payment_verified',reference,`txn=${transactionId};amount=${amount}`);
      db.exec('COMMIT');
    } catch(e) { db.exec('ROLLBACK'); throw e; }
    const fulfill=tryAutoFulfill(reference);
    return json(res,200,{ok:true,paid:true,orderId:reference,fulfillment:fulfill.reason});
  }

  if(!pathname.startsWith('/api/')) return fail(res,404,'Không tìm thấy endpoint.');
  const mutating=['POST','PUT','PATCH','DELETE'].includes(req.method);
  if(mutating && !requireSameOrigin(req)) return fail(res,403,'Yêu cầu bị từ chối do kiểm tra nguồn gốc.','origin_rejected');

  if(pathname==='/api/products' && req.method==='GET') return json(res,200,{items:listProducts(false)});
  if(pathname==='/api/auth/me' && req.method==='GET') {
    const user=sessionUser(req); return json(res,200,{user:user?publicUser(user):null});
  }
  if(pathname==='/api/auth/register' && req.method==='POST') {
    const limit=rateLimit(req,'register',5); if(!limit.allowed) return json(res,429,{ok:false,message:'Quá nhiều lần thử tạo tài khoản. Hãy thử lại sau.',retryAfter:limit.retryAfter});
    let body; try{body=await readJSON(req);}catch(e){return fail(res,e.status||400,e.message);}
    const name=String(body.name||'').trim(), email=normalizeEmail(body.email), password=String(body.password||'');
    if(name.length<2||name.length>80) return fail(res,422,'Tên cần từ 2 đến 80 ký tự.');
    if(!validEmail(email)) return fail(res,422,'Email không hợp lệ.');
    if(password.length<10||password.length>128) return fail(res,422,'Mật khẩu cần từ 10 đến 128 ký tự.');
    if(db.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE').get(email)) return fail(res,409,'Email đã được đăng ký.','email_exists');
    const user={id:randomId('usr'),name,email,password_hash:hashPasswordSync(password),role:'customer',created_at:nowISO()};
    try { db.prepare('INSERT INTO users(id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run(user.id,user.name,user.email,user.password_hash,user.role,user.created_at); }
    catch(e) { if(String(e.message).includes('UNIQUE')) return fail(res,409,'Email đã được đăng ký.','email_exists'); throw e; }
    const session=createSession(user.id,Boolean(body.rememberMe));
    audit(user,'customer_register',user.id,'');
    return json(res,201,{user:publicUser(user)},{'Set-Cookie':cookieHeader(session.token,session.maxAge)});
  }
  if(pathname==='/api/auth/login' && req.method==='POST') {
    const limit=rateLimit(req,'login',10); if(!limit.allowed) return json(res,429,{ok:false,message:'Quá nhiều lần đăng nhập thất bại. Hãy thử lại sau.',retryAfter:limit.retryAfter});
    let body; try{body=await readJSON(req);}catch(e){return fail(res,e.status||400,e.message);}
    const email=normalizeEmail(body.email), password=String(body.password||'');
    if(!validEmail(email)||!password||password.length>128) return fail(res,422,'Email hoặc mật khẩu không hợp lệ.');
    const row=db.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE').get(email);
    // Always perform the scrypt work, even when the email is not found.
    const validPassword=verifyPassword(password,row?row.password_hash:DUMMY_PASSWORD_HASH);
    if(!row || !validPassword) return fail(res,401,'Email hoặc mật khẩu không đúng.','invalid_credentials');
    const session=createSession(row.id,Boolean(body.rememberMe));
    audit(row,'customer_login',row.id,'');
    return json(res,200,{user:publicUser(row)},{'Set-Cookie':cookieHeader(session.token,session.maxAge)});
  }
  if(pathname==='/api/auth/logout' && req.method==='POST') {
    const user=sessionUser(req); if(user) { db.prepare('DELETE FROM sessions WHERE token_hash=?').run(user.tokenHash); audit(user,'logout',user.id,''); }
    return json(res,200,{ok:true},{'Set-Cookie':clearCookieHeader()});
  }
  if(pathname==='/api/orders' && req.method==='GET') {
    const user=requireUser(req,res); if(!user)return;
    const limit=Math.min(100,Math.max(1,parseInt(url.searchParams.get('limit')||'30',10)||30));
    const rows=db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT ?').all(user.id,limit);
    return json(res,200,{items:rows.map(fullOrder)});
  }
  if(pathname==='/api/orders' && req.method==='POST') {
    const user=requireUser(req,res); if(!user)return;
    let body; try{body=await readJSON(req);}catch(e){return fail(res,e.status||400,e.message);}
    if(!Array.isArray(body.items)||body.items.length<1||body.items.length>25) return fail(res,422,'Đơn phải có từ 1 đến 25 dòng sản phẩm.');
    const itemsInput=[]; const merged=new Map();
    for(const input of body.items) {
      const id=String(input.productId||input.id||''); const qty=Number(input.quantity??input.qty);
      if(!id||!Number.isInteger(qty)||qty<1||qty>99) return fail(res,422,'Mã sản phẩm hoặc số lượng không hợp lệ.');
      merged.set(id,(merged.get(id)||0)+qty);
    }
    for(const [id,qty] of merged) { if(qty>99)return fail(res,422,'Số lượng tối đa cho mỗi sản phẩm là 99.'); const product=db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(id); if(!product)return fail(res,409,'Một sản phẩm không còn khả dụng.'); if(product.stock-product.reserved<qty)return fail(res,409,`Không đủ tồn kho cho ${product.name}.`); itemsInput.push({product,qty}); }
    const subtotal=itemsInput.reduce((sum,r)=>sum+r.product.price*r.qty,0);
    const coupon=String(body.couponCode||'').trim().toUpperCase();
    const discount=coupon==='NMINH10'?Math.round(subtotal*0.10):0;
    const total=subtotal-discount;
    if(!Number.isSafeInteger(total)||total<0) return fail(res,422,'Tổng đơn không hợp lệ.');
    const code=randomId('NM'); const created=nowISO(); const expires=new Date(Date.now()+30*60*1000).toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      // Re-check available inventory under a write transaction to prevent concurrent overselling.
      for(const r of itemsInput) {
        const locked=db.prepare('SELECT stock,reserved FROM products WHERE id=? AND active=1').get(r.product.id);
        if(!locked||locked.stock-locked.reserved<r.qty) throw new Error('STOCK_CONFLICT');
      }
      db.prepare(`INSERT INTO orders(id,user_id,customer_name,customer_email,subtotal,discount,total,currency,status,fulfillment_status,payment_method,note,created_at,updated_at,expires_at)
        VALUES(?,?,?,?,?,?,?,'VND','pending','pending','bank_transfer',?,?,?,?)`).run(code,user.id,user.name,user.email,subtotal,discount,total,String(body.note||'').trim().slice(0,500),created,created,expires);
      for(const r of itemsInput) {
        db.prepare('UPDATE products SET reserved=reserved+? WHERE id=?').run(r.qty,r.product.id);
        db.prepare('INSERT INTO order_items(order_id,product_id,name,category,unit_price,quantity,icon,delivery_mode) VALUES(?,?,?,?,?,?,?,?)')
          .run(code,r.product.id,r.product.name,r.product.category,r.product.price,r.qty,r.product.icon,r.product.delivery_mode);
      }
      audit(user,'order_created',code,`items=${itemsInput.length};total=${total}`);
      db.exec('COMMIT');
    } catch(e) { db.exec('ROLLBACK'); if(e.message==='STOCK_CONFLICT')return fail(res,409,'Tồn kho vừa thay đổi. Hãy thử lại.','stock_conflict'); throw e; }
    return json(res,201,{order:getOrder(code),message:'Đơn đã được tạo. Hãy tạo thanh toán để nhận thông tin chuyển khoản.'});
  }
  const orderPath=pathname.match(/^\/api\/orders\/([A-Z0-9-]+)(?:\/(delivery))?$/i);
  if(orderPath && req.method==='GET') {
    const user=requireUser(req,res); if(!user)return;
    const row=db.prepare('SELECT * FROM orders WHERE id=?').get(orderPath[1].toUpperCase());
    if(!row||row.user_id!==user.id) return fail(res,404,'Không tìm thấy đơn hàng.','order_not_found');
    if(orderPath[2]==='delivery') {
      if(!['paid','delivered'].includes(row.status)) return fail(res,409,'Sản phẩm chỉ hiển thị sau khi thanh toán được xác minh.','not_paid');
      const assigned=db.prepare("SELECT i.*,p.name AS product_name FROM inventory i JOIN products p ON p.id=i.product_id WHERE i.order_id=? AND i.status='assigned' ORDER BY i.created_at").all(row.id);
      let items=[]; try { items=assigned.map(r=>({productName:r.product_name,value:decryptDelivery(r)})); } catch(e) { return fail(res,503,'Không thể giải mã kho giao hàng. Kiểm tra DIGITAL_DELIVERY_KEY.','delivery_key_unavailable'); }
      return json(res,200,{orderId:row.id,status:row.status,fulfillmentStatus:row.fulfillment_status,items});
    }
    return json(res,200,{order:fullOrder(row)});
  }
  if(pathname==='/api/payments/create' && req.method==='POST') {
    const user=requireUser(req,res); if(!user)return;
    let body; try{body=await readJSON(req);}catch(e){return fail(res,e.status||400,e.message);}
    const code=String(body.orderId||'').toUpperCase();
    if(body.provider && body.provider!=='bank_transfer') return fail(res,400,'Nhà cung cấp thanh toán này chưa được tích hợp.');
    const order=db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(code,user.id);
    if(!order) return fail(res,404,'Không tìm thấy đơn hàng.','order_not_found');
    if(order.status!=='pending') return fail(res,409,'Đơn hàng không còn chờ thanh toán.');
    let payment=db.prepare('SELECT * FROM payments WHERE order_id=? AND status=?').get(code,'pending');
    if(!payment) {
      payment={id:randomId('pay'),order_id:code,provider:'bank_transfer',status:'pending',amount:order.total,currency:order.currency,reference:code,created_at:nowISO()};
      db.prepare('INSERT INTO payments(id,order_id,provider,status,amount,currency,reference,created_at) VALUES(?,?,?,?,?,?,?,?)').run(payment.id,payment.order_id,payment.provider,payment.status,payment.amount,payment.currency,payment.reference,payment.created_at);
    }
    const configured=!!(process.env.BANK_ACCOUNT_NUMBER&&process.env.BANK_ACCOUNT_NAME&&process.env.BANK_PROVIDER_NAME);
    const instructions=configured?{configured:true,provider:process.env.BANK_PROVIDER_NAME,accountName:process.env.BANK_ACCOUNT_NAME,accountNumber:process.env.BANK_ACCOUNT_NUMBER,amount:order.total,transferContent:code}:{configured:false,message:'Chủ shop chưa cấu hình thông tin tài khoản nhận tiền. Chưa thể chuyển khoản thật.'};
    return json(res,201,{payment:{id:payment.id,status:payment.status,amount:payment.amount,currency:payment.currency,reference:payment.reference,instructions}});
  }

  // Admin routes: every mutation is authenticated and role-checked on the server.
  if(pathname==='/api/admin/products' && req.method==='GET') {
    const user=requireUser(req,res,true); if(!user)return;
    return json(res,200,{items:db.prepare('SELECT * FROM products ORDER BY featured,id').all().map(productRow)});
  }
  if(pathname==='/api/admin/products' && req.method==='POST') {
    const user=requireUser(req,res,true); if(!user)return;
    let body; try{body=await readJSON(req);}catch(e){return fail(res,e.status||400,e.message);}
    let p; try{p=safeProductInput(body);}catch(e){return fail(res,422,e.message);}
    const id=String(body.id||randomId('prod')).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,70)||randomId('prod');
    if(p.deliveryMode==='auto') p.stock=0;
    if(db.prepare('SELECT id FROM products WHERE id=?').get(id)) return fail(res,409,'ID sản phẩm đã tồn tại.');
    db.prepare(`INSERT INTO products(id,name,category,price,stock,reserved,icon,badge,description,featured,theme,delivery_mode,active,created_at)
      VALUES(?,?,?,?,?,0,?,?,?,?,?,?,?,?)`).run(id,p.name,p.category,p.price,p.stock,p.icon,p.badge,p.description,p.featured,p.theme,p.deliveryMode,p.active,nowISO());
    audit(user,'product_created',id,p.name); return json(res,201,{item:productRow(db.prepare('SELECT * FROM products WHERE id=?').get(id))});
  }
  const adminProduct=pathname.match(/^\/api\/admin\/products\/([A-Za-z0-9_-]+)$/);
  if(adminProduct && req.method==='PUT') {
    const user=requireUser(req,res,true); if(!user)return;
    let body; try{body=await readJSON(req);}catch(e){return fail(res,e.status||400,e.message);}
    const old=db.prepare('SELECT * FROM products WHERE id=?').get(adminProduct[1]); if(!old)return fail(res,404,'Không tìm thấy sản phẩm.');
    let p; try{p=safeProductInput(body,old);}catch(e){return fail(res,422,e.message);}
    if(p.deliveryMode==='auto') {
      if(old.delivery_mode!=='auto' && old.reserved>0) return fail(res,409,'Không thể đổi kiểu bàn giao khi sản phẩm đang có đơn giữ kho.');
      p.stock=db.prepare("SELECT COUNT(*) AS n FROM inventory WHERE product_id=? AND status='available'").get(old.id).n;
    }
    db.prepare(`UPDATE products SET name=?,category=?,price=?,stock=?,icon=?,badge=?,description=?,featured=?,theme=?,delivery_mode=?,active=? WHERE id=?`)
      .run(p.name,p.category,p.price,p.stock,p.icon,p.badge,p.description,p.featured,p.theme,p.deliveryMode,p.active,old.id);
    audit(user,'product_updated',old.id,p.name); return json(res,200,{item:productRow(db.prepare('SELECT * FROM products WHERE id=?').get(old.id))});
  }
  if(adminProduct && req.method==='DELETE') {
    const user=requireUser(req,res,true); if(!user)return;
    const old=db.prepare('SELECT * FROM products WHERE id=?').get(adminProduct[1]); if(!old)return fail(res,404,'Không tìm thấy sản phẩm.');
    const activeOrders=db.prepare("SELECT COUNT(*) AS n FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.product_id=? AND o.status IN ('pending','paid')").get(old.id).n;
    if(activeOrders>0) return fail(res,409,'Không thể xóa sản phẩm đang nằm trong đơn chưa hoàn tất. Hãy tắt sản phẩm thay vì xóa.');
    db.prepare('UPDATE products SET active=0 WHERE id=?').run(old.id); audit(user,'product_archived',old.id,old.name); return json(res,200,{ok:true});
  }
  if(pathname==='/api/admin/orders' && req.method==='GET') {
    const user=requireUser(req,res,true); if(!user)return;
    const rows=db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 200').all(); return json(res,200,{items:rows.map(fullOrder)});
  }
  const adminOrder=pathname.match(/^\/api\/admin\/orders\/([A-Z0-9-]+)(?:\/(fulfill))?$/i);
  if(adminOrder && req.method==='PATCH' && !adminOrder[2]) {
    const user=requireUser(req,res,true); if(!user)return;
    let body; try{body=await readJSON(req);}catch(e){return fail(res,e.status||400,e.message);}
    const code=adminOrder[1].toUpperCase(); const row=db.prepare('SELECT * FROM orders WHERE id=?').get(code);
    if(!row)return fail(res,404,'Không tìm thấy đơn hàng.');
    if(body.status!=='cancelled') return fail(res,422,'Admin chỉ có thể hủy đơn đang chờ; trạng thái paid chỉ do webhook hợp lệ xác nhận.');
    if(row.status!=='pending')return fail(res,409,'Chỉ được hủy đơn đang chờ thanh toán.');
    db.exec('BEGIN IMMEDIATE');
    try {
      for(const item of db.prepare('SELECT product_id,quantity FROM order_items WHERE order_id=?').all(code)) db.prepare('UPDATE products SET reserved=MAX(0,reserved-?) WHERE id=?').run(item.quantity,item.product_id);
      db.prepare("UPDATE orders SET status='cancelled',updated_at=?,note=CASE WHEN note='' THEN 'Hủy bởi quản trị viên' ELSE note || ' | Hủy bởi quản trị viên' END WHERE id=?").run(nowISO(),code);
      db.prepare("UPDATE payments SET status='failed' WHERE order_id=? AND status='pending'").run(code);
      audit(user,'order_cancelled',code,''); db.exec('COMMIT');
    } catch(e) {db.exec('ROLLBACK');throw e;}
    return json(res,200,{order:getOrder(code)});
  }
  if(adminOrder && req.method==='POST' && adminOrder[2]==='fulfill') {
    const user=requireUser(req,res,true); if(!user)return;
    const code=adminOrder[1].toUpperCase(); const row=db.prepare('SELECT * FROM orders WHERE id=?').get(code);
    if(!row)return fail(res,404,'Không tìm thấy đơn hàng.');
    if(!['paid','delivered'].includes(row.status))return fail(res,409,'Chỉ bàn giao sau khi webhook xác nhận đã thanh toán.');
    const result=tryAutoFulfill(code);
    const autoLines=db.prepare("SELECT product_id,quantity FROM order_items WHERE order_id=? AND delivery_mode='auto'").all(code);
    for(const line of autoLines) {
      const assigned=db.prepare("SELECT COUNT(*) AS n FROM inventory WHERE order_id=? AND product_id=? AND status='assigned'").get(code,line.product_id).n;
      if(assigned<line.quantity) return fail(res,409,'Kho tự động chưa đủ hàng cho đơn này. Không thể xác nhận đã bàn giao.','inventory_insufficient');
    }
    const current=db.prepare('SELECT * FROM orders WHERE id=?').get(code);
    if(current.fulfillment_status!=='delivered') {
      db.prepare("UPDATE orders SET status='delivered',fulfillment_status='delivered',delivered_at=?,updated_at=? WHERE id=?").run(nowISO(),nowISO(),code);
    }
    audit(user,'order_fulfilled',code,result.reason); return json(res,200,{order:getOrder(code),note:'Xác nhận bàn giao từ quản trị viên.'});
  }
  if(pathname==='/api/admin/inventory' && req.method==='GET') {
    const user=requireUser(req,res,true); if(!user)return;
    const productId=url.searchParams.get('productId');
    let rows;
    if(productId) rows=db.prepare(`SELECT p.id AS productId,p.name, SUM(CASE WHEN i.status='available' THEN 1 ELSE 0 END) AS available, SUM(CASE WHEN i.status='assigned' THEN 1 ELSE 0 END) AS assigned FROM products p LEFT JOIN inventory i ON i.product_id=p.id WHERE p.id=? GROUP BY p.id`).all(productId);
    else rows=db.prepare(`SELECT p.id AS productId,p.name, SUM(CASE WHEN i.status='available' THEN 1 ELSE 0 END) AS available, SUM(CASE WHEN i.status='assigned' THEN 1 ELSE 0 END) AS assigned FROM products p LEFT JOIN inventory i ON i.product_id=p.id GROUP BY p.id ORDER BY p.name`).all();
    return json(res,200,{items:rows});
  }
  if(pathname==='/api/admin/inventory' && req.method==='POST') {
    const user=requireUser(req,res,true); if(!user)return;
    let body; try{body=await readJSON(req);}catch(e){return fail(res,e.status||400,e.message);}
    const productId=String(body.productId||''); const values=Array.isArray(body.items)?body.items:[];
    if(!values.length||values.length>1000)return fail(res,422,'Nhập từ 1 đến 1000 dòng kho mỗi lần.');
    if(!encryptionKey())return fail(res,503,'Chưa cấu hình DIGITAL_DELIVERY_KEY 64 ký tự hex.','delivery_key_unavailable');
    const product=db.prepare('SELECT * FROM products WHERE id=?').get(productId); if(!product)return fail(res,404,'Không tìm thấy sản phẩm.');
    if(product.delivery_mode!=='auto')return fail(res,409,'Hãy đặt Delivery mode = auto cho sản phẩm trước khi nhập kho.');
    const clean=values.map(v=>String(v||'').trim()).filter(v=>v.length>0&&v.length<=4000);
    if(!clean.length)return fail(res,422,'Không có dòng dữ liệu hợp lệ.');
    db.exec('BEGIN IMMEDIATE');
    try {
      for(const value of clean) {
        const enc=encryptDelivery(value);
        db.prepare('INSERT INTO inventory(id,product_id,cipher_text,iv,auth_tag,status,created_at) VALUES(?,?,?,?,?,\'available\',?)').run(randomId('inv'),productId,enc.cipher_text,enc.iv,enc.auth_tag,nowISO());
      }
      db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(clean.length,productId);
      audit(user,'inventory_imported',productId,`count=${clean.length}`); db.exec('COMMIT');
    } catch(e) {db.exec('ROLLBACK'); throw e;}
    // Try to fulfill paid orders waiting for inventory for this product.
    const waiting=db.prepare("SELECT DISTINCT o.id FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE o.status='paid' AND oi.product_id=? ORDER BY o.created_at").all(productId);
    for(const o of waiting) { tryAutoFulfill(o.id); }
    return json(res,201,{ok:true,imported:clean.length,productId});
  }

  return fail(res,404,'Không tìm thấy endpoint.','not_found');
}

const server=http.createServer((req,res)=>{
  Promise.resolve(handler(req,res)).catch(err=>{
    console.error(`[${nowISO()}] ${req.method} ${req.url}:`,err && err.stack ? err.stack : err);
    if(res.headersSent) { try{res.end();}catch(_){} return; }
    const status=Number(err.status)||500;
    json(res,status,{ok:false,error:status===500?'internal_error':'request_failed',message:status===500?'Lỗi máy chủ. Kiểm tra log server.':String(err.message||'Yêu cầu không hợp lệ.')});
  });
});
server.requestTimeout=15000;
server.headersTimeout=20000;
server.keepAliveTimeout=5000;
server.listen(PORT,HOST,()=>{
  console.log(`nminhios shop listening on http://${HOST}:${PORT}`);
  console.log(`Database: ${DATABASE_FILE}`);
  console.log(`Mode: ${IS_PROD?'production':'development'}; browser demo mode is disabled when served from this backend.`);
});
process.on('SIGINT',()=>{ try{server.close(()=>{db.close();process.exit(0);});}catch(_){process.exit(0);} });
process.on('SIGTERM',()=>{ try{server.close(()=>{db.close();process.exit(0);});}catch(_){process.exit(0);} });
