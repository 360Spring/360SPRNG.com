/* ============================================================
   360SPRNG — shared app logic
   Cart / checkout / PDP logic is adapted from the live store.html
   implementation (same localStorage keys, same /api/orders and
   /api/newsletter contract, same Paystack v2 popup flow) so it
   drops into the existing _worker.js without any backend changes.
   ============================================================ */

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ── Nav dropdown (hamburger) ───────────────────────────── */
function toggleNav() {
  const dd = document.getElementById('navDropdown'), scrim = document.getElementById('navScrim');
  if (!dd) return;
  const isOpen = dd.classList.toggle('open');
  scrim.classList.toggle('open', isOpen);
  document.getElementById('navBtn').setAttribute('aria-expanded', String(isOpen));
}
function closeNav() {
  const dd = document.getElementById('navDropdown'), scrim = document.getElementById('navScrim');
  if (!dd) return;
  dd.classList.remove('open'); scrim.classList.remove('open');
  document.getElementById('navBtn').setAttribute('aria-expanded', 'false');
}

/* ── Category dropdown (store page only) ────────────────── */
function toggleCatDropdown() {
  const dd = document.getElementById('catDropdown'), scrim = document.getElementById('catScrim');
  if (!dd) return;
  const isOpen = dd.classList.toggle('open');
  scrim.classList.toggle('open', isOpen);
}
function closeCatDropdown() {
  const dd = document.getElementById('catDropdown'), scrim = document.getElementById('catScrim');
  if (!dd) return;
  dd.classList.remove('open'); scrim.classList.remove('open');
}
function filterStore(cat, btn) {
  document.querySelectorAll('.cat-dropdown button[data-cat]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('#productGrid .product-card').forEach(c => {
    c.style.display = (cat === 'all' || c.dataset.category === cat) ? '' : 'none';
  });
  const label = document.getElementById('catTriggerLabel');
  if (label) label.textContent = 'category: ' + btn.textContent.trim().toLowerCase();
  closeCatDropdown();
}

/* ── Cart (localStorage: 360_cart) ───────────────────────── */
let cart = JSON.parse(localStorage.getItem('360_cart') || '[]');
function saveCart() { localStorage.setItem('360_cart', JSON.stringify(cart)); }
function cartTotal() { return cart.reduce((s, i) => s + i.price * i.qty, 0); }

