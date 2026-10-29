/* Job 23 checks, no browser or network: _headers rules, admin tab restore, photo history
   function and its Schools tab wiring. Run: npm run test:admin */
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { onRequestPost } from '../functions/api/photo-history.js';

const rd = f => readFile(new URL('../' + f, import.meta.url), 'utf8');
const readSync = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

/* ---- _headers: HTML, JS, CSS revalidate; images and fonts never named ---- */
const rules = [];
for (const line of (await rd('_headers')).split('\n')) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  if (!/^\s/.test(line)) rules.push({ path: line.trim(), h: [] }); else rules.at(-1).h.push(line.trim());
}
ok(rules.length > 0, 'rules parsed');
for (const p of ['/', '/:page', '/*.html', '/js/*', '/css/*']) ok(rules.some(r => r.path === p), 'rule for ' + p);
for (const r of rules) {
  ok(r.h.length === 1 && r.h[0] === 'Cache-Control: public, max-age=0, must-revalidate', r.path + ' has exactly the revalidate header');
  ok(!/img|font|\.(png|jpe?g|webp|svg|woff2?)/i.test(r.path), r.path + ' does not touch images or fonts');
}

/* ---- admin.html wiring ---- */
const html = await rd('admin.html');
const tabs = [...html.matchAll(/class="tab[^"]*" data-tab="(\w+)"/g)].map(m => m[1]);
for (const t of ['schools', 'catalog', 'editsite']) ok(tabs.includes(t), t + ' tab exists in admin.html');
const order = [...html.matchAll(/<script (?:type="module" )?src="js\/([\w-]+\.js)\?v=([\w.]+)"/g)].map(m => m[1]);
const at = f => order.indexOf(f);
ok(at('admin-schools.js') > -1 && at('admin-photo-history.js') > at('admin-schools.js'), 'photo history loads after the Schools tab');
ok(at('admin-tab-restore.js') > at('admin.js'), 'tab restore loads after admin.js');
ok(html.includes('admin-photo-history.js?v=j23a') && html.includes('admin-tab-restore.js?v=j23a'), 'new modules carry a version');

/* ---- tab restore, run against stubs ---- */
function restoreWith(hash) {
  const calls = { setTab: [], group: [] };
  const ctx = {
    location: { hash }, tab: 'live',
    document: { querySelectorAll: s => s === '.tab[data-tab]' ? tabs.map(t => ({ dataset: { tab: t } })) : [] },
    setTab: t => calls.setTab.push(t), openGroupPanel: async id => calls.group.push(id)
  };
  vm.createContext(ctx);
  vm.runInContext('var restoreTabFromHash = function(){};', ctx);
  vm.runInContext(readSync('js/admin-tab-restore.js'), ctx);
  return ctx.restoreTabFromHash().then(() => calls);
}
for (const t of tabs) ok((await restoreWith('#' + t)).setTab[0] === t, 'refresh on #' + t + ' restores ' + t);
ok((await restoreWith('#bogus')).setTab.length === 0, 'unknown hash does nothing');
ok((await restoreWith('')).setTab.length === 0, 'no hash does nothing');
const g = await restoreWith('#groups:abc-123');
ok(g.group[0] === 'abc-123' && g.setTab.length === 0, 'club shop deep link still opens the shop');

/* ---- photo-history function, fake R2 ---- */
const store = new Map();
const env = {
  STAFF_PIN: '1234',
  PRODUCT_IMAGES: {
    put: async (k, b, o) => { store.set(k, { b, o, uploaded: new Date(Date.now() + store.size * 1000) }); },
    list: async ({ prefix }) => ({ objects: [...store].filter(([k]) => k.startsWith(prefix)).map(([key, v]) => ({ key, uploaded: v.uploaded })) })
  }
};
const ID = '11111111-2222-3333-4444-555555555555';
const up = (id, { pin = '1234', type = 'image/jpeg', size = 10 } = {}) => {
  const f = new FormData(); f.append('pin', pin); f.append('item_id', id);
  f.append('file', new File([new Uint8Array(size)], 'p.jpg', { type }));
  return onRequestPost({ request: new Request('http://x/api/photo-history', { method: 'POST', body: f }), env });
};
const ls = (id, pin = '1234') => onRequestPost({ request: new Request('http://x/api/photo-history', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin, item_id: id }) }), env });

