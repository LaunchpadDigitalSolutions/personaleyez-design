/* admin-category.js — mounts the add-item form on the admin Shop tab.
   Wraps renderShop so admin.js and admin-shop.js stay untouched.
   Changes from initial: school dropdown fed from ps_schools; club shop chip
   redirects to Club shops tab; allow_notes param forwarded to the RPC.
   Error codes: PS-703 photo upload, PS-704 add item, PS-512 school registry read. */
import { mountAddItem, WHERE } from './category-page-admin.js';
import { PAGES } from './category-page.js';

Object.keys(PAGES).forEach(k => { if (!PAGE_RESERVED.includes(k)) PAGE_RESERVED.push(k); });

['css/category-page.css?v=0.1.0', 'css/category-page-theme.css?v=0.1.1'].forEach(h => {
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = h; document.head.appendChild(l);
});

const labelOf = k => (WHERE.find(w => w[0] === k) || [])[1] || k;
const getPin = () => { try { return sessionStorage.getItem('ps_admin_pin') || ''; } catch (e) { return ''; } };
let lastWhere = 'workwear';

/* Load school names once from ps_schools (public read). */
async function fetchSchoolNames() {
  try {
    const rows = await sb('ps_schools?select=name&active=eq.true&order=sort_order,name', {}, 'PS-512');
    const names = (rows || []).map(r => r.name).filter(Boolean);
    names.push('All schools (shared)');
    return names;
  } catch (e) { return []; }
}

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
  rows.map((r, i) => [r, shopProducts[i]]).filter(x => x[1] && x[1].page_key).reverse().forEach(x => host.after(x[0]));
}

let _schools = null;

const _renderShop = window.renderShop;
window.renderShop = async function (p) {
  _renderShop.call(this, p);
  const card = p.querySelector('.newcard');
  if (!card) return;
  if (!_schools) _schools = await fetchSchoolNames();
  const host = document.createElement('div');
  host.className = 'cp-root';
  host.style.cssText = 'max-width:640px;margin:0 auto 18px';
  card.replaceWith(host);
  mountAddItem({
    el: host, where: lastWhere,
    onWhere: w => {
      lastWhere = w;
      /* Club shop chip: redirect to the Club shops tab immediately. */
      if (w === 'clubshop' && typeof setTab === 'function') setTab('groups');
    },
    rpc: (name, params) => adminRpc(name, params, 'PS-704'),
    pin: getPin,
    schools: _schools,
    sortOrder: where => shopProducts.filter(x => where === 'school' ? x.is_school_item : x.page_key === where).length,
    toast: m => { if (typeof toast === 'function') toast(m); },
    onAdded: async () => { await loadShopProducts(); render(); }
  });
  decorateRows(p, host);
};
