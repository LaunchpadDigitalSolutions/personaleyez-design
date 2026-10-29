/* Launchpad Feature — Category page (product grid, basket, enquiry, checkout hand-off)
   Extracted from Peach State (Workwear / Sportswear / Gifts pages).

   One template, many category pages. A product belongs to a page through
   its page_key; the page shows only its own products, lets the customer
   pick size and colour, collects a basket and hands it to a checkout
   endpoint. With no products it shows a finished-looking empty state that
   points at the enquiry form.

   No host globals. Everything the page needs comes in as options:
     mountCategoryPage({
       pageKey: 'workwear',
       grid:   el,                 // where product cards go
       basket: el,                 // where basket + checkout form go
       load:   () => rows,         // async, returns product rows
       phone:  '01429 866266',     // shown if loading or paying fails
       checkout: payload => url,   // default: POST /api/checkout
       go:     url => location.assign(url),
       onError: msg => {}
     })

   The basket sends product_id, qty, size and colour. The server looks up
   every price itself and ignores any price the browser sends (Job 15).
   Error codes: PS-700 load, PS-701/702 checkout, PS-710 basket, PS-711 setup.
*/

export const PAGES = {
  workwear:   { title: 'Workwear',            file: 'workwear.html',   contact: 'workwear' },
  sportswear: { title: 'Sportswear',          file: 'sportswear.html', contact: 'sportswear' },
  gifts:      { title: 'Gifts & Accessories', file: 'gifts.html',      contact: 'personalised' }
};

const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ENT[c]);
export const money = n => '£' + (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
export const splitList = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
export const safeUrl = u => (/^(https:\/\/|\/)/.test(String(u || '')) && !/^\/\//.test(String(u))) ? String(u) : '';
export const enquiryHref = (page, base = 'contact.html') =>
  page && page.contact ? base + '?cat=' + encodeURIComponent(page.contact) : base;

/* Rows for one page: active, not a school item, matching page_key, in order. */
export function productsForPage(rows, pageKey) {
  return (rows || [])
    .filter(p => p && p.page_key === pageKey && p.active !== false && !p.is_school_item)
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.name).localeCompare(String(b.name)));
}

export class Basket {
  constructor() { this.lines = []; }

  add(product, { size = '', colour = '', qty = 1 } = {}) {
    if (!product || !(Number(product.price) > 0)) throw new Error('PS-710: product has no price');
    qty = Math.max(1, Math.floor(Number(qty) || 1));
    const opts = [size, colour].filter(Boolean);
    const found = this.lines.find(l => l.id === product.id && l.opts.join('|') === opts.join('|'));
    if (found) found.qty += qty;
    else this.lines.push({ id: product.id, name: product.name, price: Number(product.price), opts, qty, size, colour });
    return this;
  }

  remove(i) { this.lines.splice(i, 1); return this; }
  get isEmpty() { return this.lines.length === 0; }
  get count() { return this.lines.reduce((s, l) => s + l.qty, 0); }
  get total() { return Math.round(this.lines.reduce((s, l) => s + Math.round(l.price * 100) * l.qty, 0)) / 100; }

  /* What /api/checkout takes: which product, how many, which options. The server
     prices every line itself (display prices here are for show). */
  items() {
    // name/price are legacy fields the server ignores; they keep the old server working during rollout
    return this.lines.map(l => ({ product_id: l.id, qty: l.qty, size: l.size || undefined, colour: l.colour || undefined, name: l.name, price: l.price }));
  }
}

export function validateOrder(basket, c) {
  if (basket.isEmpty) return 'Choose at least one item.';
  if (!c.name) return 'We need your name.';
  if (String(c.phone || '').length < 9) return 'We need a phone number.';
  if (!c.consent) return "Please tick the box to say you're happy for us to use your details for this order.";
  return '';
}

export const orderPayload = (basket, c, note) => ({
  items: basket.items(),
  customer: { name: c.name, phone: c.phone, email: c.email || undefined },
  note: note || undefined
});

export async function checkoutViaApi(payload, { fetchFn = globalThis.fetch, url = '/api/checkout' } = {}) {
  let res, data;
  try {
    res = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    data = await res.json();
  } catch (e) { throw new Error('PS-701: could not reach checkout'); }
  if (!res.ok || !data || !data.checkout_url) {
    const err = new Error('PS-702: checkout refused');
    // 02x = a problem the customer can fix; the server's message is written for them
    err.friendly = (res.status < 500 && /^PS[CI]-02\d$/.test((data && data.error) || '')) ? data.message : '';
    throw err;
  }
  return data.checkout_url;
}

/* ---------- markup ---------- */

const field = (kind, label, list) => list.length
  ? `<label class="cp-fld"><span>${label}</span><select data-cp="${kind}">${list.map(o => `<option>${esc(o)}</option>`).join('')}</select></label>` : '';

export function cardHtml(p) {
  const url = safeUrl(p.image_url);
  return `<article class="cp-card" data-id="${esc(p.id)}">
    <div class="cp-img${url ? '' : ' cp-noimg'}">${url ? `<img loading="lazy" src="${esc(url)}" alt="${esc(p.name)}">` : `<span>${esc(p.name)}</span>`}</div>
    <h3>${esc(p.name)}</h3>
    <p class="cp-price">${money(p.price)}</p>
    ${p.description ? `<p class="cp-desc">${esc(p.description)}</p>` : ''}
    ${field('size', 'Size', splitList(p.sizes))}${field('colour', 'Colour', splitList(p.colours))}
    <button type="button" class="cp-btn" data-cp="add">Add to basket</button>
  </article>`;
}

