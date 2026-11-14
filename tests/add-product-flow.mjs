/* tests/add-product-flow.mjs — Job 1: add-product form (school dropdown, allow_notes, club shop redirect) */
import { strict as assert } from 'node:assert';
import { productParams, WHERE, formHtml } from '../js/category-page-admin.js';

let pass = 0, fail = 0;
function test(label, fn) {
  try { fn(); console.log('  ✓', label); pass++; }
  catch (e) { console.error('  ✗', label, '\n   ', e.message); fail++; }
}

console.log('\nadd-product-flow tests\n');

// WHERE list
test('WHERE includes clubshop', () => assert.ok(WHERE.some(w => w[0] === 'clubshop')));
test('WHERE includes gifts', () => assert.ok(WHERE.some(w => w[0] === 'gifts')));
test('WHERE has 5 entries', () => assert.equal(WHERE.length, 5));

// productParams — valid cases
test('workwear item sets page_key', () => {
  const p = productParams({ where: 'workwear', name: 'Hi-Vis Jacket', price: '29.99' });
  assert.equal(p.p_page_key, 'workwear');
  assert.equal(p.p_is_school_item, false);
});
test('school item sets is_school_item and category', () => {
  const p = productParams({ where: 'school', name: 'Sweatshirt', price: '14', category: 'Lingfield Primary' });
  assert.equal(p.p_is_school_item, true);
  assert.equal(p.p_category, 'Lingfield Primary');
  assert.equal(p.p_page_key, null);
});
test('gifts item', () => {
  const p = productParams({ where: 'gifts', name: 'Mug', price: '8' });
  assert.equal(p.p_page_key, 'gifts');
});
test('sportswear item', () => {
  const p = productParams({ where: 'sportswear', name: 'PE Kit', price: '12.50' });
  assert.equal(p.p_page_key, 'sportswear');
});

// allow_notes
test('allow_notes false by default', () => {
  const p = productParams({ where: 'workwear', name: 'Polo', price: '10' });
  assert.equal(p.p_allow_notes, false);
});
test('allow_notes true when set', () => {
  const p = productParams({ where: 'gifts', name: 'Mug', price: '8', allow_notes: true });
  assert.equal(p.p_allow_notes, true);
});
test('allow_notes coerces truthy', () => {
  const p = productParams({ where: 'workwear', name: 'Polo', price: '10', allow_notes: 1 });
  assert.equal(p.p_allow_notes, true);
});

// club shop redirect
test('productParams throws on clubshop', () => {
  assert.throws(() => productParams({ where: 'clubshop', name: 'x', price: '5' }), /club shops tab/i);
});

// validation errors
test('throws when no where', () => {
  assert.throws(() => productParams({ where: 'unknown', name: 'x', price: '5' }), /where/i);
});
test('throws when no name', () => {
  assert.throws(() => productParams({ where: 'workwear', name: '', price: '5' }), /name/i);
});
test('throws when price zero', () => {
  assert.throws(() => productParams({ where: 'workwear', name: 'x', price: '0' }), /price/i);
});
test('throws when price negative', () => {
  assert.throws(() => productParams({ where: 'workwear', name: 'x', price: '-1' }), /price/i);
});
test('throws when price empty', () => {
  assert.throws(() => productParams({ where: 'gifts', name: 'x', price: '' }), /price/i);
});

// formHtml
test('formHtml workwear has 5 destination chips', () => {
  const h = formHtml('workwear', {});
  const matches = (h.match(/data-ca="where"/g) || []).length;
  assert.equal(matches, 5);
});
test('formHtml school with schools shows select', () => {
  const h = formHtml('school', { schools: ['Lingfield', 'Eldon Grove'] });
  assert.ok(h.includes('<select data-ca="category">'));
  assert.ok(h.includes('Lingfield'));
});
test('formHtml school without schools shows input', () => {
  const h = formHtml('school', {});
  assert.ok(h.includes('input data-ca="category"') || h.includes('<input data-ca="category"'));
});
test('formHtml clubshop shows redirect message not form fields', () => {
  const h = formHtml('clubshop', {});
  assert.ok(h.includes('Club shops'));
  assert.ok(!h.includes('data-ca="name"'));
});
test('formHtml has allow_notes toggle', () => {
  const h = formHtml('workwear', {});
  assert.ok(h.includes('data-ca="allow_notes"'));
});
test('formHtml escapes school names', () => {
  const h = formHtml('school', { schools: ['<script>bad</script>'] });
  assert.ok(!h.includes('<script>'));
});

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
