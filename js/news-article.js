/* news-article.js — single news article at /news-article.html?ref=<slug>.
   Reads ps_news (published=true) by slug.
   Error code: PS-N11. */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function bodyHtml(text) {
  if (!text) return '';
  // Plain paragraphs: split on double newlines, wrap each in <p>.
  return text.split(/\n{2,}/)
    .map(s => s.trim()).filter(Boolean)
    .map(s => '<p>' + esc(s.replace(/\n/g, ' ')) + '</p>')
    .join('');
}

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  const ref = params.get('ref') || '';
  const wrap = document.getElementById('article-wrap');
  const notFound = document.getElementById('article-not-found');

  if (!ref || !wrap) return;

  try {
    const rows = await sb('ps_news?select=*&published=eq.true&slug=eq.' + encodeURIComponent(ref), {}, 'PS-N11');
    const post = rows && rows[0];
    if (!post) {
      if (wrap) wrap.style.display = 'none';
      if (notFound) notFound.style.display = 'block';
      return;
    }
    // Update page title and meta
    document.title = esc(post.title) + ' — Peach State';
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.content = post.excerpt || post.title;

    wrap.innerHTML = `
      <div class="wrap">
        <a class="link" href="news.html" style="font-size:14px">&larr; Back to news</a>
        <div style="margin-top:20px">
          <span class="news-tag">${esc(post.tag)}</span>
          <span class="news-date" style="margin-left:12px">${fmtDate(post.published_at)}</span>
        </div>
        <h1 class="display-lg" style="margin-top:16px;max-width:20ch">${esc(post.title)}</h1>
      </div>
      ${post.photo_url ? `<div class="article-photo"><img src="${esc(post.photo_url)}" alt="" loading="lazy"></div>` : ''}
      <div class="wrap article-body">
        ${bodyHtml(post.body)}
        ${post.external_url ? `<div style="margin-top:28px"><a class="link" href="${esc(post.external_url)}" target="_blank" rel="noopener">Read the original article <span class="arrow">&rarr;</span></a></div>` : ''}
        <div style="margin-top:48px;padding-top:24px;border-top:1px solid var(--line)">
          <a class="link" href="news.html">&larr; Back to news</a>
        </div>
      </div>`;
  } catch (e) {
    if (wrap) wrap.innerHTML = '<div class="wrap"><p class="body dim">Could not load this article. Please try again shortly.</p></div>';
  }
});