export const gridHtml = products => `<div class="cp-grid">${products.map(cardHtml).join('')}</div>`;

export const emptyHtml = href => `<div class="cp-empty"><h3>New products coming soon.</h3>
  <p>Tell us what you need and we will sort it.</p>
  <a class="cp-link" href="${esc(href)}">Ask us &rarr;</a></div>`;

export const errorHtml = phone => `<div class="cp-empty"><h3>We can't show the range just now.</h3>
  <p>Please ring us${phone ? ' on ' + esc(phone) : ''} and we will help.</p></div>`;

export const linesHtml = b => b.lines.map((l, i) => `<li><span>${l.qty} × ${esc(l.name)}${l.opts.length ? ' · ' + esc(l.opts.join(' · ')) : ''}</span>
  <span>${money(l.price * l.qty)}<button type="button" class="cp-rm" data-cp="rm" data-i="${i}" aria-label="Remove ${esc(l.name)}">&times;</button></span></li>`).join('');

export const basketShell = () => `<div class="cp-basket"><h3>Your basket</h3>
  <ul data-cp="lines"></ul>
  <div class="cp-total"><span>Total</span><b data-cp="total"></b></div></div>
  <div class="cp-form"><h3>Who is it for?</h3>
  <label class="cp-fld"><span>Your name</span><input data-cp="name" type="text" autocomplete="name"></label>
  <label class="cp-fld"><span>Phone</span><input data-cp="phone" type="tel" autocomplete="tel"></label>
  <label class="cp-fld"><span>Email (optional)</span><input data-cp="email" type="email" autocomplete="email"></label>
  <label class="cp-fld"><span>Personalisation / notes (optional)</span><textarea data-cp="note-text"></textarea></label>
  <label class="cp-consent"><input data-cp="consent" type="checkbox"><span>I agree to my details being used to process this order, as set out in the <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.</span></label>
  <div class="cp-note" data-cp="note" role="status"></div>
  <button type="button" class="cp-btn cp-pay" data-cp="pay">Pay with card</button>
  <p class="cp-small">You'll pay securely on Square's own checkout page. We never see or store your card details.</p></div>`;

/* ---------- mount ---------- */

export function mountCategoryPage(o) {
  if (!o || !o.grid || !o.basket || !o.pageKey || !o.load) throw new Error('PS-711: mountCategoryPage needs pageKey, grid, basket and load');
  const page = PAGES[o.pageKey] || { title: o.pageKey, contact: 'other' };
  const href = o.enquiryHref || enquiryHref(page);
  const onError = o.onError || (m => console.error(m));
  const checkout = o.checkout || checkoutViaApi;
  const go = o.go || (u => globalThis.location.assign(u));
  const basket = new Basket();
  let products = [], formReady = false;

  const q = n => o.basket.querySelector(`[data-cp="${n}"]`);
  const say = (cls, msg) => { const n = q('note'); if (n) { n.className = 'cp-note show ' + cls; n.textContent = msg; } };

  function paintBasket() {
    if (basket.isEmpty) { o.basket.hidden = true; return; }
    if (!formReady) { o.basket.innerHTML = basketShell(); formReady = true; }
    q('lines').innerHTML = linesHtml(basket);
    q('total').textContent = money(basket.total);
    o.basket.hidden = false;
  }

  o.grid.addEventListener('click', e => {
    const btn = e.target.closest('[data-cp="add"]');
    if (!btn) return;
    const card = btn.closest('.cp-card');
    const p = products.find(x => String(x.id) === card.dataset.id);
    if (!p) return;
    const val = n => (card.querySelector(`[data-cp="${n}"]`) || {}).value || '';
    try { basket.add(p, { size: val('size'), colour: val('colour') }); } catch (err) { onError(err.message); return; }
    paintBasket();
    const was = btn.textContent;
    btn.textContent = 'Added';
    setTimeout(() => { btn.textContent = was; }, 1100);
  });

  o.basket.addEventListener('click', e => {
    const rm = e.target.closest('[data-cp="rm"]');
    if (rm) { basket.remove(Number(rm.dataset.i)); paintBasket(); return; }
    if (e.target.closest('[data-cp="pay"]')) pay();
  });

  async function pay() {
    const c = { name: q('name').value.trim(), phone: q('phone').value.trim(), email: q('email').value.trim(), consent: q('consent').checked };
    const bad = validateOrder(basket, c);
    if (bad) { say('err', bad); return; }
    const btn = q('pay');
    btn.disabled = true;
    say('busy', 'Setting up your payment…');
    try {
      go(await checkout(orderPayload(basket, c, q('note-text').value.trim())));
    } catch (e) {
      onError(e.message);
      say('err', e.friendly || ("That didn't go through. Please ring us" + (o.phone ? ' on ' + o.phone : '') + '.'));
      btn.disabled = false;
    }
  }

  return (async () => {
    let failed = false;
    try { products = productsForPage(await o.load(), o.pageKey); }
    catch (e) { failed = true; onError('PS-700: ' + e.message); }
    o.grid.innerHTML = failed ? errorHtml(o.phone) : products.length ? gridHtml(products) : emptyHtml(href);
    paintBasket();
    return { basket, products };
  })();
}
