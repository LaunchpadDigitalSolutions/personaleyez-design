/* Checks the "Order a product" menu without a browser or network: runs the real js/partials.js in a stub page,
   with and without the dropdown module, against old, new and broken saved-menu data.
   Run: npm run test:menu */
import { readFile, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const rd = f => readFile(new URL('../' + f, import.meta.url), 'utf8');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

const [config, partials, moduleSrc] = await Promise.all([rd('js/config.js'), rd('js/partials.js'), rd('js/nav-dropdown.js')]);

function site({ withModule = true, store = {}, throwStorage = false, rows = null } = {}) {
  const ls = { ...store };
  const ctx = vm.createContext({
    console, setTimeout, clearTimeout, addEventListener() {}, location: { pathname: '/index.html' },
    localStorage: { getItem: k => { if (throwStorage) throw new Error('blocked'); return k in ls ? ls[k] : null; }, setItem: (k, v) => { ls[k] = v; } },
    document: { getElementById: () => null, addEventListener() {}, querySelectorAll: () => [], write() {} },
    sb: rows ? async path => { ctx.lastQuery = path; return rows; } : undefined
  });
  ctx.window = ctx;
  vm.runInContext(config + '\n' + partials, ctx);
  if (withModule) vm.runInContext(moduleSrc, ctx);
  ctx.ls = ls;
  return ctx;
}
const run = (ctx, code) => vm.runInContext(code, ctx);
const NAV_KEY = 'ps_nav_pages';

/* ---- the built-in menu ---- */
const a = site();
const nav = JSON.parse(run(a, 'JSON.stringify(NAV)')), group = JSON.parse(run(a, 'JSON.stringify(NAV_GROUP)'));
ok(!nav.some(r => r[0] === 'schools.html'), 'top-level Schools link is gone');
ok(['index.html', 'services.html', 'clubs.html', 'track.html', 'contact.html'].every(h => nav.some(r => r[0] === h)), 'other built-in links kept');
ok(group.label === 'Order a product' && group.labelKey === 'nav_order_product', 'parent wording and its editable key');
ok(JSON.stringify(group.children.map(c => c[1])) === JSON.stringify(['School Uniform', 'Workwear', 'Sportswear', 'Gifts & Accessories']), 'four children in the agreed order');
ok(group.children[0][0] === 'schools-shop.html', 'School Uniform goes to the shop');
for (const [h] of group.children) await access(new URL('../' + h, import.meta.url)).then(() => n++, () => assert.fail(h + ' does not exist'));
const sitemap = await rd('sitemap.xml');
for (const [h] of group.children.slice(1)) ok(sitemap.includes('https://peachstate.co.uk/' + h), h + ' is in the sitemap'); // schools-shop.html is not (reported, not changed here)
ok(group.after === 'services.html', 'group sits after What We Make');

/* ---- drawn with the module ---- */
const d = run(a, 'navHtml("desktop", "index.html")');
ok(d.includes('class="nd-parent"') && d.includes('data-edit="site_nav_order_product"'), 'desktop parent is editable');
ok(d.includes('data-edit="site_nav_schools_shop_html"') && d.includes('data-edit="site_nav_workwear_html"') && d.includes('data-edit="site_nav_gifts_html"'), 'children are editable');
ok(d.indexOf('What We Make') < d.indexOf('Order a product') && d.indexOf('Order a product') < d.indexOf('Club Shops'), 'order in the bar');
ok(run(a, 'navHtml("mobile", "index.html")').includes('nd-mparent') && run(a, 'navHtml("footer", "index.html")').includes('nd-fgroup'), 'mobile and footer have the group');
ok(run(a, 'navHtml("desktop", "workwear.html")').includes('class="nd-parent on"'), 'parent highlights on a child page');

/* ---- saved menu data: old shape, new shape, junk ---- */
const old = site({ store: { [NAV_KEY]: '[{"slug":"offers","title":"Offers"}]' } });
const oh = run(old, 'navHtml("desktop", "index.html")');
ok(oh.includes('href="p/offers"') && oh.indexOf('p/offers') > oh.indexOf('Contact'), 'old cache shape (no nav_group) is a top-level page');
const nw = site({ store: { [NAV_KEY]: '[{"slug":"kits","title":"Kits","nav_group":"order"},{"slug":"offers","title":"Offers","nav_group":null}]' } });
const nh = run(nw, 'navHtml("desktop", "index.html")');
ok(nh.indexOf('p/kits') > nh.indexOf('nd-panel') && nh.indexOf('p/kits') < nh.indexOf('Club Shops'), 'page with nav_group order is inside the dropdown');
ok(nh.indexOf('p/offers') > nh.indexOf('Contact'), 'page with no group stays top level');
for (const bad of ['not json', '{"a":1}', 'null', '[1,"x",null,{"slug":"Bad Slug","title":"x"}]', '']) {
  const s = site({ store: { [NAV_KEY]: bad } });
  ok(run(s, 'navHtml("desktop", "index.html")').includes('nd-parent'), 'broken saved menu ' + JSON.stringify(bad) + ' still draws the menu');
}
ok(site({ throwStorage: true }) && run(site({ throwStorage: true }), 'navHtml("mobile", "index.html")').includes('nd-mparent'), 'blocked storage still draws the menu');
ok(run(site({ store: { [NAV_KEY]: '[{"slug":"x","title":"<img src=x onerror=1>","nav_group":"order"}]' } }), 'navHtml("desktop","index.html")').includes('&lt;img'), 'owner page titles are escaped');

/* ---- module missing: a flat but working menu ---- */
const flat = site({ withModule: false, store: { [NAV_KEY]: '[{"slug":"kits","title":"Kits","nav_group":"order"}]' } });
const fd = run(flat, 'navHtml("desktop", "index.html")'), fm = run(flat, 'navHtml("mobile", "index.html")'), ff = run(flat, 'navHtml("footer", "index.html")');
ok(!fd.includes('nd-') && ['schools-shop.html', 'workwear.html', 'sportswear.html', 'gifts.html', 'p/kits'].every(h => fd.includes('href="' + h + '"')), 'without the module every link is still there, flat');
ok(fm.includes('class="navlink"') && !ff.includes('nd-'), 'flat mobile and footer');

/* ---- refreshing the saved menu ---- */
const live = site({ rows: [{ slug: 'kits', title: 'Kits', nav_group: 'order' }] });
await run(live, 'refreshNavPages()');
ok(live.lastQuery.includes('select=slug,title,nav_group'), 'refresh asks for nav_group');
ok(JSON.parse(live.ls[NAV_KEY])[0].nav_group === 'order', 'refresh saves nav_group');

/* ---- source contracts ---- */
ok(partials.split('\n').length < 300, 'partials.js stays under 300 lines');
ok(/foot_make_4", "Workwear"/.test(partials) && partials.includes('services.html#workwear') && partials.includes('schools.html">${T("foot_make_3"'), 'the We Make footer links are untouched');
const adminFn = await rd('functions/api/admin.js'), pages = await rd('js/admin-pages.js'), sql = await rd('supabase/job09-nav-group.sql'), adminHtml = await rd('admin.html');
ok(adminFn.includes('"ps_admin_set_page_nav_group"'), 'the admin proxy forwards the new RPC');
ok(pages.includes('"ps_admin_set_page_nav_group"') && pages.includes('"PS-722"'), 'admin calls it with a code');
ok(pages.includes('name="pgn-menu"') && pages.includes('moveNavPage') && !pages.includes('pgn-nav'), 'new-page form has the three choices; old checkbox is gone');
ok(!adminHtml.includes('admin-pages.js?v=0.9.5'), 'admin-pages.js version bumped');
ok(/revoke all on function public\.ps_admin_set_page_nav_group/.test(sql) && /nav_group in|nav_group = 'order'/.test(sql) && /Rollback/.test(sql), 'migration restricts access, limits values, and records a rollback');
ok(moduleSrc.includes('PS-720') && moduleSrc.includes('PS-721'), 'module reports its codes');

/* every page that draws a header gets the module (from partials.js) */
ok(partials.includes('css/nav-dropdown.css') && partials.includes('css/nav-dropdown-theme.css') && partials.includes('js/nav-dropdown.js'), 'partials.js loads the module and both stylesheets');
console.log(n + ' checks passed');
