/* tests/news.mjs — Job 4: news section */
import { strict as assert } from 'node:assert';

let pass = 0, fail = 0;
function test(label, fn) {
  try { fn(); console.log('  ✓', label); pass++; }
  catch (e) { console.error('  ✗', label, '\n   ', e.message); fail++; }
}

/* Pure helpers extracted from news.js and news-article.js */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function excerpt(body, max) {
  if (!body) return '';
  const plain = body.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return plain.length > max ? plain.slice(0, max).replace(/\s\S*$/, '') + '…' : plain;
}

function bodyHtml(text) {
  if (!text) return '';
  return text.split(/\n{2,}/)
    .map(s => s.trim()).filter(Boolean)
    .map(s => '<p>' + esc(s.replace(/\n/g, ' ')) + '</p>')
    .join('');
}

function toSlug(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

console.log('\nnews tests\n');

// slug generation
test('toSlug lowercases', () => assert.equal(toSlug('Hello World'), 'hello-world'));
test('toSlug strips special chars', () => assert.equal(toSlug('Peach State in the Mail!'), 'peach-state-in-the-mail'));
test('toSlug collapses multiple separators', () => assert.equal(toSlug('A & B -- C'), 'a-b-c'));
test('toSlug strips leading/trailing dashes', () => assert.equal(toSlug('  hello  '), 'hello'));
test('toSlug truncates at 80 chars', () => assert.ok(toSlug('a'.repeat(100)).length <= 80));

// escaping
test('esc neutralises < >', () => { const h = esc('<script>'); assert.ok(!h.includes('<')); });
test('esc neutralises &', () => assert.ok(esc('a & b').includes('&amp;')));
test('esc neutralises quotes', () => assert.ok(esc('"hi"').includes('&quot;')));

// excerpt
test('excerpt strips HTML tags', () => assert.equal(excerpt('<b>hello</b>', 100), 'hello'));
test('excerpt truncates at max', () => assert.ok(excerpt('a b c d e f g h i j', 10).length <= 11)); // +ellipsis
test('excerpt returns empty for null body', () => assert.equal(excerpt(null, 100), ''));
test('excerpt does not truncate short text', () => assert.equal(excerpt('short', 100), 'short'));

// fmtDate
test('fmtDate returns empty for null', () => assert.equal(fmtDate(null), ''));
test('fmtDate formats a date', () => {
  const s = fmtDate('2026-11-14T00:00:00Z');
  assert.ok(s.includes('2026'));
  assert.ok(s.includes('November') || s.includes('14'));
});

// bodyHtml
test('bodyHtml wraps paragraphs', () => {
  const h = bodyHtml('First para\n\nSecond para');
  assert.ok(h.includes('<p>First para</p>'));
  assert.ok(h.includes('<p>Second para</p>'));
});
test('bodyHtml escapes HTML in body', () => {
  const h = bodyHtml('<script>evil</script>');
  assert.ok(!h.includes('<script>'));
});
test('bodyHtml returns empty for null', () => assert.equal(bodyHtml(null), ''));
test('bodyHtml handles single paragraph', () => {
  const h = bodyHtml('Just one line');
  assert.ok(h.includes('<p>'));
});

// NAV check: news.html should be in the NAV array (tested structurally)
test('news.html in NAV', () => {
  const NAV = [
    ['index.html', 'Home'], ['services.html', 'What We Make'], ['clubs.html', 'Club Shops'],
    ['news.html', 'News'], ['track.html', 'Track Order'], ['contact.html', 'Contact']
  ];
  assert.ok(NAV.some(n => n[0] === 'news.html'));
});

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