function renderCart() {
  const container = document.getElementById('cartItems');
  if (!container) return;
  const empty = document.getElementById('cartEmpty'),
    subtotal = document.getElementById('cartSubtotal'),
    btn = document.getElementById('cartCheckoutBtn'),
    countEls = document.querySelectorAll('.cart-count');
  const totalQty = cart.reduce((s, i) => s + i.qty, 0);
  countEls.forEach(el => { el.dataset.count = totalQty; el.classList.toggle('show', totalQty > 0); });
  subtotal.textContent = 'GH₵ ' + cartTotal();
  btn.disabled = cart.length === 0;
  empty.style.display = cart.length === 0 ? 'flex' : 'none';
  Array.from(container.children).forEach(c => { if (c !== empty) c.remove(); });
  cart.forEach((item, idx) => {
    const row = document.createElement('div'); row.className = 'cart-item';
    row.innerHTML = `<img class="cart-item-img" src="${item.img}" onerror="this.outerHTML='<div class=cart-item-img-ph></div>'" alt="${esc(item.name)}">
      <div><div class="cart-item-name">${esc(item.name)}</div><div class="cart-item-var">${esc(item.variant || '')}</div><div class="cart-item-size">size: ${esc(item.size)}</div>
      <div class="cart-item-qty"><button class="qty-btn" onclick="changeQty(${idx},-1)">−</button><span class="qty-num">${item.qty}</span><button class="qty-btn" onclick="changeQty(${idx},1)">+</button></div>
      <button class="cart-item-remove" onclick="removeFromCart(${idx})">remove</button></div>
      <div class="cart-item-price">GH₵ ${item.price * item.qty}</div>`;
    container.appendChild(row);
  });
}
function changeQty(idx, dir) { cart[idx].qty = Math.max(1, cart[idx].qty + dir); saveCart(); renderCart(); }
function removeFromCart(idx) { cart.splice(idx, 1); saveCart(); renderCart(); }
function openCart() { document.getElementById('cartDrawer').classList.add('open'); document.getElementById('cartScrim').classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeCart() { document.getElementById('cartDrawer').classList.remove('open'); document.getElementById('cartScrim').classList.remove('open'); document.body.style.overflow = ''; }

/* ── PDP (product quick view) — needs window.STORE_CONFIG on store.html ── */
let pdpProductId = null, pdpImgIdx = 0, pdpSelectedSize = null;

function openPdp(productId) {
  const p = window.STORE_CONFIG.products[productId]; if (!p) return;
  pdpProductId = productId; pdpImgIdx = 0; pdpSelectedSize = null;
  document.getElementById('pdpName').textContent = p.name;
  document.getElementById('pdpVar').textContent = p.variant || '';
  document.getElementById('pdpPrice').textContent = 'GH₵ ' + p.price;
  document.getElementById('pdpDesc').textContent = p.description || '';
  const mainImg = document.getElementById('pdpMainImg'), mainPh = document.getElementById('pdpMainPh');
  mainImg.src = p.images[0] || ''; mainImg.alt = p.name + ' 1'; mainImg.style.display = ''; mainPh.style.display = 'none';
  mainImg.onerror = () => { mainImg.style.display = 'none'; mainPh.textContent = p.name; mainPh.style.display = 'flex'; };

  const thumbsWrap = document.getElementById('pdpThumbs'); thumbsWrap.innerHTML = '';
  p.images.forEach((src, i) => {
    const label = (p.imageLabels && p.imageLabels[i]) ? p.imageLabels[i] : (i + 1);
    const thumb = document.createElement('img');
    thumb.className = 'pdp-thumb' + (i === 0 ? ' active' : '');
    thumb.src = src; thumb.alt = p.name + ' — ' + label; thumb.title = label;
    thumb.onerror = () => { thumb.style.display = 'none'; };
    thumb.onclick = () => pdpGoTo(i);
    thumbsWrap.appendChild(thumb);
  });

  const varChips = document.getElementById('pdpVariants');
  varChips.innerHTML = '';
  if (p.colorVariants && p.colorVariants.length > 0) {
    varChips.style.display = '';
    p.colorVariants.forEach(v => {
      const chip = document.createElement('button');
      chip.className = 'pdp-var-chip' + (v.active ? ' selected' : ''); chip.textContent = v.label;
      chip.onclick = () => { closePdp(); setTimeout(() => openPdp(v.productId), 60); };
      varChips.appendChild(chip);
    });
  } else { varChips.style.display = 'none'; }

  const sizesWrap = document.getElementById('pdpSizes'); sizesWrap.innerHTML = '';
  (p.sizes || []).forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'pdp-size-btn' + (s.soldOut ? ' pdp-size-sold' : '');
    btn.textContent = s.size; btn.dataset.size = s.size;
    if (!s.soldOut) btn.onclick = () => pdpSelectSize(btn, s.size);
    sizesWrap.appendChild(btn);
  });
  document.getElementById('pdpSizeError').classList.remove('show');
  document.getElementById('pdpSizingGuide').style.display = p.sizeGuide ? '' : 'none';
  const addBtn = document.getElementById('pdpAddBtn');
  addBtn.textContent = 'add to cart'; addBtn.disabled = false;

  const detailsWrap = document.getElementById('pdpDetails'); detailsWrap.innerHTML = '';
  (p.details || []).forEach(d => {
    const row = document.createElement('div'); row.className = 'pdp-detail-row';
    row.innerHTML = `<span>${esc(d.label)}</span><span>${esc(d.value)}</span>`;
    detailsWrap.appendChild(row);
  });

  const overlay = document.getElementById('pdpOverlay');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closePdp() { document.getElementById('pdpOverlay').classList.remove('open'); document.body.style.overflow = ''; pdpSelectedSize = null; }
function closePdpOnOverlay(e) { if (e.target === document.getElementById('pdpOverlay')) closePdp(); }

