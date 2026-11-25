/* ================================================================
   admin-pages-editor.js  v1.0.0 — Editor, picker and section editor
   Companion to admin-pages.js  Error codes: PSP-31x
   ================================================================ */
'use strict';

function pgEditorHtml() {
  if (pgBusy) return '<div class="pg-editor"><div class="pg-loading">Loading sections…</div></div>';
  var isLive = pgPage.status === 'live';
  var secHtml = pgSecs.length
    ? pgSecs.map(function(s, i) {
        return (
          '<div class="pg-sec-row">' +
            '<span class="pg-sec-type">' + hx((PG_TYPES[s.type] || {}).label || s.type) + '</span>' +
            '<div class="pg-sec-actions">' +
              (i > 0 ? '<button class="pg-icon-btn" onclick="pgMoveUp(' + i + ')" aria-label="Move up">↑</button>' : '<span class="pg-icon-gap"></span>') +
              (i < pgSecs.length - 1 ? '<button class="pg-icon-btn" onclick="pgMoveDown(' + i + ')" aria-label="Move down">↓</button>' : '<span class="pg-icon-gap"></span>') +
              '<button class="pg-icon-btn" onclick="pgEditSec(' + i + ')">Edit</button>' +
              '<button class="pg-icon-btn pg-del-btn" onclick="pgDelSec(' + i + ')" aria-label="Delete">✕</button>' +
            '</div>' +
          '</div>'
        );
      }).join('')
    : '<div class="pg-no-secs">No sections yet — add one below</div>';
  return (
    '<div class="pg-editor">' +
      '<div class="pg-editor-head">' +
        '<button class="pg-back" onclick="pgGoList()">&larr; Pages</button>' +
        '<span class="pg-status-pill">● ' + (isLive ? 'Live' : 'Draft') + '</span>' +
      '</div>' +
      '<h2 class="pg-editor-title">' + hx(pgPage.title) + '</h2>' +
      '<div class="pg-secs">' + secHtml + '</div>' +
      '<button class="btn-solid pg-add-btn" onclick="pgGoPickSec()">+ Add section</button>' +
      '<div class="pg-editor-bar">' +
        '<button class="ghost" onclick="pgSaveDraft()">Save draft</button>' +
        (isLive
          ? '<button class="btn-solid" style="background:#9B3B1E" onclick="pgUnpublish()">Unpublish</button>'
          : '<button class="btn-solid" onclick="pgPublish()">Publish</button>'
        ) +
      '</div>' +
    '</div>'
  );
}

function pgPickerHtml() {
  return (
    '<div class="pg-wrap">' +
      '<button class="pg-back" onclick="pgView=\'editor\';pgRender()">&larr; Back</button>' +
      '<h3 style="margin:0 0 16px;font-family:var(--display)">Add a section</h3>' +
      '<div class="pg-type-grid">' +
        Object.keys(PG_TYPES).map(function(k) {
          var v = PG_TYPES[k];
          return (
            '<button class="pg-type-card" onclick="pgPickType(\'' + k + '\')">' +
              '<span class="pg-type-emoji">' + v.emoji + '</span>' +
              '<strong>' + hx(v.label) + '</strong>' +
              '<span class="pg-type-desc">' + hx(v.desc) + '</span>' +
            '</button>'
          );
        }).join('') +
      '</div>' +
    '</div>'
  );
}

