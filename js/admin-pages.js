/* ================================================================
   admin-pages.js  v1.0.0 — Page builder for Peach State Prints
   Tab: 'pages'   Error codes: PSP-30x
   ================================================================ */
'use strict';

/* ---- State ---- */
let pgView  = 'list',
    pgAll   = [],
    pgPage  = null,
    pgSecs  = [],
    pgSec   = null,
    pgBusy  = false;

/* ---- Section catalogue ---- */
const PG_TYPES = {
  hero:        { label: 'Hero banner',   emoji: '🖼',  desc: 'Large heading with call-to-action button' },
  text:        { label: 'Text block',    emoji: '📝', desc: 'Heading and body paragraph' },
  image_text:  { label: 'Image + text',  emoji: '🌅', desc: 'Side-by-side image and copy' },
  product_grid:{ label: 'Product grid',  emoji: '🛒',  desc: 'Grid of your products' },
  contact:     { label: 'Contact form',  emoji: '✉',  desc: 'Enquiry form with auto-email' },
  testimonials:{ label: 'Testimonials',  emoji: '💬', desc: 'Customer quotes and reviews' }
};

/* ---- Supabase REST helpers ---- */
const _SB = 'https://coiwwbroycaznkmhevde.supabase.co/rest/v1';
const _SK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvaXd3YnJveWNhem5rbWhldmRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzIwMjksImV4cCI6MjA5OTU0ODAyOX0.r-k8RjKqouqjekvEXSMKzJykKbtgpGLMZQXcXhAmRW8';
const _SH  = { 'apikey': _SK, 'Authorization': 'Bearer ' + _SK, 'Content-Type': 'application/json' };

async function _get(t, q) {
  const r = await fetch(_SB + '/' + t + '?' + (q || ''), { headers: _SH });
  if (!r.ok) throw new Error('PSP-301 ' + r.status);
  return r.json();
}
async function _post(t, b) {
  const r = await fetch(_SB + '/' + t, { method: 'POST', headers: { ..._SH, Prefer: 'return=representation' }, body: JSON.stringify(b) });
  if (!r.ok) throw new Error('PSP-302 ' + r.status);
  return r.json();
}
async function _patch(t, q, b) {
  const r = await fetch(_SB + '/' + t + '?' + q, { method: 'PATCH', headers: { ..._SH, Prefer: 'return=representation' }, body: JSON.stringify(b) });
  if (!r.ok) throw new Error('PSP-303 ' + r.status);
  return r.json();
}
async function _del(t, q) {
  const r = await fetch(_SB + '/' + t + '?' + q, { method: 'DELETE', headers: _SH });
  if (!r.ok) throw new Error('PSP-304 ' + r.status);
}

/* ---- API ---- */
const pgApi = {
  pages:    ()        => _get('pages', 'select=*&order=created_at.asc'),
  sections: (pid)     => _get('page_sections', 'page_id=eq.' + pid + '&order=position.asc'),
  mkPage:   (t, s)    => _post('pages', { title: t, slug: s, status: 'draft', published: false }),
  upPage:   (id, p)   => _patch('pages', 'id=eq.' + id, { ...p, updated_at: new Date().toISOString() }),
  saveSec:  (s)       => s.id
    ? _patch('page_sections', 'id=eq.' + s.id, { type: s.type, content: s.content, position: s.position, updated_at: new Date().toISOString() })
    : _post('page_sections', { page_id: pgPage.id, type: s.type, content: s.content, position: s.position }),
  delSec:   (id)      => _del('page_sections', 'id=eq.' + id)
};

/* ---- Helpers ---- */
const pgSlug  = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const hx      = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pgBadge = s => '<span class="pg-badge pg-badge--' + (s || 'draft') + '">' + hx(s || 'draft') + '</span>';

/* ---- Screen 1: Pages list ---- */
function pgListHtml() {
  if (!pgAll.length) return (
    '<div class="pg-empty">' +
      '<p>No pages yet</p>' +
      '<button class="btn-solid" onclick="pgGoNew()">+ New page</button>' +
    '</div>'
  );
  return (
    '<div class="pg-wrap">' +
      '<div class="pg-list-head"><h2>Pages</h2>' +
        '<button class="btn-solid" onclick="pgGoNew()">+ New page</button></div>' +
      pgAll.map(p =>
        '<div class="pg-row">' +
          '<div class="pg-row-top"><span class="pg-row-title">' + hx(p.title) + '</span>' + pgBadge(p.status) + '</div>' +
          '<div class="pg-row-sub">/p/' + hx(p.slug) + '</div>' +
          '<div class="pg-row-actions">' +
            '<button class="btn-solid" onclick="pgGoEditorById(\'' + hx(p.id) + \')">Edit</button>' +
            '<a href="/p/' + hx(p.slug) + '" target="_blank" class="ghost" style="display:inline-flex;align-items:center;min-height:44px;padding:0 14px;text-decoration:none;border-radius:2px;font-weight:600;font-size:14px">Preview ↗</a>' +
          '</div>' +
        '</div>'
      ).join('') +
    '</div>'
  );
}