store.set(ID, { b: 1, o: {}, uploaded: new Date(Date.now() - 86400000) });   // the original, legacy key
ok((await up(ID, { pin: 'nope' })).status === 401, 'upload: wrong PIN refused');
ok((await ls(ID, 'nope')).status === 401, 'list: wrong PIN refused');
ok((await up('../x')).status === 400 && (await ls('a/b')).status === 400, 'bad item ids refused');
ok((await up(ID, { type: 'image/gif' })).status === 400, 'only jpg/png/webp');
ok((await up(ID, { size: 5 * 1024 * 1024 + 1 })).status === 400, '5MB cap');
const a = await (await up(ID)).json();
await new Promise(r => setTimeout(r, 5));
const b = await (await up(ID)).json();
ok(a.photo_url.startsWith('/api/product-photo/' + ID + '-h') && a.photo_url !== b.photo_url, 'each upload gets its own key');
ok(store.has(ID), 'the original photo is never overwritten');
const list = (await (await ls(ID)).json()).photos;
ok(list.length === 3 && list.some(p => p.url === '/api/product-photo/' + ID), 'original and both uploads are listed');
ok(list[0].uploaded >= list[1].uploaded && list[1].uploaded >= list[2].uploaded, 'newest first');
ok((await (await ls('99999999-aaaa-bbbb-cccc-dddddddddddd')).json()).photos.length === 0, 'other items do not leak in');
ok((await onRequestPost({ request: new Request('http://x', { method: 'POST', body: new FormData() }), env: { ...env, STAFF_PIN: '' } })).status === 500, 'unconfigured PIN fails closed');

/* ---- Schools tab wiring, run against stubs ---- */
{
  const calls = { render: 0, shown: 0 };
  const ctx = {
    sessionStorage: { getItem: () => '1234' }, console,
    fetch: async () => ({ ok: true, json: async () => ({ photos: [
      { url: '/api/product-photo/' + ID, uploaded: '2026-10-01T10:00:00Z' },
      { url: '/api/product-photo/' + ID + '-h1', uploaded: '2026-10-20T10:00:00Z' }] }) }),
    render: () => calls.render++, schShown: () => calls.shown++, $: () => ({}),
    schView: 'form', schForm: { id: ID, cur: '/api/product-photo/' + ID + '?v=99', alts: [{ url: '/img/other.jpg', label: 'x' }], photo: 'keep' },
    schEdit: () => {}, schUpload: () => {}
  };
  vm.createContext(ctx);
  vm.runInContext(readSync('js/admin-photo-history.js'), ctx);
  ctx.schEdit(ID);
  await new Promise(r => setTimeout(r, 10));
  const alts = ctx.schForm.alts;
  ok(alts.length === 2 && alts[1].url.endsWith('-h1') && alts[1].label.startsWith('Earlier photo'), 'earlier photo added, current photo not duplicated (?v= ignored)');
  ok(alts[0].url === '/img/other.jpg', 'existing options keep their index');
  ok(calls.render === 1 && calls.shown === 1, 'form redrawn once, shown-as line restored');
  ctx.schForm = { id: 'someone-else-entirely', cur: '', alts: [], photo: 'keep' };
  ctx.schEdit(ID); await new Promise(r => setTimeout(r, 10));
  ok(ctx.schForm.alts.length === 0, 'stale reply for a different item is ignored');
}

/* ---- build standard ---- */
for (const f of ['js/admin-tab-restore.js', 'js/admin-photo-history.js', 'functions/api/photo-history.js'])
  ok((await rd(f)).split('\n').length < 300, f + ' under 300 lines');
ok((await rd('js/admin-photo-history.js')).includes('PS-620') && (await rd('js/admin-photo-history.js')).includes('PS-621'), 'PS error codes present');
ok(!/pin\s*[:=]\s*["']\d{4}/i.test(await rd('functions/api/photo-history.js')), 'no PIN in code');

console.log(n + ' passed, 0 failed');
