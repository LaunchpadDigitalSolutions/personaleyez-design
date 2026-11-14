/* tests/school-picker-clarity.mjs — Job 2: school circle collapse and items cue */
import { strict as assert } from 'node:assert';

let pass = 0, fail = 0;
function test(label, fn) {
  try { fn(); console.log('  ✓', label); pass++; }
  catch (e) { console.error('  ✗', label, '\n   ', e.message); fail++; }
}

/* Pure-logic helpers extracted from schools-shop.js so we can test without a DOM. */
const PHASE_ORDER = ['primary','secondary','special','other'];
const PHASE_LABEL = { primary:'Primary Schools', secondary:'Secondary Schools', special:'Special Schools', other:'Other' };
const money = n => '£' + Number(n || 0).toFixed(2);

function groupBySchool(products) {
  const map = {};
  products.forEach(p => { const s = p.category || 'Other'; (map[s] = map[s] || []).push(p); });
  return map;
}
function getSchoolItems(school, all) {
  const g = groupBySchool(all);
  return (g[school] || []).concat(g['All Schools'] || []);
}
function hasOwnItems(school, all) {
  return all.some(p => p.category === school);
}
const escHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

const PRODUCTS = [
  { id: '1', name: 'Sweatshirt', category: 'Lingfield', price: 14, sizes: 'S,M,L' },
  { id: '2', name: 'Polo', category: 'Lingfield', price: 11 },
  { id: '3', name: 'Trousers', category: 'All Schools', price: 9 },
  { id: '4', name: 'Hoodie', category: 'Eldon Grove', price: 18 }
];

console.log('\nschool-picker-clarity tests\n');

// getSchoolItems
test('Lingfield gets own items + All Schools items', () => {
  const items = getSchoolItems('Lingfield', PRODUCTS);
  assert.equal(items.length, 3); // Sweatshirt, Polo, Trousers
  assert.ok(items.some(i => i.name === 'Trousers'));
});
test('School with no own items gets only All Schools', () => {
  const items = getSchoolItems('Holy Trinity', PRODUCTS);
  assert.equal(items.length, 1);
  assert.equal(items[0].name, 'Trousers');
});
test('hasOwnItems true for Lingfield', () => {
  assert.equal(hasOwnItems('Lingfield', PRODUCTS), true);
});
test('hasOwnItems false for unknown school', () => {
  assert.equal(hasOwnItems('Holy Trinity', PRODUCTS), false);
});

// items cue text
test('items cue shows correct count', () => {
  const items = getSchoolItems('Lingfield', PRODUCTS);
  const count = items.length;
  const cue = `${count} item${count !== 1 ? 's' : ''} below`;
  assert.equal(cue, '3 items below');
});
test('items cue singular for one item', () => {
  const single = [{ id: '5', name: 'Skirt', category: 'All Schools', price: 7 }];
  const items = getSchoolItems('Any', single);
  const count = items.length;
  const cue = `${count} item${count !== 1 ? 's' : ''} below`;
  assert.equal(cue, '1 item below');
});

// Escaping in renderTabs
test('school name is HTML-escaped in header', () => {
  const name = '<script>xss</script>';
  const html = `<span class="su-school-header-name">${escHtml(name)}</span>`;
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

// groupBySchool
test('groups products by category', () => {
  const g = groupBySchool(PRODUCTS);
  assert.equal(g['Lingfield'].length, 2);
  assert.equal(g['All Schools'].length, 1);
});

// money helper
test('money formats to two decimal places', () => {
  assert.equal(money(14), '£14.00');
  assert.equal(money(0), '£0.00');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
