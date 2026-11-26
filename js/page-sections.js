/* ================================================================
   page-sections.js  v1.0.0 — Renders page_sections on public pages
   Loaded by page-shell.html   Error codes: PSP-32x
   ================================================================ */
(function () {
  'use strict';
  var slug = document.body.getAttribute('data-page');
  if (!slug) return;
  var SB  = 'https://coiwwbroycaznkmhevde.supabase.co/rest/v1';
  var SK  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvaXd3YnJveWNhem5rbWhldmRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzIwMjksImV4cCI6MjA5OTU0ODAyOX0.r-k8RjKqouqjekvEXSMKzJykKbtgpGLMZQXcXhAmRW8';
  var SH  = { apikey: SK, Authorization: 'Bearer ' + SK };
  async function run() {
    var wrap = document.getElementById('pg-sections');
    if (!wrap) return;
    try {
      var pr  = await fetch(SB + '/pages?slug=eq.' + encodeURIComponent(slug) + '&status=eq.live&select=id,title&limit=1', { headers: SH });
      var pgs = await pr.json();
      if (!pgs.length) { wrap.innerHTML = '<section class="sec"><div class="wrap"><p>Page not found</p></div></section>'; return; }
      document.title = pgs[0].title + ' — Peach State, Hartlepool';
      var sr   = await fetch(SB + '/page_sections?page_id=eq.' + pgs[0].id + '&order=position.asc', { headers: SH });
      var secs = await sr.json();
      wrap.innerHTML = secs.map(renderSec).join('');
    } catch (e) { console.error('PSP-320', e); }
  }
  function e(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function renderSec(s) {
    var c = s.content || {};
    switch (s.type) {
      case 'hero': return '<section class="sec" style="background:' + e(c.bg || '#FBF5EE') + '"><div class="wrap">' + (c.heading ? '<h1 class="display-lg" style="max-width:16ch">' + e(c.heading) + '</h1>' : '') + (c.subheading ? '<p class="body-lg" style="margin-top:20px">' + e(c.subheading) + '</p>' : '') + (c.btn_text && c.btn_link ? '<a href="' + e(c.btn_link) + '" class="btn-solid" style="margin-top:28px;display:inline-block">' + e(c.btn_text) + '</a>' : '') + '</div></section>';
      case 'text': return '<section class="sec"><div class="wrap">' + (c.heading ? '<h2 class="display-sm">' + e(c.heading) + '</h2>' : '') + (c.body ? '<p class="body-lg" style="margin-top:16px;white-space:pre-line">' + e(c.body) + '</p>' : '') + '</div></section>';
      case 'image_text': { var rev = c.img_side === 'right' ? 'row-reverse' : 'row'; return '<section class="sec"><div class="wrap"><div style="display:flex;gap:40px;flex-wrap:wrap;align-items:center;flex-direction:' + rev + '">' + (c.img_url ? '<img src="' + e(c.img_url) + '" alt="' + e(c.heading) + '" loading="lazy" style="width:min(100%,420px);border-radius:4px;object-fit:cover">' : '') + '<div style="flex:1;min-width:260px">' + (c.heading ? '<h2 class="display-sm">' + e(c.heading) + '</h2>' : '') + (c.body ? '<p class="body-lg" style="margin-top:14px;white-space:pre-line">' + e(c.body) + '</p>' : '') + '</div></div></div></section>'; }
      case 'product_grid': return '<section class="sec"><div class="wrap">' + (c.heading ? '<h2 class="display-sm">' + e(c.heading) + '</h2>' : '') + (c.subheading ? '<p class="body-lg" style="margin-top:14px">' + e(c.subheading) + '</p>' : '') + '<a href="/shop.html" class="btn-solid" style="margin-top:24px;display:inline-block">Browse products</a></div></section>';
      case 'contact': return '<section class="sec" id="contact"><div class="wrap">' + (c.heading ? '<h2 class="display-sm">' + e(c.heading) + '</h2>' : '') + (c.subheading ? '<p class="body-lg" style="margin-top:14px">' + e(c.subheading) + '</p>' : '') + '<div data-contact-form style="margin-top:28px"></div></div></section>';
      case 'testimonials': { var items = Array.isArray(c.items) ? c.items : []; return '<section class="sec"><div class="wrap">' + (c.heading ? '<h2 class="display-sm" style="margin-bottom:24px">' + e(c.heading) + '</h2>' : '') + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:20px">' + items.map(function(i){ return '<div style="background:#fff;padding:20px;border-radius:4px;border:1px solid var(--line)"><p style="font-style:italic;margin:0 0 12px">"' + e(i.quote) + '"</p><span style="font-weight:600;font-size:14px">' + e(i.name) + '</span></div>'; }).join('') + '</div></div></section>'; }
      default: return '';
    }
  }
  run();
})();