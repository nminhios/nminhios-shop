(() => {
  'use strict';
  const CONFIG = window.NMINHIOS_CONFIG || { DEMO_MODE: true, API_BASE_URL: '', CURRENCY: 'VND', COUPON_DEMO: 'NMINH10', DEMO_DISCOUNT_RATE: .1, REQUEST_TIMEOUT_MS: 9000 };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const STORAGE = { products: 'nminhios.products.v1', cart: 'nminhios.cart.v1', orders: 'nminhios.orders.v1', profiles: 'nminhios.profiles.v1', session: 'nminhios.session.v1', api: 'nminhios.apiBase.v1' };
  const seedProducts = [
    { id:'key-weekly', name:'Menu Premium 7 ngày', category:'Menu Key', price:135000, stock:99, icon:'⌘', badge:'BÁN CHẠY', description:'Quyền truy cập 7 ngày • Cấp key sau xác minh', featured:1, theme:'blue' },
    { id:'key-monthly', name:'Menu Premium 30 ngày', category:'Menu Key', price:225000, stock:60, icon:'✦', badge:'TIẾT KIỆM', description:'Gói 30 ngày • Phù hợp sử dụng dài hạn', featured:2, theme:'violet' },
    { id:'key-day', name:'Menu Starter 1 ngày', category:'Menu Key', price:45000, stock:120, icon:'⚡', badge:'STARTER', description:'Gói trải nghiệm • Thời hạn 24 giờ', featured:3, theme:'green' },
    { id:'acc-game-pro', name:'Acc Game — Premium', category:'Acc Game', price:99000, stock:14, icon:'◈', badge:'NỔI BẬT', description:'Tài khoản mẫu • Mô tả và bàn giao qua hệ thống', featured:4, theme:'violet' },
    { id:'acc-game-plus', name:'Acc Game — Plus', category:'Acc Game', price:159000, stock:8, icon:'🎮', badge:'LIMITED', description:'Gói tài khoản số • Chi tiết hiển thị khi kết nối API', featured:5, theme:'blue' },
    { id:'acc-clone-basic', name:'Acc Clone — Basic', category:'Acc Clone', price:25000, stock:30, icon:'▣', badge:'GIÁ TỐT', description:'Tài khoản số mẫu • Chỉ cung cấp tài khoản hợp pháp', featured:6, theme:'orange' },
    { id:'acc-clone-pack', name:'Acc Clone — Pack 5', category:'Acc Clone', price:99000, stock:15, icon:'▤', badge:'COMBO', description:'Gói nhiều tài khoản • Demo catalog', featured:7, theme:'orange' },
    { id:'service-setup', name:'Hỗ trợ cài đặt', category:'Dịch vụ số', price:50000, stock:999, icon:'✳', badge:'HỖ TRỢ', description:'Hỗ trợ thiết lập từ xa theo phạm vi dịch vụ', featured:8, theme:'green' },
    { id:'service-vip', name:'Dịch vụ VIP 30 ngày', category:'Dịch vụ số', price:125000, stock:40, icon:'✧', badge:'VIP', description:'Dịch vụ số • Chi tiết sẽ tùy chỉnh trong trang quản trị', featured:9, theme:'violet' },
    { id:'key-trial', name:'Menu Test 3 ngày', category:'Menu Key', price:75000, stock:75, icon:'◉', badge:'MỚI', description:'Gói dùng thử 3 ngày • Key là dữ liệu demo', featured:10, theme:'blue' }
  ];
  const state = { view:'home', category:'Tất cả', cart:[], coupon:false, currentUser:null, selectedOrderId:null, shopSearch:'', shopSort:'featured', homeSort:'featured', authMode:'login', editingProductId:null, remoteProducts:[], remoteOrders:[], remoteAdminOrders:[], apiReady:false };

  function readJSON(key, fallback) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; } }
  function writeJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (_) { toast('Không thể lưu dữ liệu', 'Bộ nhớ trình duyệt có thể đã đầy hoặc bị chặn.', 'error'); return false; } }
  function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function money(value) { return new Intl.NumberFormat('vi-VN', { style:'currency', currency:'VND', maximumFractionDigits:0 }).format(Number(value) || 0).replace(/\s/g,''); }
  function shortDate(value) { try { return new Intl.DateTimeFormat('vi-VN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)); } catch(_) { return String(value || '—'); } }
  function makeId(prefix='NM') { const bytes = new Uint8Array(4); if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes); else for(let i=0;i<bytes.length;i++) bytes[i]=Math.floor(Math.random()*256); return `${prefix}-${Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('').toUpperCase()}`; }
  function toast(title, message, type='success') {
    const stack = $('#toastStack'); if(!stack) return;
    const node = document.createElement('div'); node.className = `toast ${type==='error'?'error':''}`;
    node.innerHTML = `<span class="toast-symbol">${type==='error'?'!':'✓'}</span><div><strong>${escapeHTML(title)}</strong><p>${escapeHTML(message)}</p></div>`;
    stack.appendChild(node); setTimeout(()=>{node.style.opacity='0';node.style.transform='translateY(5px)';setTimeout(()=>node.remove(),220);},3600);
  }
  function apiMode() { return CONFIG.DEMO_MODE === false; }
  function products() { return apiMode() ? state.remoteProducts : (readJSON(STORAGE.products, null) || seedProducts.map(p=>({...p}))); }
  function saveProducts(items) { if(!apiMode()) writeJSON(STORAGE.products, items); }
  function orders() { return apiMode() ? state.remoteOrders : readJSON(STORAGE.orders, []); }
  function saveOrders(items) { if(!apiMode()) writeJSON(STORAGE.orders, items); }
  function profiles() { return readJSON(STORAGE.profiles, []); }
  function saveProfiles(items) { writeJSON(STORAGE.profiles, items); }
  function storeCart() { writeJSON(STORAGE.cart, state.cart); }
  function currentApiBase() { return (readJSON(STORAGE.api, '') || CONFIG.API_BASE_URL || '').replace(/\/+$/,''); }
  function getCartItems() { const catalog=products(); return state.cart.map(row=>({ ...row, product:catalog.find(p=>p.id===row.id) })).filter(row=>row.product); }
  function subtotal() { return getCartItems().reduce((s,row)=>s + Math.max(0,Number(row.product.price)||0) * row.qty,0); }
  function discountAmount() { return state.coupon ? Math.round(subtotal() * Number(CONFIG.DEMO_DISCOUNT_RATE || .1)) : 0; }
  function total() { return Math.max(0,subtotal()-discountAmount()); }

  async function apiRequest(path, options={}) {
    const base=currentApiBase();
    if(!base && !apiMode()) throw new Error('Chưa cấu hình API Base URL.');
    const target = `${base}${path}`;
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(), Number(CONFIG.REQUEST_TIMEOUT_MS)||9000);
    try {
      const headers={ ...(options.headers||{}) };
      if(options.body && !headers['Content-Type'] && !headers['content-type']) headers['Content-Type']='application/json';
      const resp=await fetch(target, { ...options, signal:controller.signal, headers, credentials:'include', cache:'no-store' });
      const body=await resp.json().catch(()=>({}));
      if(!resp.ok) throw new Error(body.message || `API phản hồi HTTP ${resp.status}`);
      return body;
    } catch(e) { if(e.name==='AbortError') throw new Error('API quá thời gian phản hồi.'); throw e; }
    finally { clearTimeout(timer); }
  }
  async function loadServerCatalog(admin=false) {
    if(!apiMode()) return;
    const payload=await apiRequest(admin?'/api/admin/products':'/api/products');
    state.remoteProducts=Array.isArray(payload.items)?payload.items:[];
    renderHome(); renderShop(); renderCart();
  }
  async function loadServerOrders() {
    if(!apiMode()) return;
    if(!state.currentUser) { state.remoteOrders=[]; renderOrders(); return; }
    const payload=await apiRequest('/api/orders?limit=100');
    state.remoteOrders=Array.isArray(payload.items)?payload.items:[];
    renderOrders();
  }
  async function loadServerSession() {
    const payload=await apiRequest('/api/auth/me');
    state.currentUser=payload.user||null;
    if(state.currentUser) await loadServerOrders(); else { state.remoteOrders=[]; renderOrders(); }
    updateProfileUI();
  }
  async function loadInventoryStats() {
    if(!apiMode() || state.currentUser?.role!=='admin' || !$('#inventoryStats')) return;
    try {
      const payload=await apiRequest('/api/admin/inventory');
      const rows=payload.items||[];
      $('#inventoryStats').innerHTML=rows.map(x=>`<div class="admin-product-row"><div class="admin-product-icon">▤</div><div class="admin-product-name"><strong>${escapeHTML(x.name)}</strong><small>${escapeHTML(x.productId)}</small></div><div class="admin-product-price">Còn ${Number(x.available)||0} · Đã cấp ${Number(x.assigned)||0}</div></div>`).join('')||'<div class="empty-table">Chưa có kho sản phẩm.</div>';
      const select=$('#inventoryProductId'); if(select) { const old=select.value; select.innerHTML=products().filter(p=>p.active!==false).map(p=>`<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)}</option>`).join(''); if([...select.options].some(o=>o.value===old))select.value=old; }
    } catch(e) { $('#inventoryStats').innerHTML=`<div class="empty-table">${escapeHTML(e.message)}</div>`; }
  }

  function goView(view) {
    if(!$('#view-'+view)) view='home';
    state.view=view;
    $$('.view').forEach(el=>el.classList.toggle('active',el.id===`view-${view}`));
    $$('.nav-item[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===view));
    const titles={home:'Tổng quan',shop:'Cửa hàng',orders:'Đơn hàng của tôi',track:'Tra cứu đơn',help:'Trợ giúp',admin:'Quản trị cửa hàng'};
    $('#crumbCurrent').textContent=titles[view]||'Tổng quan';
    $('#sidebar').classList.remove('mobile-open');
    window.scrollTo({top:0,behavior:'smooth'});
    if(view==='shop') renderShop(); if(view==='orders') renderOrders(); if(view==='admin') renderAdmin();
  }
  function setCategory(category) {
    state.category=category||'Tất cả';
    $$('#shopChips .chip').forEach(ch=>ch.classList.toggle('active',ch.dataset.filter===state.category));
    goView('shop'); renderShop();
  }
  function productTheme(p){ return ['blue','violet','orange','green'].includes(p.theme)?p.theme:'blue'; }
  function productCard(p) {
    const stock=Number(p.stock)||0;
    const badgeClass=p.theme==='violet'?'badge-violet':p.theme==='orange'?'badge-orange':'';
    return `<article class="product-card"><div class="product-visual theme-${productTheme(p)}"><span class="product-badge ${badgeClass}">${escapeHTML(p.badge||'DIGITAL')}</span><span class="stock-tag">${stock>0?`Còn ${stock}`:'Hết hàng'}</span><span class="product-emoji">${escapeHTML(p.icon||'✦')}</span></div><div class="product-info"><div class="product-category">${escapeHTML(p.category)}</div><h3>${escapeHTML(p.name)}</h3><p class="product-description">${escapeHTML(p.description||'Sản phẩm số nminhios shop.')}</p><div class="product-bottom"><div class="price-block"><strong>${money(p.price)}</strong><small>Đã gồm giá niêm yết</small></div><button class="add-btn" data-add="${escapeHTML(p.id)}" aria-label="Thêm ${escapeHTML(p.name)} vào giỏ" ${stock<=0?'disabled':''}>+</button></div></div></article>`;
  }
  function sortProducts(list, sort) {
    const out=[...list]; if(sort==='priceAsc') out.sort((a,b)=>a.price-b.price); else if(sort==='priceDesc') out.sort((a,b)=>b.price-a.price); else if(sort==='name') out.sort((a,b)=>a.name.localeCompare(b.name,'vi')); else out.sort((a,b)=>(a.featured??999)-(b.featured??999)); return out;
  }
  function renderHome() {
    const catalogCount=$('#catalogCountBadge'); if(catalogCount) catalogCount.textContent=products().filter(p=>p.active!==false).length;
    let list=products().filter(p=>p.active!==false && p.stock>0); list=sortProducts(list,state.homeSort).slice(0,4);
    $('#homeProducts').innerHTML=list.map(productCard).join('') || '<div class="empty-table">Chưa có sản phẩm.</div>';
    $('#homeSort').value=state.homeSort;
    updateCartBadge();
  }
  function renderShop() {
    const catalogCount=$('#catalogCountBadge'); if(catalogCount) catalogCount.textContent=products().filter(p=>p.active!==false).length;
    const q=state.shopSearch.trim().toLocaleLowerCase('vi');
    let list=products().filter(p=>p.active!==false && (state.category==='Tất cả'||p.category===state.category)&&(!q||`${p.name} ${p.category} ${p.description}`.toLocaleLowerCase('vi').includes(q)));
    list=sortProducts(list,state.shopSort);
    $('#shopProducts').innerHTML=list.map(productCard).join('');
    $('#shopResultCount').textContent=list.length;
    $('#shopEmpty').classList.toggle('hidden',list.length!==0);
    $('#shopProducts').classList.toggle('hidden',list.length===0);
    $('#shopSearch').value=state.shopSearch; $('#shopSort').value=state.shopSort;
    $$('#shopChips .chip').forEach(ch=>ch.classList.toggle('active',ch.dataset.filter===state.category));
  }
  function updateCartBadge(){const count=state.cart.reduce((s,r)=>s+r.qty,0);$('#cartCount').textContent=count;$('#drawerItemCount').textContent=`(${count})`;}
  function addToCart(id) {
    const p=products().find(x=>x.id===id); if(!p)return;
    if((Number(p.stock)||0)<=0){toast('Sản phẩm hết hàng','Mặt hàng này hiện không có sẵn.','error');return;}
    const row=state.cart.find(x=>x.id===id); const current=row?row.qty:0;
    if(current>=p.stock){toast('Đã đạt số lượng tối đa',`Tồn kho hiện tại: ${p.stock}.`,'error');return;}
    if(row)row.qty++;else state.cart.push({id,qty:1}); storeCart(); renderCart(); updateCartBadge(); toast('Đã thêm vào giỏ',p.name);
  }
  function changeQty(id,delta) {
    const row=state.cart.find(x=>x.id===id);const p=products().find(x=>x.id===id);if(!row||!p)return;
    row.qty+=delta;if(row.qty<=0)state.cart=state.cart.filter(x=>x.id!==id);else if(row.qty>p.stock){row.qty=p.stock;toast('Tồn kho giới hạn',`Tối đa ${p.stock} sản phẩm.`,'error');}
    state.coupon=false;storeCart();renderCart();updateCartBadge();
  }
  function removeFromCart(id) { state.cart=state.cart.filter(x=>x.id!==id);state.coupon=false;storeCart();renderCart();updateCartBadge(); }
  function renderCart() {
    const rows=getCartItems();const empty=rows.length===0;
    $('#cartEmpty').classList.toggle('hidden',!empty);$('#cartBottom').classList.toggle('hidden',empty);
    $('#cartItems').innerHTML=rows.map(({id,qty,product:p})=>`<div class="cart-line"><div class="cart-line-visual">${escapeHTML(p.icon||'✦')}</div><div class="cart-line-main"><strong>${escapeHTML(p.name)}</strong><small>${escapeHTML(p.category)} · ${money(p.price)}/sp</small><div class="quantity-control"><button data-qty="${escapeHTML(id)}" data-delta="-1" aria-label="Giảm số lượng">−</button><span>${qty}</span><button data-qty="${escapeHTML(id)}" data-delta="1" aria-label="Tăng số lượng">+</button><span class="cart-line-price">${money(p.price*qty)}</span></div></div><button class="remove-item" data-remove="${escapeHTML(id)}" aria-label="Xóa sản phẩm">×</button></div>`).join('');
    $('#cartSubtotal').textContent=money(subtotal());$('#cartTotal').textContent=money(total());$('#cartDiscount').textContent='−'+money(discountAmount());$('#discountLine').classList.toggle('hidden',!state.coupon);const discountLabel=$('#discountLabel');if(discountLabel)discountLabel.textContent=apiMode()?'Mã giảm giá':'Ưu đãi demo';
    $('#couponNote').textContent=state.coupon?(apiMode()?'Mã NMINH10 sẽ được máy chủ xác minh.':'Đã áp dụng ưu đãi demo 10%.'):'';
    updateCartBadge();
  }
  function openCart() { renderCart();$('#overlay').classList.add('open');$('#cartDrawer').classList.add('open');$('#cartDrawer').setAttribute('aria-hidden','false');document.body.style.overflow='hidden'; }
  function closeCart() { $('#overlay').classList.remove('open');$('#cartDrawer').classList.remove('open');$('#cartDrawer').setAttribute('aria-hidden','true'); if(!$$('.modal-wrap.open').length)document.body.style.overflow=''; }
  function openModal(id) { closeCart();const el=$('#'+id);if(!el)return;el.classList.add('open');document.body.style.overflow='hidden';setTimeout(()=>{const f=$('input:not([type=hidden]),button',el);if(f)f.focus({preventScroll:true});},80); }
  function closeModal(id) { const el=$('#'+id);if(el)el.classList.remove('open');if(!$$('.modal-wrap.open').length&&!$('#cartDrawer').classList.contains('open'))document.body.style.overflow=''; }
  function closeAll() { closeCart();$$('.modal-wrap').forEach(m=>m.classList.remove('open'));document.body.style.overflow=''; }
  function openCheckout() {
    if(!state.cart.length){toast('Giỏ hàng trống','Thêm sản phẩm trước khi đặt hàng.','error');return;}
    if(apiMode() && !state.currentUser) { toast('Cần đăng nhập','Tạo tài khoản hoặc đăng nhập trước khi đặt hàng.','error'); setAuthMode('login'); openModal('authModal'); return; }
    const items=getCartItems();$('#checkoutSummary').innerHTML=items.map(r=>`<div class="summary-line"><span>${escapeHTML(r.product.name)} × ${r.qty}</span><strong>${money(r.product.price*r.qty)}</strong></div>`).join('')+`<div class="summary-line"><span>Tạm tính</span><strong>${money(subtotal())}</strong></div>${state.coupon?`<div class="summary-line"><span>${apiMode()?'Mã giảm giá':'Ưu đãi demo'}</span><strong>−${money(discountAmount())}</strong></div>`:''}<div class="summary-line total"><span>Tổng thanh toán</span><strong>${money(total())}</strong></div>`;
    const user=state.currentUser;if(user){$('#checkoutName').value=user.name||'';$('#checkoutEmail').value=user.email||'';}
    openModal('checkoutModal');
  }
  function getPaymentMethod() { return 'bank_transfer'; }
  async function createOrderFromForm(e) {
    e.preventDefault();
    const rows=getCartItems(); if(!rows.length){toast('Giỏ hàng trống','Hãy thêm sản phẩm trước.','error');return;}
    const name=$('#checkoutName').value.trim(),email=$('#checkoutEmail').value.trim().toLowerCase();
    if(!name||!email){toast('Thiếu thông tin','Vui lòng kiểm tra tên và email.','error');return;}
    const catalog=products();
    for(const row of rows){const p=catalog.find(x=>x.id===row.id);if(!p||p.stock<row.qty){toast('Tồn kho đã thay đổi',`Kiểm tra lại ${p?.name||'sản phẩm'} trước khi tạo đơn.`,'error');return;}}
    const submit=$('#checkoutForm').querySelector('button[type="submit"]');
    if(submit) {submit.disabled=true;submit.dataset.originalText=submit.textContent;submit.textContent='Đang tạo đơn…';}
    try {
      let order;
      let payment=null;
      if(apiMode()) {
        if(!state.currentUser) throw new Error('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.');
        const created=await apiRequest('/api/orders',{method:'POST',body:JSON.stringify({items:rows.map(r=>({productId:r.id,quantity:r.qty})),couponCode:state.coupon?($('#couponInput').value.trim().toUpperCase()||CONFIG.COUPON_DEMO):'',note:$('#checkoutNote').value.trim()})});
        order=created.order;
        try { const pay=await apiRequest('/api/payments/create',{method:'POST',body:JSON.stringify({orderId:order.id,provider:'bank_transfer'})}); payment=pay.payment; }
        catch(payError) { toast('Đơn đã tạo, chưa có thông tin thanh toán',payError.message,'error'); }
      } else {
        order={id:makeId(),createdAt:new Date().toISOString(),customer:{name,email},items:rows.map(r=>({id:r.id,name:r.product.name,category:r.product.category,price:r.product.price,qty:r.qty,icon:r.product.icon})),subtotal:subtotal(),discount:discountAmount(),total:total(),status:'pending',paymentMethod:getPaymentMethod(),note:$('#checkoutNote').value.trim(),demo:true};
        const list=orders();list.unshift(order);saveOrders(list);
      }
      closeModal('checkoutModal');state.selectedOrderId=order.id;
      const instructions=$('#bankInstructions');instructions.classList.remove('hidden');
      if(apiMode()) {
        const i=payment?.instructions;
        if(i?.configured) instructions.innerHTML=`<h3>Thông tin chuyển khoản</h3><p>Ngân hàng: <strong>${escapeHTML(i.provider)}</strong></p><p>Tên người nhận: <strong>${escapeHTML(i.accountName)}</strong></p><p>Số tài khoản: <strong>${escapeHTML(i.accountNumber)}</strong> <button type="button" class="copy-ref" data-copy="${escapeHTML(i.accountNumber)}">Sao chép</button></p><p>Số tiền: <strong>${money(i.amount)}</strong></p><p>Nội dung chuyển khoản:</p><p class="bank-ref">${escapeHTML(i.transferContent)} <button type="button" class="copy-ref" data-copy="${escapeHTML(i.transferContent)}">Sao chép</button></p><p>Hạn thanh toán: <strong>${escapeHTML(shortDate(order.expiresAt))}</strong> (30 phút từ lúc tạo đơn).</p><p>Đơn chỉ chuyển sang đã thanh toán khi backend xác minh webhook có chữ ký hợp lệ.</p><p>Nếu đã chuyển tiền sau hạn hoặc đơn đã bị hủy, hãy liên hệ quản trị viên để đối soát thủ công; không chuyển thêm tiền.</p>`;
        else instructions.innerHTML=`<h3>Chưa cấu hình tài khoản nhận tiền</h3><p>${escapeHTML(i?.message||'Đơn đã được tạo nhưng chưa có thông tin thanh toán.')}</p><p>Đừng chuyển tiền cho đến khi cửa hàng hiển thị tài khoản chính thức.</p>`;
      } else {
        instructions.innerHTML=`<h3>Thông tin chuyển khoản mẫu</h3><p>Ngân hàng: <strong>CHƯA CẤU HÌNH</strong></p><p>Tên người nhận: <strong>nminhios shop (DEMO)</strong></p><p>Số tài khoản: <strong>0000 0000 0000</strong> <button type="button" class="copy-ref" data-copy="0000000000">Sao chép</button></p><p>Số tiền: <strong>${money(order.total)}</strong></p><p>Nội dung chuyển khoản:</p><p class="bank-ref">${escapeHTML(order.id)} <button type="button" class="copy-ref" data-copy="${escapeHTML(order.id)}">Sao chép</button></p><p>Đây là dữ liệu giả lập. Đừng chuyển tiền thật vào thông tin mẫu này.</p>`;
      }
      $('#successOrderDetails').innerHTML=`<div class="success-details"><div class="summary-line"><span>Mã đơn hàng</span><strong>${escapeHTML(order.id)}</strong></div><div class="summary-line"><span>Thời gian</span><strong>${shortDate(order.createdAt)}</strong></div><div class="summary-line"><span>Sản phẩm</span><strong>${order.items.length} mặt hàng</strong></div><div class="summary-line"><span>Trạng thái</span><strong><span class="status-pill ${statusClass(order.status)}">${statusText(order.status)}</span></strong></div><div class="summary-line total"><span>Tổng cộng</span><strong>${money(order.total)}</strong></div></div>`;
      state.cart=[];state.coupon=false;storeCart();
      renderCart();renderHome();renderShop();updateStats();renderOrders();openModal('orderSuccessModal');
      // The server has already created the order. A refresh failure must never tell
      // the customer that the order failed, which could encourage duplicate orders.
      if(apiMode()) {
        try { await loadServerCatalog(false); await loadServerOrders(); if(state.currentUser?.role==='admin') await refreshAdminData(); }
        catch(refreshError) { toast('Đơn đã được tạo',`Không tải mới được dữ liệu: ${refreshError.message}. Mã đơn của bạn vẫn là ${order.id}.`,'error'); }
      }
    } catch(err) { toast('Không thể tạo đơn',err.message||'Vui lòng thử lại.','error'); }
    finally { if(submit) {submit.disabled=false;submit.textContent=submit.dataset.originalText||'Tạo đơn hàng →';} }
  }
  function statusText(status) {return ({pending:'Chờ thanh toán',paid:'Đã thanh toán',delivered:'Đã giao',cancelled:'Đã hủy'})[status]||'Chờ xử lý';}
  function statusClass(status) {return ({pending:'status-pending',paid:'status-paid',delivered:'status-delivered',cancelled:'status-cancelled'})[status]||'status-pending';}
  function orderTableRow(order) {
    const names=order.items.map(i=>`${i.name} ×${i.qty}`).join(', ');
    return `<tr><td><span class="order-code">${escapeHTML(order.id)}</span></td><td class="order-item-cell"><strong>${escapeHTML(order.items[0]?.name||'Sản phẩm')}</strong><small>${order.items.length>1?`và ${order.items.length-1} mặt hàng khác`:escapeHTML(order.items[0]?.category||'')}</small></td><td>${shortDate(order.createdAt)}</td><td><strong>${money(order.total)}</strong></td><td><span class="status-pill ${statusClass(order.status)}">${statusText(order.status)}</span></td><td><button class="mini-action" data-track="${escapeHTML(order.id)}">Chi tiết</button></td></tr>`;
  }
  function visibleOrders() {
    const all=orders();const email=state.currentUser?.email?.toLowerCase();return email?all.filter(o=>o.customer?.email?.toLowerCase()===email):all;
  }
  function updateStats() {
    const list=visibleOrders();$('#statOrders').textContent=list.length;$('#statPending').textContent=list.filter(o=>o.status==='pending').length;$('#statPaid').textContent=list.filter(o=>o.status==='paid'||o.status==='delivered').length;$('#statSpent').textContent=money(list.filter(o=>o.status==='paid'||o.status==='delivered').reduce((s,o)=>s+o.total,0));
  }
  function renderOrders() {
    const list=visibleOrders();updateStats();
    $('#ordersTableWrap').innerHTML=list.length?`<table class="orders-table"><thead><tr><th>Mã đơn</th><th>Sản phẩm</th><th>Thời gian</th><th>Tổng tiền</th><th>Trạng thái</th><th></th></tr></thead><tbody>${list.map(orderTableRow).join('')}</tbody></table>`:`<div class="empty-table"><div class="empty-bag">▤</div><strong>Chưa có đơn hàng nào</strong><p>Đơn hàng của bạn sẽ xuất hiện tại đây sau khi đặt.</p><button class="btn btn-ghost btn-small" data-view="shop">Đi đến cửa hàng</button></div>`;
  }
  function showOrder(order) {
    if(!order){$('#trackResult').classList.remove('hidden');$('#trackResult').innerHTML=`<p>${apiMode()?'Không tìm thấy đơn hoặc bạn không có quyền xem đơn này.':'Không tìm thấy mã đơn này trên trình duyệt hiện tại.'}</p>`;return;}
    $('#trackResult').classList.remove('hidden');$('#trackResult').innerHTML=`<h3>Đơn ${escapeHTML(order.id)} <span class="status-pill ${statusClass(order.status)}">${statusText(order.status)}</span></h3><p><strong>Ngày tạo:</strong> ${shortDate(order.createdAt)}</p><p><strong>Người nhận:</strong> ${escapeHTML(order.customer?.name||'—')}</p><p><strong>Sản phẩm:</strong> ${escapeHTML((order.items||[]).map(i=>`${i.name} ×${i.qty}`).join(', '))}</p><p><strong>Tổng tiền:</strong> ${money(order.total)}</p><p><strong>Thanh toán:</strong> ${order.paymentMethod==='bank_transfer'?'Chuyển khoản ngân hàng':'Cổng thanh toán'} ${order.demo?'· Bản demo':''}</p>${apiMode()&&['paid','delivered'].includes(order.status)?`<button class="btn btn-ghost btn-small" data-delivery="${escapeHTML(order.id)}">Xem sản phẩm số đã cấp</button><div id="deliveryResult" class="delivery-result hidden"></div>`:''}`;
  }
  function renderAdmin() {
    $('#apiBaseUrl').value=currentApiBase() || (apiMode()?window.location.origin:'');
    if(apiMode()) { refreshAdminData(); return; }
    renderAdminProducts(); renderAdminOrders();
  }
  async function refreshAdminData() {
    if(!apiMode()) { renderAdminProducts();renderAdminOrders();return; }
    if(state.currentUser?.role!=='admin') {
      $('#adminProductsList').innerHTML='<div class="empty-table">Đăng nhập bằng tài khoản quản trị để xem dữ liệu này.</div>';
      $('#adminOrdersList').innerHTML='<div class="empty-table">Khu quản trị được bảo vệ ở máy chủ.</div>';
      const copy=$('#admin-warning-copy');if(copy)copy.textContent='Quyền quản trị được kiểm tra ở backend. Đăng nhập bằng email quản trị đã cấu hình khi cài đặt máy chủ.';
      $('#productForm').classList.add('hidden');
      return;
    }
    try {
      const [p,o]=await Promise.all([apiRequest('/api/admin/products'),apiRequest('/api/admin/orders')]);
      state.remoteProducts=Array.isArray(p.items)?p.items:[];
      state.remoteAdminOrders=Array.isArray(o.items)?o.items:[];
      renderAdminProducts();renderAdminOrders();renderHome();renderShop();await loadInventoryStats();
    } catch(err) { toast('Không tải được dữ liệu quản trị',err.message,'error'); }
  }
  function renderAdminProducts() {
    const list=products();$('#adminProductsList').innerHTML=list.length?list.map(p=>`<div class="admin-product-row"><div class="admin-product-icon">${escapeHTML(p.icon||'✦')}</div><div class="admin-product-name"><strong>${escapeHTML(p.name)}</strong><small>${escapeHTML(p.category)} · Có thể bán: ${Number(p.stock)||0}${p.active===false?' · Đã ẩn':''}</small></div><div class="admin-product-price">${money(p.price)}</div><div class="admin-row-actions"><button class="mini-action" data-edit-product="${escapeHTML(p.id)}">Sửa</button><button class="mini-action danger" data-delete-product="${escapeHTML(p.id)}">${p.active===false?'Đã ẩn':'Ngừng bán'}</button></div></div>`).join(''):'<div class="empty-table">Chưa có sản phẩm.</div>';
  }
  function renderAdminOrders() {
    const list=apiMode()?state.remoteAdminOrders:orders();
    $('#adminOrdersList').innerHTML=list.length?list.map(o=>apiMode()?`<div class="admin-order-row"><div class="admin-order-info"><strong>${escapeHTML(o.id)} · ${escapeHTML(o.customer?.name||'Khách hàng')}</strong><small>${escapeHTML(o.customer?.email||'')} · ${shortDate(o.createdAt)}</small></div><div class="admin-order-actions"><span class="admin-order-total">${money(o.total)}</span><span class="status-pill ${statusClass(o.status)}">${statusText(o.status)}</span>${o.status==='pending'?`<button class="mini-action danger" data-admin-cancel="${escapeHTML(o.id)}">Hủy đơn</button>`:''}${o.status==='paid'?`<button class="mini-action" data-admin-fulfill="${escapeHTML(o.id)}">Xác nhận bàn giao</button>`:''}</div></div>`:`<div class="admin-order-row"><div class="admin-order-info"><strong>${escapeHTML(o.id)} · ${escapeHTML(o.customer?.name||'Khách hàng')}</strong><small>${escapeHTML(o.customer?.email||'')} · ${shortDate(o.createdAt)} · DEMO</small></div><div class="admin-order-actions"><span class="admin-order-total">${money(o.total)}</span><span class="status-pill ${statusClass(o.status)}">${statusText(o.status)}</span><select aria-label="Thay đổi trạng thái demo" data-order-status="${escapeHTML(o.id)}"><option value="pending" ${o.status==='pending'?'selected':''}>Chờ thanh toán</option><option value="paid" ${o.status==='paid'?'selected':''}>Đã thanh toán (demo)</option><option value="delivered" ${o.status==='delivered'?'selected':''}>Đã giao (demo)</option><option value="cancelled" ${o.status==='cancelled'?'selected':''}>Đã hủy</option></select></div></div>`).join(''):'<div class="empty-table">Chưa có đơn hàng.</div>';
  }
  function openProductEditor(product=null) {
    if(apiMode() && state.currentUser?.role!=='admin') { toast('Không có quyền','Chỉ tài khoản quản trị mới sửa được sản phẩm.','error');return; }
    state.editingProductId=product?.id||null;$('#productFormTitle').textContent=product?'Chỉnh sửa sản phẩm':'Thêm sản phẩm';$('#editProductId').value=product?.id||'';$('#pName').value=product?.name||'';$('#pCategory').value=product?.category||'Menu Key';$('#pPrice').value=product?.price??'';$('#pStock').value=product?.storedStock??product?.stock??99;$('#pIcon').value=product?.icon||'✦';$('#pBadge').value=product?.badge||'';$('#pDescription').value=product?.description||'';if($('#pDeliveryMode'))$('#pDeliveryMode').value=product?.deliveryMode||'manual';if($('#pActive'))$('#pActive').value=product?.active===false?'false':'true';$('#productForm').classList.remove('hidden');$('#productForm').scrollIntoView({behavior:'smooth',block:'nearest'});$('#pName').focus({preventScroll:true});
  }
  async function saveProductFromForm(e) {
    e.preventDefault();const name=$('#pName').value.trim(),price=Number($('#pPrice').value),stock=Math.max(0,Number($('#pStock').value)||0);if(!name||!Number.isFinite(price)||price<0){toast('Kiểm tra dữ liệu','Tên sản phẩm và giá phải hợp lệ.','error');return;}
    const id=state.editingProductId||`custom-${Date.now().toString(36)}`;const existing=products().find(p=>p.id===id);const item={id,name,category:$('#pCategory').value,price:Math.round(price),stock,icon:$('#pIcon').value.trim()||'✦',badge:$('#pBadge').value.trim()||'DIGITAL',description:$('#pDescription').value.trim(),featured:existing?.featured??(products().length+1),theme:existing?.theme||(['Acc Clone'].includes($('#pCategory').value)?'orange':$('#pCategory').value==='Acc Game'?'violet':$('#pCategory').value==='Dịch vụ số'?'green':'blue'),deliveryMode:$('#pDeliveryMode')?.value||'manual',active:$('#pActive')?$('#pActive').value==='true':existing?.active!==false};
    if(apiMode()) {
      try { const route=state.editingProductId?`/api/admin/products/${encodeURIComponent(id)}`:'/api/admin/products'; await apiRequest(route,{method:state.editingProductId?'PUT':'POST',body:JSON.stringify(item)}); $('#productForm').classList.add('hidden');await refreshAdminData();toast(state.editingProductId?'Đã cập nhật sản phẩm':'Đã thêm sản phẩm',name); }
      catch(err) { toast('Không lưu được sản phẩm',err.message,'error'); }
      return;
    }
    const list=products(),index=list.findIndex(p=>p.id===id);if(index>=0)list[index]=item;else list.push(item);saveProducts(list);$('#productForm').classList.add('hidden');renderAdminProducts();renderHome();renderShop();toast(existing?'Đã cập nhật sản phẩm':'Đã thêm sản phẩm',name);
  }
  function setAuthMode(mode) {state.authMode=mode;$$('[data-auth-mode]').forEach(b=>b.classList.toggle('active',b.dataset.authMode===mode));$('#authTitle').textContent=mode==='register'?'Tạo tài khoản mới':'Chào mừng trở lại';$('#authDesc').textContent=mode==='register'?(apiMode()?'Tạo tài khoản được lưu trên máy chủ với mật khẩu đã băm.':'Tạo hồ sơ demo để gắn các đơn hàng với email của bạn.'):'Đăng nhập để xem lịch sử đơn hàng của bạn.';$('#authName').parentElement.classList.toggle('hidden',mode!=='register');$('#authName').required=mode==='register';$('#authPassword').autocomplete=mode==='register'?'new-password':'current-password';$('#authPassword').minLength=apiMode()?10:8;$('#authSubmit').innerHTML=mode==='register'?'Tạo tài khoản <span>→</span>':'Đăng nhập <span>→</span>';$('#authForm').reset();$('#rememberMe').checked=true;}
  function updateProfileUI() {const u=state.currentUser;$('#profileName').textContent=u?(u.name||'Thành viên'):'Tài khoản';$('#profileSub').textContent=u?(apiMode()?(u.role==='admin'?'Quản trị viên':'Tài khoản đã xác thực'):'Tài khoản demo'):'Đăng nhập';$('#avatarInitial').textContent=u?(u.name||u.email||'N').trim().charAt(0).toUpperCase():'N';}
  function restoreSession() {if(apiMode())return;const sess=readJSON(STORAGE.session,null);if(sess?.email){state.currentUser=sess;}}
  async function authSubmit(e) {
    e.preventDefault();const email=$('#authEmail').value.trim().toLowerCase(),password=$('#authPassword').value,name=$('#authName').value.trim();if(!email||password.length<(apiMode()?10:8)){toast('Thông tin chưa hợp lệ',`Email hợp lệ và mật khẩu tối thiểu ${apiMode()?10:8} ký tự.`,'error');return;}
    if(apiMode()) {
      try {
        const path=state.authMode==='register'?'/api/auth/register':'/api/auth/login';
        const payload=await apiRequest(path,{method:'POST',body:JSON.stringify({name,email,password,rememberMe:$('#rememberMe').checked})});
        state.currentUser=payload.user||null;
        await loadServerOrders();updateProfileUI();closeModal('authModal');
        if(state.view==='admin') await refreshAdminData();
        toast(state.authMode==='register'?'Tạo tài khoản thành công':'Đăng nhập thành công',`Xin chào ${state.currentUser?.name||email}. Phiên đăng nhập được quản lý bởi máy chủ.`);
      } catch(err) { toast('Không thể xác thực',err.message,'error'); }
      return;
    }
    let list=profiles();let user=list.find(x=>x.email===email);
    if(state.authMode==='register'){
      if(!name){toast('Thiếu tên hiển thị','Nhập tên để tạo hồ sơ.','error');return;}if(user){toast('Email đã có hồ sơ','Hãy dùng email khác hoặc chuyển sang đăng nhập.','error');return;}
      user={id:makeId('USER'),name,email,createdAt:new Date().toISOString()};list.push(user);saveProfiles(list);toast('Tạo hồ sơ demo thành công','Chưa tạo tài khoản xác thực trên máy chủ.');
    } else if(!user) {toast('Chưa có hồ sơ demo','Chuyển sang Tạo tài khoản để tạo hồ sơ thử nghiệm.','error');return;}
    state.currentUser={id:user.id,name:user.name,email:user.email,demo:true};
    if($('#rememberMe').checked)writeJSON(STORAGE.session,state.currentUser);else {try{localStorage.removeItem(STORAGE.session);}catch(_){}}
    updateProfileUI();closeModal('authModal');if(state.view==='orders')renderOrders();toast('Đã vào phiên demo',`Xin chào ${user.name}.`);
  }
  async function logout() {
    if(apiMode()) { try { await apiRequest('/api/auth/logout',{method:'POST',body:'{}'}); } catch(err) { toast('Đăng xuất chưa hoàn tất',err.message,'error');return; } }
    state.currentUser=null;state.remoteOrders=[];try{localStorage.removeItem(STORAGE.session);}catch(_){}updateProfileUI();renderOrders();if(state.view==='admin')renderAdmin();toast('Đã đăng xuất','Phiên đăng nhập đã được xóa.');
  }
  async function testApi() {
    const base=$('#apiBaseUrl').value.trim().replace(/\/+$/,'') || (apiMode()?window.location.origin:'');
    if(!base){$('#apiStatus').textContent='Chưa cấu hình';$('#apiStatus').classList.remove('connected');toast('Chưa có API URL','Nhập URL backend của bạn trước.','error');return;}
    $('#apiStatus').textContent='Đang kiểm tra…';$('#apiStatus').classList.remove('connected');
    try {const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),Number(CONFIG.REQUEST_TIMEOUT_MS)||9000);try{const r=await fetch(`${base}/health`,{method:'GET',headers:{'Accept':'application/json'},signal:ctrl.signal,cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);$('#apiStatus').textContent='Đã kết nối';$('#apiStatus').classList.add('connected');toast('Kết nối thành công','GET /health phản hồi thành công.');}finally{clearTimeout(timer);}}
    catch(e){$('#apiStatus').textContent='Không kết nối';$('#apiStatus').classList.remove('connected');toast('Không thể kết nối API',e.name==='AbortError'?'Máy chủ phản hồi quá chậm.':e.message,'error');}
  }
  function bindEvents() {
    document.addEventListener('click',e=>{
      const view=e.target.closest('[data-view]');if(view){e.preventDefault();goView(view.dataset.view);closeCart();return;}
      const cat=e.target.closest('[data-category]');if(cat){setCategory(cat.dataset.category);return;}
      const add=e.target.closest('[data-add]');if(add){addToCart(add.dataset.add);return;}
      const qty=e.target.closest('[data-qty]');if(qty){changeQty(qty.dataset.qty,Number(qty.dataset.delta));return;}
      const rem=e.target.closest('[data-remove]');if(rem){removeFromCart(rem.dataset.remove);return;}
      const close=e.target.closest('[data-close-modal]');if(close){closeModal(close.dataset.closeModal);return;}
      const track=e.target.closest('[data-track]');if(track){const code=track.dataset.track;$('#trackCode').value=code;goView('track');if(apiMode())apiRequest(`/api/orders/${encodeURIComponent(code)}`).then(x=>showOrder(x.order)).catch(err=>showOrder(null));else showOrder(orders().find(x=>x.id===code));return;}
      const edit=e.target.closest('[data-edit-product]');if(edit){openProductEditor(products().find(p=>p.id===edit.dataset.editProduct));return;}
      const del=e.target.closest('[data-delete-product]');if(del){const p=products().find(x=>x.id===del.dataset.deleteProduct);if(!p)return;if(!window.confirm(`${apiMode()?'Ngừng bán':'Xóa'} sản phẩm “${p.name}”?`))return;if(apiMode()){apiRequest(`/api/admin/products/${encodeURIComponent(p.id)}`,{method:'DELETE'}).then(()=>refreshAdminData()).then(()=>toast('Đã ngừng bán',p.name)).catch(err=>toast('Không thể cập nhật',err.message,'error'));return;}saveProducts(products().filter(x=>x.id!==p.id));state.cart=state.cart.filter(x=>x.id!==p.id);storeCart();renderAdminProducts();renderHome();renderShop();renderCart();toast('Đã xóa sản phẩm',p.name);return;}
      const copy=e.target.closest('[data-copy]');if(copy){const text=copy.dataset.copy;if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).then(()=>toast('Đã sao chép',text)).catch(()=>toast('Không sao chép được','Hãy sao chép thủ công.','error'));else toast('Hãy sao chép thủ công',text);return;}
      const cancel=e.target.closest('[data-admin-cancel]');if(cancel){if(!confirm(`Hủy đơn ${cancel.dataset.adminCancel}?`))return;apiRequest(`/api/admin/orders/${encodeURIComponent(cancel.dataset.adminCancel)}`,{method:'PATCH',body:JSON.stringify({status:'cancelled'})}).then(()=>refreshAdminData()).then(()=>toast('Đã hủy đơn',cancel.dataset.adminCancel)).catch(err=>toast('Không thể hủy đơn',err.message,'error'));return;}
      const fulfill=e.target.closest('[data-admin-fulfill]');if(fulfill){if(!confirm(`Xác nhận đã bàn giao đơn ${fulfill.dataset.adminFulfill}? Chỉ xác nhận nếu giao hàng thực tế đã hoàn tất.`))return;apiRequest(`/api/admin/orders/${encodeURIComponent(fulfill.dataset.adminFulfill)}/fulfill`,{method:'POST',body:'{}'}).then(()=>refreshAdminData()).then(()=>toast('Đã cập nhật bàn giao',fulfill.dataset.adminFulfill)).catch(err=>toast('Không thể bàn giao',err.message,'error'));return;}
      const delivery=e.target.closest('[data-delivery]');if(delivery){apiRequest(`/api/orders/${encodeURIComponent(delivery.dataset.delivery)}/delivery`).then(data=>{const wrap=$('#deliveryResult');if(!wrap)return;wrap.classList.remove('hidden');wrap.innerHTML=(data.items||[]).length?`<h4>Sản phẩm số đã cấp</h4>`+(data.items||[]).map(x=>`<div class="delivery-item"><strong>${escapeHTML(x.productName)}</strong><code>${escapeHTML(x.value)}</code><button class="copy-ref" data-copy="${escapeHTML(x.value)}">Sao chép</button></div>`).join(''):`<p>Chưa có sản phẩm tự động được cấp. Trạng thái kho: ${escapeHTML(data.fulfillmentStatus||'pending')}.</p>`;}).catch(err=>toast('Chưa thể xem sản phẩm',err.message,'error'));return;}
    });
    $('#mobileMenu').addEventListener('click',()=>$('#sidebar').classList.toggle('mobile-open'));
    $('#noticeButton').addEventListener('click',()=>toast('Thông báo',apiMode()?'Bạn sẽ thấy các cập nhật đơn hàng tại mục Đơn hàng của tôi. Tích hợp email/push cần nhà cung cấp riêng.':'Đây là bản demo. Tích hợp thông báo đơn hàng sau khi kết nối backend.'));
    $('#openCart').addEventListener('click',openCart);$('#closeCart').addEventListener('click',closeCart);$('#overlay').addEventListener('click',closeCart);
    $('#startCheckout').addEventListener('click',openCheckout);$('#checkoutForm').addEventListener('submit',createOrderFromForm);
    $('#applyCoupon').addEventListener('click',()=>{const code=$('#couponInput').value.trim().toUpperCase();if(code===String(CONFIG.COUPON_DEMO||'NMINH10').toUpperCase()){state.coupon=true;renderCart();toast('Đã áp dụng mã',apiMode()?'Mã sẽ được máy chủ kiểm tra lại khi tạo đơn.':'Giảm 10% tạm tính trong bản thử nghiệm.');}else{state.coupon=false;renderCart();$('#couponNote').textContent='Mã không hợp lệ trong bản demo.';$('#couponNote').style.color='var(--danger)';toast('Mã giảm giá không đúng','Thử mã NMINH10 trong bản demo.','error');}});
    $('#globalSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){state.shopSearch=e.target.value;state.category='Tất cả';goView('shop');renderShop();}});
    $('#shopSearch').addEventListener('input',e=>{state.shopSearch=e.target.value;renderShop();});$('#shopSort').addEventListener('change',e=>{state.shopSort=e.target.value;renderShop();});$('#homeSort').addEventListener('change',e=>{state.homeSort=e.target.value;renderHome();});
    $$('#shopChips .chip').forEach(b=>b.addEventListener('click',()=>setCategory(b.dataset.filter)));
    $('#resetShop').addEventListener('click',()=>{state.category='Tất cả';state.shopSearch='';state.shopSort='featured';renderShop();});
    $('#refreshOrders').addEventListener('click',async()=>{if(apiMode()){try{await loadServerOrders();toast('Đã làm mới','Đơn hàng được tải từ máy chủ.');}catch(err){toast('Không tải được đơn',err.message,'error');}}else{renderOrders();toast('Đã làm mới','Đơn demo đã được tải lại từ trình duyệt.');}});
    $('#trackForm').addEventListener('submit',async e=>{e.preventDefault();const id=$('#trackCode').value.trim().toUpperCase();if(apiMode()){try{const result=await apiRequest(`/api/orders/${encodeURIComponent(id)}`);showOrder(result.order);return;}catch(err){showOrder(null);toast('Không tìm thấy đơn',err.message,'error');return;}}const order=orders().find(o=>o.id.toUpperCase()===id);showOrder(order);if(!order)toast('Không tìm thấy đơn','Kiểm tra lại mã đơn và trình duyệt đã tạo đơn.','error');});
    $('#openAuth').addEventListener('click',()=>{if(state.currentUser){if(confirm(`Bạn muốn đăng xuất khỏi ${apiMode()?'tài khoản':'phiên demo'}?`))logout();}else{setAuthMode('login');openModal('authModal');}});
    $$('[data-auth-mode]').forEach(b=>b.addEventListener('click',()=>setAuthMode(b.dataset.authMode)));$('#authForm').addEventListener('submit',authSubmit);
    $('#viewNewOrder').addEventListener('click',()=>{closeModal('orderSuccessModal');goView('orders');});
    $('#openTerms').addEventListener('click',()=>openModal('termsModal'));
    $('#addProductBtn').addEventListener('click',()=>openProductEditor());$('#closeProductForm').addEventListener('click',()=>$('#productForm').classList.add('hidden'));$('#cancelProductForm').addEventListener('click',()=>$('#productForm').classList.add('hidden'));$('#productForm').addEventListener('submit',saveProductFromForm);
    $$('.admin-tab').forEach(b=>b.addEventListener('click',()=>{$$('.admin-tab').forEach(x=>x.classList.toggle('active',x===b));$$('.admin-pane').forEach(x=>x.classList.toggle('active',x.id===`admin-${b.dataset.adminTab}`));}));
    $('#exportOrders').addEventListener('click',()=>{const list=apiMode()?state.remoteAdminOrders:orders();const blob=new Blob([JSON.stringify(list,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=apiMode()?'nminhios-orders.json':'nminhios-demo-orders.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Đã xuất dữ liệu',`Đã xuất ${list.length} đơn hàng.`);});
    $('#apiSettingsForm').addEventListener('submit',e=>{e.preventDefault();const url=$('#apiBaseUrl').value.trim().replace(/\/+$/,'');if(url&&!/^https?:\/\//i.test(url)){toast('URL chưa hợp lệ','Dùng URL bắt đầu bằng https:// hoặc http:// khi chạy local.','error');return;}writeJSON(STORAGE.api,url);$('#apiStatus').textContent=(url||apiMode())?'Chưa kiểm tra':'Chưa cấu hình';$('#apiStatus').classList.remove('connected');toast('Đã lưu URL API',apiMode()?'Dùng URL same-origin khi để trống. Không đặt secret trong trình duyệt.':'Chỉ lưu URL công khai; chưa bật giao dịch thật.');});$('#testApiBtn').addEventListener('click',testApi);
    $('#adminOrdersList').addEventListener('change',e=>{const sel=e.target.closest('[data-order-status]');if(!sel)return;const list=orders(),order=list.find(o=>o.id===sel.dataset.orderStatus);if(!order)return;order.status=sel.value;order.updatedAt=new Date().toISOString();saveOrders(list);renderAdminOrders();renderOrders();const trackId=$('#trackCode').value.trim().toUpperCase();if(trackId===order.id)showOrder(order);toast('Đã cập nhật trạng thái demo',`${order.id}: ${statusText(order.status)}.`);});
    const refreshInventory=$('#refreshInventoryBtn');if(refreshInventory)refreshInventory.addEventListener('click',()=>loadInventoryStats());
    const inventoryForm=$('#inventoryImportForm');if(inventoryForm) inventoryForm.addEventListener('submit',async e=>{e.preventDefault();if(!apiMode()){toast('Chỉ dùng ở server mode','Nhập kho tự động cần backend.','error');return;}const productId=$('#inventoryProductId').value;const items=$('#inventoryLines').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(!productId||!items.length){toast('Thiếu dữ liệu','Chọn sản phẩm và nhập ít nhất một dòng.','error');return;}const btn=inventoryForm.querySelector('button[type=submit]');if(btn)btn.disabled=true;try{const result=await apiRequest('/api/admin/inventory',{method:'POST',body:JSON.stringify({productId,items})});$('#inventoryLines').value='';await refreshAdminData();toast('Đã nhập kho',`Đã mã hóa và nhập ${result.imported} dòng hàng.`);}catch(err){toast('Không nhập được kho',err.message,'error');}finally{if(btn)btn.disabled=false;}});
    document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#globalSearch').focus();}if(e.key==='Escape'){closeAll();$('#sidebar').classList.remove('mobile-open');}});
    $$('.payment-option input').forEach(input=>input.addEventListener('change',()=>{$$('.payment-option').forEach(label=>label.classList.toggle('selected', $('input',label).checked));}));
    $$('.modal-wrap').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModal(m.id);}));
  }
  function applyModeCopy() {
    if(!apiMode()) return;
    const adminNav=$$('.nav-item[data-view="admin"]')[0]; if(adminNav) adminNav.innerHTML='<span class="nav-icon">⚙</span><span>Quản trị cửa hàng</span>';
    const demoBadge=$$('.demo-badge')[0]; if(demoBadge) demoBadge.textContent='SERVER MODE';
    const warning=$$('.admin-warning')[0]; if(warning) warning.innerHTML='<strong>🔒 Quyền quản trị phía máy chủ</strong><p id="admin-warning-copy">Chỉ tài khoản có role admin mới được sửa sản phẩm, xem đơn và quản lý kho.</p>';
    const checkoutNote=$$('.secure-note')[0]; if(checkoutNote) checkoutNote.textContent='◇ Thanh toán chỉ xác nhận sau webhook hợp lệ';
    const bankCopy=$('#bank-payment-copy'); if(bankCopy) bankCopy.textContent='Thông tin thanh toán do backend cung cấp sau khi tạo đơn.';
    const accountHint=$('#checkout-account-hint'); if(accountHint) accountHint.textContent='Tên và email nhận đơn được lấy từ tài khoản đang đăng nhập.';
    const trackHint=$('#track-help-copy'); if(trackHint) trackHint.textContent='Đăng nhập bằng đúng tài khoản đã đặt đơn để xem trạng thái và sản phẩm đã cấp.';
    const successCopy=$('#success-message-copy'); if(successCopy) successCopy.textContent='Đơn đã được tạo trên hệ thống. Chỉ chuyển khoản theo thông tin chính thức hiển thị từ cửa hàng.';
    const checkoutName=$('#checkoutName'); if(checkoutName) checkoutName.readOnly=true;
    const checkoutEmail=$('#checkoutEmail'); if(checkoutEmail) checkoutEmail.readOnly=true;
    const authNote=$$('.auth-demo-note')[0]; if(authNote) authNote.textContent='Tài khoản được xác thực trên máy chủ. Mật khẩu được băm; trình duyệt không lưu mật khẩu.';
    const authHint=$$('.auth-switch-hint')[0]; if(authHint) authHint.textContent='Dùng email của bạn và mật khẩu riêng. Không dùng lại mật khẩu ở dịch vụ khác.';
    const helpTexts=$$('.help-card p'); if(helpTexts.length>1) helpTexts[1].textContent='Thanh toán chỉ được xác nhận khi backend kiểm tra webhook đã ký từ nhà cung cấp.';
    const footer=$$('.demo-footer-pill')[0]; if(footer) footer.innerHTML='<span class="status-pulse"></span> Server-connected storefront';
    const paymentLabels=$$('.payment-option'); if(paymentLabels[1]) { paymentLabels[1].classList.add('hidden'); const input=$('input',paymentLabels[1]); if(input) input.disabled=true; }
    const copy=$('#checkoutForm .checkout-disclaimer'); if(copy) copy.textContent='Không gửi mật khẩu tài khoản bên thứ ba trong ghi chú. Chỉ đặt mua sản phẩm bạn có quyền sử dụng.';
    const adminDescription=$('#admin-description'); if(adminDescription) adminDescription.textContent='Quản lý sản phẩm, đơn hàng và kho số với quyền quản trị phía máy chủ.';
    const productsCopy=$('#admin-products-copy'); if(productsCopy) productsCopy.textContent='Thêm hoặc chỉnh sửa sản phẩm được lưu trong cơ sở dữ liệu máy chủ.';
    const editorCopy=$('#product-editor-copy'); if(editorCopy) editorCopy.textContent='Dữ liệu được lưu ở backend; giá và tồn kho được xác minh phía máy chủ.';
    const ordersCopy=$('#admin-orders-copy'); if(ordersCopy) ordersCopy.textContent='Đơn hàng thật trong cơ sở dữ liệu. Thanh toán chỉ xác nhận qua webhook đã ký.';
    const warningCopy=$('#admin-warning-copy'); if(warningCopy) warningCopy.textContent='Chỉ tài khoản có quyền admin ở máy chủ mới có thể thay đổi dữ liệu cửa hàng.';
    const spentLabel=$('#statSpentLabel'); if(spentLabel) spentLabel.textContent='Tổng chi tiêu';
    const historyCopy=$('#orders-history-copy'); if(historyCopy) historyCopy.textContent='Lịch sử đơn của tài khoản được tải từ cơ sở dữ liệu máy chủ.';
    const paymentHelp=$('#help-payment-copy'); if(paymentHelp) paymentHelp.textContent='Chỉ xác nhận sau khi backend nhận webhook hợp lệ từ nhà cung cấp.';
    const securityHelp=$('#help-security-copy'); if(securityHelp) securityHelp.textContent='Phiên đăng nhập được quản lý bởi backend; không lưu mật khẩu thô ở trình duyệt.';
    const systemStatus=$('#systemStatusCopy'); if(systemStatus) systemStatus.textContent='Đang dùng máy chủ cửa hàng';
    const noticeButton=$('#noticeButton'); if(noticeButton) noticeButton.setAttribute('aria-label','Thông báo cửa hàng');
  }
  async function init() {
    const savedCart=readJSON(STORAGE.cart,[]);state.cart=Array.isArray(savedCart)?savedCart.filter(x=>x&&typeof x.id==='string'&&Number.isFinite(x.qty)&&x.qty>0).map(x=>({id:x.id,qty:Math.min(99,Math.floor(x.qty))})):[];
    if(!apiMode() && !readJSON(STORAGE.products,null))saveProducts(seedProducts.map(p=>({...p})));
    restoreSession();applyModeCopy();updateProfileUI();bindEvents();setAuthMode('login');
    renderHome();renderShop();renderCart();renderOrders();
    if(apiMode()) {
      try { await loadServerCatalog(false); await loadServerSession(); state.apiReady=true; }
      catch(err) { state.apiReady=false; toast('Chưa kết nối máy chủ',`${err.message}. Kiểm tra server và thử tải lại trang.`,'error'); }
      renderHome();renderShop();renderCart();renderOrders();
      if(state.view==='admin') await refreshAdminData();
    } else { renderAdmin(); }
  }
  document.addEventListener('DOMContentLoaded',init);
})();
