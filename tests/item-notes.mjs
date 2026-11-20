/* tests/item-notes.mjs — Job 3: per-item personalisation notes */
import { strict as assert } from 'node:assert';

let pass = 0, fail = 0;
function test(label, fn) {
  try { fn(); console.log('  \u2713', label); pass++; }
  catch (e) { console.error('  \u2717', label, '\n   ', e.message); fail++; }
}

/* Pure-logic helpers extracted from category-page.js */
const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ENT[c]);
const money = n => '\u00a3' + (Math.round(Number(n || 0) * 100) / 100).toFixed(2);

class Basket {
  constructor() { this.lines = []; }
  add(product, { size = '', colour = '', qty = 1, note = '' } = {}) {
    if (!product || !(Number(product.price) > 0)) throw new Error('PS-710');
    qty = Math.max(1, Math.floor(Number(qty) || 1));
    const opts = [size, colour].filter(Boolean);
    const cleanNote = String(note || '').trim().slice(0, 200);
    const found = this.lines.find(l => l.id === product.id && l.opts.join('|') === opts.join('|') && (l.note || '') === cleanNote);
    if (found) found.qty += qty;
    else this.lines.push({ id: product.id, name: product.name, price: Number(product.price), opts, qty, size, colour, note: cleanNote });
    return this;
  }
  remove(i) { this.lines.splice(i, 1); return this; }
  get isEmpty() { return this.lines.length === 0; }
  get total() { return Math.round(this.lines.reduce((s, l) => s + Math.round(l.price * 100) * l.qty, 0)) / 100; }
  items() {
    return this.lines.map(l => ({
      product_id: l.id, qty: l.qty,
      size: l.size || undefined, colour: l.colour || undefined,
      note: l.note || undefined,
      name: l.name, price: l.price
    }));
  }
}

/* Pure-logic helpers from pricing.js */
const clean = s => String(s == null ? '' : s).replace(/[<>]/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
const ITEM_NOTE_MAX = 200;

function makeLabelWithNote(baseName, opts, note) {
  const baseLabel = `${baseName} (${opts.join(', ')})`.replace(' ()', '');
  const cleaned = note ? clean(String(note)).slice(0, ITEM_NOTE_MAX) : '';
  return baseLabel + (cleaned ? ` \u2014 Note: ${cleaned}` : '');
}

const PROD = { id: 'aaa-1', name: 'Mug', price: 8 };
const PROD2 = { id: 'bbb-2', name: 'Hoodie', price: 25 };

console.log('\nitem-notes tests\n');

// Basket.add with note
test('add stores note per line', () => {
  const b = new Basket();
  b.add(PROD, { note: 'Josh on front' });
  assert.equal(b.lines[0].note, 'Josh on front');
});
test('add trims whitespace from note', () => {
  const b = new Basket();
  b.add(PROD, { note: '  hello  ' });
  assert.equal(b.lines[0].note, 'hello');
});
test('add truncates note at 200 chars', () => {
  const b = new Basket();
  b.add(PROD, { note: 'x'.repeat(300) });
  assert.equal(b.lines[0].note.length, 200);
});
test('add stores empty string for no note', () => {
  const b = new Basket();
  b.add(PROD);
  assert.equal(b.lines[0].note, '');
});

// Same item + same opts + different note = separate lines
test('different notes produce separate lines', () => {
  const b = new Basket();
  b.add(PROD, { note: 'Alice' });
  b.add(PROD, { note: 'Bob' });
  assert.equal(b.lines.length, 2);
});
test('same note merges qty', () => {
  const b = new Basket();
  b.add(PROD, { note: 'Alice' });
  b.add(PROD, { note: 'Alice' });
  assert.equal(b.lines.length, 1);
  assert.equal(b.lines[0].qty, 2);
});
test('no-note items merge as before', () => {
  const b = new Basket();
  b.add(PROD);
  b.add(PROD);
  assert.equal(b.lines.length, 1);
  assert.equal(b.lines[0].qty, 2);
});

// Basket.items() includes note
test('items() includes note when set', () => {
  const b = new Basket();
  b.add(PROD, { note: 'Alice' });
  const items = b.items();
  assert.equal(items[0].note, 'Alice');
});
test('items() omits note key when empty', () => {
  const b = new Basket();
  b.add(PROD);
  const items = b.items();
  assert.equal(items[0].note, undefined);
});

// pricing.js: label with note
test('label includes note after em dash', () => {
  const label = makeLabelWithNote('Mug', [], 'Josh on front');
  assert.ok(label.includes('\u2014 Note: Josh on front'));
});
test('label has no note suffix when note empty', () => {
  const label = makeLabelWithNote('Mug', ['Navy'], '');
  assert.equal(label, 'Mug (Navy)');
});
test('note is stripped of HTML tags by clean()', () => {
  const label = makeLabelWithNote('Mug', [], '<b>bold</b>');
  assert.ok(!label.includes('<b>'));
  assert.ok(label.includes('bold'));
});
test('note is capped at 200 chars in label', () => {
  const label = makeLabelWithNote('Mug', [], 'a'.repeat(300));
  const noteStart = label.indexOf('\u2014 Note: ') + 8;
  assert.ok(label.slice(noteStart).length <= 200);
});
test('clean() removes control chars', () => {
  assert.equal(clean('hello\x00world'), 'hello world');
});

// escaping in note display (basket line)
test('esc prevents XSS in note display', () => {
  const note = '<img src=x onerror=alert(1)>';
  const html = esc(note);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
});

// Total is unaffected by notes
test('total unaffected by notes', () => {
  const b = new Basket();
  b.add(PROD, { note: 'Alice' });
  b.add(PROD, { note: 'Bob' });
  assert.equal(b.total, 16);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