function openSizeGuide() {
  const p = window.STORE_CONFIG.products[pdpProductId];
  if (!p || !p.sizeGuide) return;
  const guide = p.sizeGuide;
  document.getElementById('sizeGuideProduct').textContent = p.name + (p.variant ? ' — ' + p.variant : '');
  document.getElementById('sizeGuideNote').textContent = guide.note || '';
  document.getElementById('sizeGuideHead').innerHTML = '<tr>' + guide.columns.map(c => '<th scope="col">' + esc(c) + '</th>').join('') + '</tr>';
  document.getElementById('sizeGuideBody').innerHTML = guide.rows.map(row => '<tr>' + row.map(v => '<td>' + esc(v) + '</td>').join('') + '</tr>').join('');
  document.getElementById('sizeGuideOverlay').classList.add('open');
}
function closeSizeGuide() { document.getElementById('sizeGuideOverlay').classList.remove('open'); }
function closeSizeGuideOnOverlay(e) { if (e.target === document.getElementById('sizeGuideOverlay')) closeSizeGuide(); }

function pdpGoTo(idx) {
  const p = window.STORE_CONFIG.products[pdpProductId]; if (!p) return;
  pdpImgIdx = idx;
  const mainImg = document.getElementById('pdpMainImg'), mainPh = document.getElementById('pdpMainPh');
  mainImg.style.opacity = '0';
  setTimeout(() => {
    mainImg.src = p.images[idx] || ''; mainImg.alt = p.name + ' ' + (idx + 1); mainImg.style.opacity = '';
    mainImg.onerror = () => { mainImg.style.display = 'none'; mainPh.textContent = p.name; mainPh.style.display = 'flex'; };
  }, 140);
  document.querySelectorAll('.pdp-thumb').forEach((t, i) => t.classList.toggle('active', i === idx));
}
function pdpSelectSize(btn, size) {
  document.querySelectorAll('.pdp-size-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected'); pdpSelectedSize = size;
  document.getElementById('pdpSizeError').classList.remove('show');
}
function pdpAddToCart() {
  if (!pdpSelectedSize) { document.getElementById('pdpSizeError').classList.add('show'); return; }
  const p = window.STORE_CONFIG.products[pdpProductId], key = pdpProductId + '-' + pdpSelectedSize;
  const existing = cart.find(i => i.key === key);
  if (existing) { existing.qty++; }
  else { cart.push({ key, productId: pdpProductId, name: p.name, variant: p.variant, size: pdpSelectedSize, price: p.price, qty: 1, img: p.img }); }
  saveCart(); renderCart(); closePdp(); openCart();
}

