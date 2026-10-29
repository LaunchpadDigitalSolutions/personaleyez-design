/* admin-category.js — puts the "Where does it go?" add-item form on the admin Shop tab
   and shows category-page items at the top of the list. Wraps renderShop (the same way
   admin-pages.js wraps the dashboard), so admin.js and admin-shop.js stay untouched.
   Error codes: PS-703 photo upload, PS-704 add item. */
import { mountAddItem, WHERE } from './category-page-admin.js';
import { PAGES } from './category-page.js';

/* Keep these names free for the template pages (the database refuses them too). */
Object.keys(PAGES).forEach(k => { if (!PAGE_RESERVED.includes(k)) PAGE_RESERVED.push(k); });

/* admin.html doesn't load the feature's styles, so add them here (once) and scope the form with .cp-root. */
['css/category-page.css?v=0.1.0', 'css/category-page-theme.css?v=0.1.1'].forEach(h => {
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = h; document.head.appendChild(l);
});

const labelOf = k => (WHERE.find(w => w[0] === k) || [])[1] || k;
const getPin = () => { try { return sessionStorage.getItem('ps_admin_pin') || ''; } catch (e) { return ''; } };
let lastWhere = 'workwear';

function decorateRows(p, host) {
  const rows = [...p.querySelectorAll('.orow')];
  rows.forEach((row, i) => {
    const pr = shopProducts[i], meta = row.querySelector('.ometa');
    if (!pr || !pr.page_key) return;
    if (meta) meta.textContent = meta.textContent.replace('General shop', labelOf(pr.page_key) + ' page');
    const t = document.createElement(pr.image_url ? 'img' : 'div');
    t.style.cssText = 'width:56px;height:56px;object-fit:cover;margin-bottom:10px;display:flex;align-items:center;justify-content:center;font-size:10px;background:var(--cream-deep);color:var(--muted)';
    if (pr.image_url) { t.src = pr.image_url; t.alt = ''; } else t.textContent = 'No photo';
    row.prepend(t);
  });
  /* Newest page items first, ahead of the long school list, so Jo sees what she just added. */
  rows.map((r, i) => [r, shopProducts[i]]).filter(x => x[1] && x[1].page_key).reverse().forEach(x => host.after(x[0]));
}

const _renderShop = window.renderShop;
window.renderShop = function (p) {
  _renderShop.call(this, p);
  const card = p.querySelector('.newcard');
  if (!card) return;
  const host = document.createElement('div');
  host.className = 'cp-root';
  host.style.cssText = 'max-width:640px;margin:0 auto 18px';
  card.replaceWith(host);
  mountAddItem({
    el: host, where: lastWhere, onWhere: w => { lastWhere = w; },
    rpc: (name, params) => adminRpc(name, params, 'PS-704'),
    pin: getPin,
    sortOrder: where => shopProducts.filter(x => where === 'school' ? x.is_school_item : x.page_key === where).length,
    toast: m => { if (typeof toast === 'function') toast(m); },
    onAdded: async () => { await loadShopProducts(); render(); }
  });
  decorateRows(p, host);
};
