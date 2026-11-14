/* admin-news.js — News tab in the admin dashboard.
   Jo can list all posts (published + draft), write a new post,
   toggle publish and delete. Error codes: PS-N20 to PS-N24.
   Never call admin routes without the PIN: failed calls trip the lockout. */

const escN = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const getNewsPin = () => { try { return sessionStorage.getItem('ps_admin_pin') || ''; } catch (e) { return ''; } };
const newsRpc = (name, params) => adminRpc(name, params, 'PS-N20');

function toSlug(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) +
    '-' + Date.now().toString(36);
}

function fmtDateN(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

let newsPosts = [];

async function loadNews() {
  try { newsPosts = (await newsRpc('ps_admin_list_news', {})) || []; }
  catch (e) { newsPosts = []; }
}

function renderNewsAdmin(panel) {
  panel.innerHTML = `
    <div class="list" style="padding-bottom:0">
      <div class="newcard" id="news-form-wrap">
        <h2 style="font-family:var(--display);font-size:20px;margin:0 0 16px">New post</h2>
        <label style="display:block;margin-bottom:10px">Title<br>
          <input id="nw-title" type="text" style="width:100%;min-height:44px;font-size:16px" placeholder="e.g. Peach State in the Hartlepool Mail"></label>
        <label style="display:block;margin-bottom:10px">Article or note<br>
          <textarea id="nw-body" rows="5" style="width:100%;font-size:16px" placeholder="Write the article here, or leave blank for a press link only."></textarea></label>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">
          <label style="flex:1">Type<br><select id="nw-tag" style="width:100%;min-height:44px;font-size:16px">
            <option value="News">News</option><option value="Press">Press</option></select></label>
          <label style="flex:1">Date<br><input id="nw-date" type="date" style="width:100%;min-height:44px;font-size:16px"></label>
        </div>
        <label style="display:block;margin-bottom:10px">External press link (optional)<br>
          <input id="nw-url" type="url" style="width:100%;min-height:44px;font-size:16px" placeholder="https://"></label>
        <label style="display:block;margin-bottom:10px">Photo URL (optional)<br>
          <input id="nw-photo" type="url" style="width:100%;min-height:44px;font-size:16px" placeholder="https://"></label>
        <label style="display:flex;gap:10px;align-items:center;min-height:44px;margin-bottom:14px">
          <input id="nw-pub" type="checkbox" style="width:20px;height:20px">
          <span style="font-size:15px">Publish immediately</span></label>
        <div class="notice" id="nw-note" style="display:none"></div>
        <button class="btn-solid" style="width:100%" id="nw-save" onclick="saveNewsPost()">Save post</button>
      </div>
      <h3 style="font-family:var(--display);font-size:19px;margin:28px 20px 10px">All posts</h3>
      <div id="news-admin-list"></div>
    </div>`;
  renderNewsAdminList();
}

function renderNewsAdminList() {
  const el = document.getElementById('news-admin-list');
  if (!el) return;
  if (!newsPosts.length) { el.innerHTML = '<p style="padding:0 20px;color:var(--text-muted)">No posts yet.</p>'; return; }
  el.innerHTML = newsPosts.map(p => `
    <div class="orow">
      <div class="orow-top">
        <span class="oref">${escN(p.title)}</span>
        <span class="otime">${fmtDateN(p.published_at)}</span>
      </div>
      <div class="ometa">${escN(p.tag)} &middot; ${p.published ? 'Published' : '<span style="color:var(--terracotta)">Draft</span>'}</div>
      <div class="oact">
        <button onclick="toggleNewsPublish('${escN(p.id)}', ${!p.published})">${p.published ? 'Unpublish' : 'Publish'}</button>
        <button class="ghost" onclick="deleteNewsPost('${escN(p.id)}', ${JSON.stringify(escN(p.title))})">Delete</button>
        <a class="ghost btn" href="news-article.html?ref=${escN(p.slug)}" target="_blank" style="display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border:1px solid var(--line);font-size:14px;font-weight:600">View</a>
      </div>
    </div>`).join('');
}

window.saveNewsPost = async function () {
  const title = (document.getElementById('nw-title')?.value || '').trim();
  const body = (document.getElementById('nw-body')?.value || '').trim();
  const tag = document.getElementById('nw-tag')?.value || 'News';
  const dateVal = document.getElementById('nw-date')?.value || '';
  const url = (document.getElementById('nw-url')?.value || '').trim();
  const photo = (document.getElementById('nw-photo')?.value || '').trim();
  const pub = document.getElementById('nw-pub')?.checked || false;
  const note = document.getElementById('nw-note');
  const btn = document.getElementById('nw-save');
  if (!title) { note.style.display='block'; note.className='notice show err'; note.textContent='Add a title first.'; return; }
  note.style.display='block'; note.className='notice show'; note.textContent='Saving…';
  btn.disabled = true;
  try {
    await newsRpc('ps_admin_create_news', {
      p_slug: toSlug(title), p_title: title, p_body: body || null, p_excerpt: null,
      p_photo_url: photo || null, p_external_url: url || null, p_tag: tag,
      p_published: pub, p_published_at: dateVal ? new Date(dateVal).toISOString() : null
    });
    note.className='notice show ok'; note.textContent='Post saved.';
    document.getElementById('nw-title').value='';
    document.getElementById('nw-body').value='';
    document.getElementById('nw-url').value='';
    document.getElementById('nw-photo').value='';
    document.getElementById('nw-pub').checked=false;
    await loadNews(); renderNewsAdminList();
  } catch (e) { note.className='notice show err'; note.textContent='Could not save post (PS-N21).'; }
  btn.disabled = false;
};

window.toggleNewsPublish = async function (id, pub) {
  try {
    await newsRpc('ps_admin_update_news', { p_id: id, p_published: pub });
    await loadNews(); renderNewsAdminList();
  } catch (e) { if (typeof toast === 'function') toast('Could not update post (PS-N22)'); }
};

window.deleteNewsPost = async function (id, title) {
  if (!confirm('Delete "' + title + '"? This cannot be undone.')) return;
  try {
    await newsRpc('ps_admin_delete_news', { p_id: id });
    await loadNews(); renderNewsAdminList();
    if (typeof toast === 'function') toast('Post deleted');
  } catch (e) { if (typeof toast === 'function') toast('Could not delete post (PS-N23)'); }
};

/* Called by setTab('news') in admin.js — same pattern as other admin panels. */
window.renderNewsTab = async function (panel) {
  renderNewsAdmin(panel);
  await loadNews();
  renderNewsAdminList();
  /* Pre-fill today's date */
  const dateEl = document.getElementById('nw-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);
};
