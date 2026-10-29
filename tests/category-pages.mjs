/* Checks the category pages without a browser or network: generated files match the template,
   every page is wired to the module, school items can't leak, and the admin/page-list contracts hold.
   Run: npm run test:pages */
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PAGES, render } from '../tools/build-category-pages.mjs';
import * as C from '../js/category-page.js';
import * as A from '../js/category-page-admin.js';

const rd = f => readFile(new URL('../' + f, import.meta.url), 'utf8');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

const tpl = await rd('tools/category-page.template.html');
for (const [key, p] of Object.entries(PAGES)) {
  const html = await rd(p.file);
  ok(html === render(tpl, key, p), p.file + ' is stale: run npm run build:pages');
  ok(html.includes(`<body data-page="${key}">`), key + ' body tag');
  ok(html.includes('id="cp-grid" data-no-edit') && html.includes('id="cp-basket" data-no-edit'), key + ' mounts are protected from the inline editor');
  ok(html.includes('js/category-page-boot.js') && html.includes(`loadContent("${key}")`), key + ' scripts');
  ok(html.includes(`href="contact.html?cat=${p.contact}"`), key + ' enquiry link');
  ok(!/\{\{|lorem/i.test(html), key + ' has no placeholders');
  ok(C.PAGES[key] && C.PAGES[key].file === p.file && C.PAGES[key].contact === p.contact, key + ' feature config matches generator');
  ok((await rd('sitemap.xml')).includes('https://peachstate.co.uk/' + p.file), key + ' in sitemap');
  ok(A.WHERE.some(w => w[0] === key), key + ' is an admin destination');
}

const contact = await rd('contact.html');
for (const p of Object.values(PAGES)) ok(contact.includes(`<option value="${p.contact}"`), 'contact.html has option ' + p.contact);
ok(contact.includes('URLSearchParams(location.search).get("cat")'), 'contact.html reads ?cat=');

ok((await rd('js/shop.js')).includes('!p.page_key'), 'shop.html ignores category page items');
ok((await rd('admin.html')).includes('admin-category.js'), 'admin.html loads admin-category.js');
ok((await rd('js/admin-category.js')).includes('PAGE_RESERVED'), 'reserved names hooked');

/* School items and unrelated rows never reach a category page. */
const rows = [{ id: 1, name: 'Jumper', price: 20, is_school_item: true, page_key: null, active: true },
  { id: 2, name: 'Apron', price: 12, is_school_item: false, page_key: 'workwear', active: true }];
ok(C.productsForPage(rows, 'workwear').length === 1 && C.productsForPage(rows, 'workwear')[0].id === 2, 'only the workwear row');

/* Size limits from the build standard. */
for (const f of ['js/category-page.js', 'js/category-page-admin.js', 'js/category-page-boot.js', 'js/admin-category.js']) ok((await rd(f)).split('\n').length < 300, f + ' under 300 lines');
for (const f of ['css/category-page.css', 'css/category-page-theme.css']) ok((await rd(f)).split('\n').length < 200, f + ' under 200 lines');
ok(await rd('js/category-page.js') === await readFile(new URL('../js/category-page.js', import.meta.url), 'utf8'), 'read ok');

console.log(n + ' checks passed');