/* ── Checkout ─────────────────────────────────────────────── */
function getRegion() {
  const country = document.getElementById('co-country').value;
  const ghEl = document.getElementById('co-region-gh'), otherEl = document.getElementById('co-region-other');
  return country === 'GH' ? (ghEl ? ghEl.value : '') : (otherEl ? otherEl.value.trim() : '');
}
function updateStateLabel() {
  const country = document.getElementById('co-country').value,
    ghSel = document.getElementById('co-region-gh'),
    otherInp = document.getElementById('co-region-other'),
    lbl = document.getElementById('state-label'),
    digitalWrap = document.getElementById('digital-addr-wrap'),
    postalInp = document.getElementById('co-postal');
  if (country === 'GH') {
    ghSel.style.display = 'block'; otherInp.style.display = 'none';
    lbl.textContent = 'region'; digitalWrap.style.display = '';
    postalInp.placeholder = 'postal code (optional)';
  } else if (country === 'US' || country === 'CA') {
    ghSel.style.display = 'none'; otherInp.style.display = 'block'; otherInp.placeholder = 'state / province';
    lbl.textContent = 'state / province'; digitalWrap.style.display = 'none';
    postalInp.placeholder = 'zip / postal code';
  } else if (country === 'GB') {
    ghSel.style.display = 'none'; otherInp.style.display = 'block'; otherInp.placeholder = 'county / region (optional)';
    lbl.textContent = 'county / region'; digitalWrap.style.display = 'none';
    postalInp.placeholder = 'postcode (e.g. SW1A 1AA)';
  } else {
    ghSel.style.display = 'none'; otherInp.style.display = 'block'; otherInp.placeholder = 'state / province / region';
    lbl.textContent = 'state / region'; digitalWrap.style.display = 'none';
    postalInp.placeholder = 'postal / zip code';
  }
}
function openCheckout() {
  if (cart.length === 0) return;
  const profile = JSON.parse(localStorage.getItem('360_profile') || '{}');
  document.getElementById('co-name').value = profile.name || '';
  document.getElementById('co-email').value = profile.email || '';
  document.getElementById('co-phone').value = profile.phone || '';
  if (profile.country) { document.getElementById('co-country').value = profile.country; }
  updateStateLabel();
  document.getElementById('co-addr1').value = profile.addr1 || '';
  document.getElementById('co-addr2').value = profile.addr2 || '';
  document.getElementById('co-city').value = profile.city || '';
  const ghSel = document.getElementById('co-region-gh'), otherInp = document.getElementById('co-region-other');
  if (profile.region && profile.country === 'GH') ghSel.value = profile.region;
  if (profile.region && profile.country !== 'GH') otherInp.value = profile.region;
  document.getElementById('co-postal').value = profile.postal || '';
  document.getElementById('co-digital').value = profile.digital || '';
  document.getElementById('co-notes').value = profile.notes || '';
  const summary = document.getElementById('checkoutSummary');
  summary.innerHTML = cart.map(i => `<div class="checkout-order-row"><span>${esc(i.name)} · ${esc(i.size)} × ${i.qty}</span><span>GH₵ ${i.price * i.qty}</span></div>`).join('') +
    `<div class="checkout-order-row total"><span>total</span><span>GH₵ ${cartTotal()}</span></div>`;
  document.getElementById('checkout-error').classList.remove('show');
  closeCart();
  document.getElementById('checkoutOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeCheckout() { document.getElementById('checkoutOverlay').classList.remove('open'); document.body.style.overflow = ''; }
function closeCheckoutOnOverlay(e) { if (e.target === document.getElementById('checkoutOverlay')) closeCheckout(); }
function setPaymentButtonState(isBusy) {
  const button = document.querySelector('.pay-btn'); if (!button) return;
  button.disabled = isBusy;
  button.textContent = isBusy ? 'opening secure payment…' : 'pay securely via paystack';
}
function showCheckoutError(message) {
  const err = document.getElementById('checkout-error'); err.textContent = message; err.classList.add('show');
}
async function saveVerifiedOrder(payload) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch('/api/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: controller.signal
    });
  } finally { window.clearTimeout(timeout); }
}
function initiateCheckout() {
  const name = document.getElementById('co-name').value.trim(),
    email = document.getElementById('co-email').value.trim(),
    phone = document.getElementById('co-phone').value.trim(),
    country = document.getElementById('co-country').value,
    addr1 = document.getElementById('co-addr1').value.trim(),
    addr2 = document.getElementById('co-addr2').value.trim(),
    city = document.getElementById('co-city').value.trim(),
    region = getRegion(),
    postal = document.getElementById('co-postal').value.trim(),
    digital = document.getElementById('co-digital').value || '',
    notes = document.getElementById('co-notes').value.trim();
  if (!name || !email || !addr1 || !city || !region) { showCheckoutError('please fill in your name, email, and shipping address.'); return; }
  document.getElementById('checkout-error').classList.remove('show');
  if (!window.PaystackPop) { showCheckoutError('secure payment could not load. Please refresh and try again.'); return; }
  if (document.getElementById('saveProfile').checked) {
    localStorage.setItem('360_profile', JSON.stringify({ name, email, phone, country, addr1, addr2, city, region, postal, digital, notes }));
  }
  const amount = Math.round(cartTotal() * 100),
    orderDetails = cart.map(i => `${i.name}(${i.size})x${i.qty}`).join(','),
    shippingAddr = [addr1, addr2, city, region, postal, country].filter(Boolean).join(', ');
  setPaymentButtonState(true);
  try {
    const popup = new PaystackPop();
    popup.newTransaction({
      key: window.STORE_CONFIG.paystackPublicKey, email, amount, currency: window.STORE_CONFIG.currency,
      channels: ['mobile_money', 'card'],
      metadata: {
        custom_fields: [
          { display_name: 'Name', variable_name: 'name', value: name },
          { display_name: 'Phone', variable_name: 'phone', value: phone },
          { display_name: 'Order', variable_name: 'order', value: orderDetails },
          { display_name: 'Ship To', variable_name: 'ship_to', value: shippingAddr },
          { display_name: 'Digital Addr', variable_name: 'digital', value: digital || '—' },
          { display_name: 'Notes', variable_name: 'notes', value: notes || '—' }
        ]
      },
      label: '360SPRNG',
      onCancel: function () { setPaymentButtonState(false); },
      onError: function () { setPaymentButtonState(false); showCheckoutError('secure payment could not start. Please try again.'); },
      onSuccess: async function (response) {
        const ref = response.reference, total = cartTotal();
        let orderSaved = false;
        try {
          const res = await saveVerifiedOrder({
            ref, email, name, phone, country,
            address: [addr1, addr2].filter(Boolean).join(', '),
            city, region, postal, digital_address: digital || '', notes: notes || '',
            items: cart.map(i => `${i.name}(${i.size})x${i.qty}`).join(','),
            total
          });
          let data = null;
          try { data = await res.json(); } catch (e) { /* non-JSON */ }
          orderSaved = res.ok && data && data.ok === true;
        } catch (e) { /* network error — payment succeeded, order not confirmed server-side */ }
        try {
          const orders = JSON.parse(localStorage.getItem('360_orders') || '[]');
          orders.unshift({ ref, date: new Date().toISOString(), name, total, items: cart.map(i => ({ name: i.name, variant: i.variant, size: i.size, qty: i.qty })) });
          localStorage.setItem('360_orders', JSON.stringify(orders.slice(0, 50)));
        } catch (e) { /* non-critical */ }
        cart = []; saveCart(); renderCart();
        setPaymentButtonState(false); closeCheckout();
        showConfirm(orderSaved, name, ref, total);
      }
    });
  } catch (error) {
    setPaymentButtonState(false); showCheckoutError('secure payment could not start. Please try again.');
  }
}
function showConfirm(orderSaved, name, ref, total) {
  const m = document.createElement('div');
  m.className = 'confirm-overlay';
  m.innerHTML = orderSaved
    ? `<div class="check">✓</div><div class="title">order confirmed</div>
       <div class="meta">${esc(name)}<br>ref: ${esc(ref)}<br>total: GH₵ ${total}</div>
       <div class="note">confirmation email on its way. we'll reach out on instagram with dispatch info.</div>
       <div class="actions"><button class="btn-outline" onclick="this.closest('.confirm-overlay').remove()">continue shopping</button></div>`
    : `<div class="check">✓</div><div class="title">payment received</div>
       <div class="meta">${esc(name)}<br>ref: ${esc(ref)}<br>total: GH₵ ${total}</div>
       <div class="note">we're finalizing your order — if you don't hear from us on instagram within 24 hours, message us with the reference above.</div>
       <div class="actions"><button class="btn-outline" onclick="this.closest('.confirm-overlay').remove()">continue shopping</button></div>`;
  document.body.appendChild(m);
}

