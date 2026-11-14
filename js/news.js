/* news.js — public news listing for /news.html.
   Reads ps_news (published=true, public RLS) ordered newest first.
   Each row links to /news-article.html?ref=<slug>.
   Error code: PS-N10. */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const money = () => {}; // unused, keeps linter quiet

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

function renderList(posts) {
  const grid = document.getElementById('news-grid');
  const empty = document.getElementById('news-empty');
  if (!posts || !posts.length) {
    if (grid) grid.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';
  grid.innerHTML = posts.map(p => {
    const url = 'news-article.html?ref=' + esc(p.slug);
    const ex = p.excerpt || excerpt(p.body, 140);
    return `<article class="news-card">
      ${p.photo_url ? `<a href="${url}" class="news-card-img" aria-hidden="true" tabindex="-1"><img loading="lazy" src="${esc(p.photo_url)}" alt=""></a>` : ''}
      <div class="news-card-body">
        <span class="news-tag">${esc(p.tag)}</span>
        <span class="news-date">${fmtDate(p.published_at)}</span>
        <h2><a href="${url}">${esc(p.title)}</a></h2>
        ${ex ? `<p>${esc(ex)}</p>` : ''}
        ${p.external_url ? `<a class="link" href="${esc(p.external_url)}" target="_blank" rel="noopener">Read more <span class="arrow">&rarr;</span></a>` : `<a class="link" href="${url}">Read more <span class="arrow">&rarr;</span></a>`}
      </div>
    </article>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', async () => {
  const grid = document.getElementById('news-grid');
  if (!grid) return;
  try {
    const posts = await sb('ps_news?select=*&published=eq.true&order=published_at.desc,created_at.desc', {}, 'PS-N10');
    renderList(posts || []);
  } catch (e) {
    if (grid) grid.innerHTML = '<p class="body dim">Could not load news. Please try again shortly.</p>';
  }
});