function pgSectionHtml() {
  var s = pgSec, c = s.content || {}, f = '';
  if (s.type === 'hero') {
    f = field('Heading', 'sf-h', 'text', c.heading) +
        field('Subheading', 'sf-sh', 'text', c.subheading) +
        field('Button text', 'sf-bt', 'text', c.btn_text) +
        field('Button link', 'sf-bl', 'url', c.btn_link, 'https://…') +
        '<div class="fld"><label>Background colour</label><input id="sf-bg" type="color" value="' + hx(c.bg || '#FBF5EE') + '" style="height:44px;width:80px"></div>';
  } else if (s.type === 'text') {
    f = field('Heading', 'sf-h', 'text', c.heading) + ta('Body text', 'sf-b', c.body, 5);
  } else if (s.type === 'image_text') {
    f = field('Heading', 'sf-h', 'text', c.heading) +
        ta('Body text', 'sf-b', c.body, 4) +
        field('Image URL', 'sf-img', 'url', c.img_url, 'https://…') +
        '<div class="fld"><label>Image side</label><select id="sf-is" style="font-size:16px;min-height:44px"><option value="left"' + (c.img_side !== 'right' ? ' selected' : '') + '>Left</option><option value="right"' + (c.img_side === 'right' ? ' selected' : '') + '>Right</option></select></div>';
  } else if (s.type === 'product_grid') {
    f = field('Heading', 'sf-h', 'text', c.heading) +
        field('Subtitle', 'sf-sh', 'text', c.subheading) +
        '<p class="pg-hint">Products are pulled from your Square catalog automatically.</p>';
  } else if (s.type === 'contact') {
    f = field('Heading', 'sf-h', 'text', c.heading || 'Get in touch') +
        field('Subheading', 'sf-sh', 'text', c.subheading) +
        '<p class="pg-hint">The contact form sends enquiries to your email automatically.</p>';
  } else if (s.type === 'testimonials') {
    var items = Array.isArray(c.items) ? c.items.map(function(i) { return i.name + ' — ' + i.quote; }).join('\n') : '';
    f = field('Heading', 'sf-h', 'text', c.heading || 'What our customers say') +
        ta('Reviews (one per line: Name — Quote)', 'sf-it', items, 6);
  }
  return (
    '<div class="pg-wrap">' +
      '<button class="pg-back" onclick="pgView=\'editor\';pgRender()">&larr; Back</button>' +
      '<div class="newcard">' +
        '<h3 style="margin:0 0 20px;font-family:var(--display)">' + hx((PG_TYPES[s.type] || {}).label || s.type) + '</h3>' +
        f +
        '<div class="notice" id="pg-se"></div>' +
        '<div style="display:flex;gap:8px;margin-top:16px">' +
          '<button class="btn-solid" style="flex:1" onclick="pgSaveSec()">Save section</button>' +
          '<button class="ghost" onclick="pgView=\'editor\';pgRender()">Cancel</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

function field(label, id, type, val, ph) {
  return '<div class="fld"><label for="' + id + '">' + hx(label) + '</label>' +
    '<input id="' + id + '" type="' + (type || 'text') + '" value="' + hx(val || '') + '"' + (ph ? ' placeholder="' + hx(ph) + '"' : '') + ' style="font-size:16px"></div>';
}
function ta(label, id, val, rows) {
  return '<div class="fld"><label for="' + id + '">' + hx(label) + '</label>' +
    '<textarea id="' + id + '" rows="' + (rows || 4) + '" style="font-size:16px">' + hx(val || '') + '</textarea></div>';
}

function pgReadFields() {
  var g = function(id) { var e = document.getElementById(id); return e ? e.value : ''; };
  var s = pgSec;
  if      (s.type === 'hero')        { s.content = { heading: g('sf-h'), subheading: g('sf-sh'), btn_text: g('sf-bt'), btn_link: g('sf-bl'), bg: g('sf-bg') || '#FBF5EE' }; }
  else if (s.type === 'text')        { s.content = { heading: g('sf-h'), body: g('sf-b') }; }
  else if (s.type === 'image_text')  { s.content = { heading: g('sf-h'), body: g('sf-b'), img_url: g('sf-img'), img_side: g('sf-is') || 'left' }; }
  else if (s.type === 'product_grid'){ s.content = { heading: g('sf-h'), subheading: g('sf-sh') }; }
  else if (s.type === 'contact')     { s.content = { heading: g('sf-h'), subheading: g('sf-sh') }; }
  else if (s.type === 'testimonials'){
    var lines = g('sf-it').split('\n').filter(function(l) { return l.trim(); });
    s.content = { heading: g('sf-h'), items: lines.map(function(l) { var p = l.split(' — '); return { name: (p[0] || '').trim(), quote: p.slice(1).join(' — ').trim() }; }) };
  }
}

function pgGoPickSec() { pgView = 'picker'; pgRender(); }
function pgPickType(type) { pgSec = { type: type, position: pgSecs.length, content: {} }; pgView = 'section'; pgRender(); }
function pgEditSec(idx) { pgSec = Object.assign({}, pgSecs[idx]); pgView = 'section'; pgRender(); }

async function pgDelSec(idx) {
  var s = pgSecs[idx];
  if (!confirm('Remove this ' + ((PG_TYPES[s.type] || {}).label || 'section') + '?')) return;
  try {
    if (s.id) await pgApi.delSec(s.id);
    pgSecs.splice(idx, 1);
    await pgReindex();
    pgRender(); toast('Section removed');
  } catch (e) { toast('PSP-310 ' + e.message); }
}

async function pgSaveSec() {
  pgReadFields();
  var notice = document.getElementById('pg-se');
  if (notice) { notice.className = 'notice show busy'; notice.textContent = 'Saving…'; }
  try {
    var rows = await pgApi.saveSec(pgSec);
    if (!pgSec.id) {
      var saved = Array.isArray(rows) ? rows[0] : rows;
      pgSec.id = saved.id;
      pgSecs.push(Object.assign({}, pgSec));
    } else {
      var idx = pgSecs.findIndex(function(s) { return s.id === pgSec.id; });
      if (idx >= 0) pgSecs[idx] = Object.assign({}, pgSec);
    }
    pgView = 'editor'; pgRender(); toast('Section saved ✓');
  } catch (e) {
    if (notice) { notice.className = 'notice show err'; notice.textContent = 'PSP-311 ' + e.message; }
  }
}

async function pgMoveUp(idx) {
  if (idx === 0) return;
  var tmp = pgSecs[idx]; pgSecs[idx] = pgSecs[idx - 1]; pgSecs[idx - 1] = tmp;
  await pgReindex(); pgRender();
}
async function pgMoveDown(idx) {
  if (idx >= pgSecs.length - 1) return;
  var tmp = pgSecs[idx]; pgSecs[idx] = pgSecs[idx + 1]; pgSecs[idx + 1] = tmp;
  await pgReindex(); pgRender();
}
async function pgReindex() {
  pgSecs.forEach(function(s, i) { s.position = i; });
  await Promise.all(pgSecs.filter(function(s) { return s.id; }).map(function(s) { return pgApi.saveSec(s).catch(function() {}); }));
}

async function pgSaveDraft() {
  try {
    await pgApi.upPage(pgPage.id, { status: 'draft', published: false });
    pgPage.status = 'draft';
    var p = pgAll.find(function(x) { return x.id === pgPage.id; }); if (p) p.status = 'draft';
    toast('Saved as draft'); pgRender();
  } catch (e) { toast('PSP-312 ' + e.message); }
}
async function pgPublish() {
  try {
    await pgApi.upPage(pgPage.id, { status: 'live', published: true });
    pgPage.status = 'live';
    var p = pgAll.find(function(x) { return x.id === pgPage.id; }); if (p) p.status = 'live';
    toast('Page published ✓'); pgRender();
  } catch (e) { toast('PSP-313 ' + e.message); }
}
async function pgUnpublish() {
  try {
    await pgApi.upPage(pgPage.id, { status: 'draft', published: false });
    pgPage.status = 'draft';
    var p = pgAll.find(function(x) { return x.id === pgPage.id; }); if (p) p.status = 'draft';
    toast('Page unpublished'); pgRender();
  } catch (e) { toast('PSP-314 ' + e.message); }
}