/* ── Newsletter (posts to existing /api/newsletter route) ──── */
async function submitNewsletter(form) {
  const emailInput = form.querySelector('input[type=email]');
  const msg = form.querySelector('.news-form-msg');
  const email = emailInput.value.trim();
  if (!email) return false;
  try {
    const res = await fetch('/api/newsletter', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email })
    });
    if (res.ok) { if (msg) { msg.textContent = "you're on the list."; msg.style.opacity = 1; } emailInput.value = ''; }
    else if (msg) { msg.textContent = 'something went wrong — try again.'; msg.style.opacity = 1; }
  } catch (e) { if (msg) { msg.textContent = 'network error — try again.'; msg.style.opacity = 1; } }
  return false;
}

/* ── Global init ──────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  renderCart();
  document.querySelectorAll('#productGrid .product-card[data-product-id]').forEach(card => {
    card.addEventListener('click', () => { const id = card.dataset.productId; if (id) openPdp(id); });
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    closeNav(); closeCatDropdown();
    if (document.getElementById('checkoutOverlay')?.classList.contains('open')) closeCheckout();
    else if (document.getElementById('pdpOverlay')?.classList.contains('open')) closePdp();
    else if (document.getElementById('sizeGuideOverlay')?.classList.contains('open')) closeSizeGuide();
    else if (document.getElementById('cartDrawer')?.classList.contains('open')) closeCart();
  });
});