/* ---- Screen 2: New page form ---- */
function pgNewHtml() {
  return (
    '<div class="pg-wrap">' +
      '<button class="pg-back" onclick="pgGoList()">&larr; Pages</button>' +
      '<div class="newcard">' +
        '<h2 style="font-family:var(--display);margin:0 0 20px">New page</h2>' +
        '<div class="fld"><label for="pg-nt">Page title</label>' +
          '<input id="pg-nt" type="text" placeholder="e.g. Workwear" oninput="pgAutoSlug()" autocomplete="off" style="font-size:16px"></div>' +
        '<div class="fld"><label for="pg-ns">URL</label>' +
          '<input id="pg-ns" type="text" placeholder="workwear" autocomplete="off" autocapitalize="none" oninput="pgUrlHint()" style="font-size:16px"></div>' +
        '<p class="pg-hint" id="pg-uh">Will be live at: peachstate.co.uk/p/workwear</p>' +
        '<div class="notice" id="pg-ne"></div>' +
        '<button class="btn-solid" onclick="pgSubmitNew()" style="width:100%;margin-top:12px">Create page</button>' +
      '</div>' +
    '</div>'
  );
}

/* ---- Actions ---- */
function pgGoList()   { pgView = 'list'; pgPage = null; pgSecs = []; pgRender(); }
function pgGoNew()    { pgView = 'new'; pgRender(); setTimeout(function(){ var e=document.getElementById('pg-nt'); if(e)e.focus(); }, 60); }
function pgGoEditorById(id) { var p = pgAll.find(function(x){ return x.id===id; }); if (p) pgGoEditor(p); }

function pgGoEditor(page) {
  pgPage = page; pgView = 'editor'; pgSecs = []; pgBusy = true; pgRender();
  pgApi.sections(page.id).then(function(ss) { pgSecs = ss; pgBusy = false; pgRender(); })
    .catch(function(e) { pgBusy = false; toast('PSP-305 ' + e.message); });
}

function pgAutoSlug() {
  var t = document.getElementById('pg-nt'), s = document.getElementById('pg-ns');
  if (t && s) { s.value = pgSlug(t.value); pgUrlHint(); }
}
function pgUrlHint() {
  var h = document.getElementById('pg-uh'), s = document.getElementById('pg-ns');
  if (h && s) h.textContent = 'Will be live at: peachstate.co.uk/p/' + (pgSlug(s.value) || '…');
}

async function pgSubmitNew() {
  var title  = (document.getElementById('pg-nt') || {}).value.trim();
  var slug   = pgSlug((document.getElementById('pg-ns') || {}).value || title);
  var notice = document.getElementById('pg-ne');
  var err = function(m) { notice.className = 'notice show err'; notice.textContent = m; };
  if (!title)                            return err('Add a page title.');
  if (!slug)                             return err('Add a URL slug.');
  if (pgAll.find(function(p){ return p.slug === slug; })) return err('That URL is already used — try a different one.');
  notice.className = 'notice show busy'; notice.textContent = 'Creating…';
  try {
    var rows = await pgApi.mkPage(title, slug);
    var page = rows[0]; pgAll.push(page); pgGoEditor(page);
  } catch (e) { err('Could not create page (' + e.message + ')'); }
}

/* ---- Main render ---- */
function pgRender() {
  var stats = document.getElementById('stats'), panel = document.getElementById('panel');
  if (stats) stats.innerHTML = '';
  if (!panel) return;
  if      (pgView === 'list')    panel.innerHTML = pgListHtml();
  else if (pgView === 'new')     panel.innerHTML = pgNewHtml();
  else if (pgView === 'editor')  panel.innerHTML = pgEditorHtml();
  else if (pgView === 'picker')  panel.innerHTML = pgPickerHtml();
  else if (pgView === 'section') panel.innerHTML = pgSectionHtml();
}

/* ---- Hook into admin.js ---- */
(function () {
  if (typeof setTab !== 'function' || typeof render !== 'function') return;
  var _st = setTab;
  setTab = function (t) {
    _st.apply(this, arguments);
    if (t === 'pages') {
      pgView = 'list'; pgPage = null; pgSecs = [];
      pgApi.pages().then(function(ps) { pgAll = ps; if (tab === 'pages') pgRender(); })
        .catch(function() { pgAll = []; if (tab === 'pages') pgRender(); });
    }
  };
  var _rd = render;
  render = function () {
    if (tab === 'pages') { pgRender(); return; }
    _rd.apply(this, arguments);
  };
})();