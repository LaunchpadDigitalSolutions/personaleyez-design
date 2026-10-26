/* ============================================================
   editor-layout.js — the page's layout as data: section order,
   removed things, and sections/items Jo has added.

   Everything lives in ONE ps_content row per page (ckey "_layout",
   JSON). Nothing is ever deleted from the site: "removed" just hides,
   so it can always be restored. PSL.apply() makes the DOM match the
   layout and is safe to call any number of times.
   Error codes: PS-410 (layout save)
   ============================================================ */

const PSL = (() => {
  const SEC = "body > section, body > .fullbleed";
  let PAGE = "";
  let layout = { v: 1, order: [], removed: [], added: [], items: [] };
  const ORIG = {};                       // original wording / photo per key, for undo
  let baseOrder = [];                    // the order the page ships in (what an empty layout means)
  const uid = () => "n" + Math.random().toString(36).slice(2, 8);
  const sections = () => [...document.querySelectorAll(SEC)];
  const ids = () => sections().map(e => e.dataset.sec);
  const el = id => document.querySelector('[data-sec="' + id + '"]');

  /* ---------- brand templates (existing site classes only) ---------- */
  const BAND = { cream: "band-cream", peach: "band-peach", terra: "band-terra", sage: "band-sage" };
  function blockHtml(b) {
    const k = s => b.id + "_" + s;
    const band = BAND[b.c] || "band-cream";
    const lk = (b.c === "terra" || b.c === "sage") ? "link light" : "link";
    const A = 'data-sec="' + b.id + '" data-added="1"';
    const h = cls => '<h2 class="' + cls + '" style="margin-top:18px" data-edit="' + k("h") + '">Click to write a heading</h2>';
    const cta = '<a href="contact.html" class="' + lk + '" style="margin-top:30px"><span data-edit="' + k("cta") + '">Enquire</span> <span class="arrow">&rarr;</span></a>';
    const p = cls => '<p class="' + cls + '" style="margin-top:24px" data-edit="' + k("p") + '">Click to write a few lines about this.</p>';
    const row = n => '<li><b data-edit="' + k("k" + n) + '">Label</b><span data-edit="' + k("v" + n) + '">Value</span></li>';
    switch (b.t) {
      case "pair": return '<section class="sec ' + band + '" ' + A + '><div class="wrap"><div class="pair"><img loading="lazy" data-img="' + k("img") + '" src="" alt=""><div class="col-type"><span class="label" data-edit="' + k("label") + '">Label</span>' + h("display-md") + p("body") + cta + '</div></div></div></section>';
      case "center": return '<section class="sec ' + band + '" ' + A + '><div class="wrap-narrow" style="text-align:center">' + h("display-md") + p("body-lg") + '</div></section>';
      case "rows": return '<section class="sec ' + band + '" ' + A + '><div class="wrap-narrow">' + h("display-md") + '<ul class="dl">' + row(1) + row(2) + row(3) + '</ul></div></section>';
      case "photo": return '<div class="fullbleed" style="aspect-ratio:21/9" ' + A + '><img loading="lazy" data-img="' + k("img") + '" src="" alt=""></div>';
      case "quote": return '<section class="quote ' + band + '" ' + A + '><blockquote data-edit="' + k("q") + '">Click to write a quote</blockquote><cite data-edit="' + k("c") + '">Credit</cite></section>';
      case "cta": return '<section class="sec ' + band + '" ' + A + '><div class="wrap-narrow" style="text-align:center">' + h("display-md") + '<div style="display:flex;justify-content:center">' + cta + '</div></div></section>';
    }
    return "";
  }
  function itemHtml(it, band) {
    const k = s => it.id + "_" + s, lk = (band === "terra" || band === "sage") ? "link light" : "link";
    const D = 'data-item="' + it.id + '"';
    if (it.t === "p") return '<p class="body" style="margin-top:20px" ' + D + ' data-edit="' + k("p") + '">Click to write something</p>';
    if (it.t === "row") return '<li ' + D + '><b data-edit="' + k("k") + '">Label</b><span data-edit="' + k("v") + '">Value</span></li>';
    if (it.t === "btn") return '<a href="contact.html" class="' + lk + '" style="margin-top:24px" ' + D + '><span data-edit="' + k("b") + '">Enquire</span> <span class="arrow">&rarr;</span></a>';
    if (it.t === "img") return '<img loading="lazy" ' + D + ' data-img="' + k("img") + '" src="" alt="" style="width:100%;margin-top:20px">';
    return "";
  }
  const make = html => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };

  /* ---------- keep originals (for undo) and fill saved content ---------- */
  function capture(root) {
    root.querySelectorAll("[data-edit]").forEach(e => { if (!(e.dataset.edit in ORIG)) ORIG[e.dataset.edit] = e.textContent; });
    root.querySelectorAll("[data-img]").forEach(e => { const s = e.getAttribute("src"); if (s && !(("img_" + e.dataset.img) in ORIG)) ORIG["img_" + e.dataset.img] = s; });
  }
  function fill(root) {                   // apply saved text/photos to freshly built elements
    root.querySelectorAll("[data-edit]").forEach(e => {
      const v = CONTENT[e.dataset.edit];
      if (v != null && v !== "") { e.textContent = v; delete e.dataset.ph; }
    });
    root.querySelectorAll("[data-img]").forEach(e => { const v = CONTENT["img_" + e.dataset.img]; if (v) e.src = v; });
  }
  function markPlaceholders(root) {       // unedited placeholder text stays hidden from visitors
    root.querySelectorAll("[data-edit]").forEach(e => { if (!/_(cta|b)$/.test(e.dataset.edit)) e.dataset.ph = "1"; });
  }

  /* ---------- removed things ---------- */
  const unit = e => e.closest("li") || e.closest("a.link") || e;
  function resolve(ref) {
    const [t, v] = [ref.slice(0, 1), ref.slice(2)];
    if (t === "s") return el(v);
    if (t === "e") { const n = document.querySelector('[data-edit="' + v + '"]'); return n && unit(n); }
    if (t === "i") return document.querySelector('[data-img="' + v + '"]');
    return null;
  }
  function refFor(target) {
    const s = target.closest("[data-edit]"), i = target.closest("[data-img]");
    if (s) return "e:" + s.dataset.edit;
    if (i) return "i:" + i.dataset.img;
    return null;
  }
  function label(ref) {
    const n = resolve(ref); if (!n) return ref;
    if (ref[0] === "s") { const t = n.querySelector("h1,h2,h3,blockquote,.label"); return (t && t.textContent.trim().slice(0, 40)) || "Photo banner"; }
    return ref[0] === "i" ? "Photo" : (n.textContent.trim().slice(0, 40) || "Item");
  }

  /* ---------- make the DOM match the layout ---------- */
  function apply() {
    const all = sections();
    const anchor = all.length ? all[all.length - 1].nextSibling : null;
    const ref = document.querySelector("body > nav.mobilebar") || document.querySelector("body > footer") || anchor;
    layout.added.forEach(b => {                        // add missing blocks
      if (el(b.id)) return;
      const n = make(blockHtml(b)); if (!n) return;
      markPlaceholders(n); capture(n); fill(n);
      document.body.insertBefore(n, ref);
    });
    document.querySelectorAll("[data-added]").forEach(n => { if (!layout.added.some(b => b.id === n.dataset.sec)) n.remove(); });
    layout.items.forEach(it => {                       // items inside sections
      if (document.querySelector('[data-item="' + it.id + '"]')) return;
      const sec = el(it.sec); if (!sec) return;
      const band = Object.keys(BAND).find(c => sec.classList.contains(BAND[c]));
      const n = make(itemHtml(it, band)); if (!n) return;
      let host = it.t === "row" ? sec.querySelector("ul.dl") : [...sec.querySelectorAll(".col-type,.wrap-narrow,.wrap")].pop() || sec;
      if (!host) return;
      markPlaceholders(n); capture(n); fill(n); host.appendChild(n);
    });
    document.querySelectorAll("[data-item]").forEach(n => { if (!layout.items.some(i => i.id === n.dataset.item)) n.remove(); });
    {                                                  // order (an empty order means the shipped order)
      const cur = sections(), last = cur[cur.length - 1], after = last && last.nextSibling;
      const want = (layout.order.length ? layout.order : baseOrder).map(el).filter(Boolean);
      cur.filter(e => !want.includes(e)).forEach(e => want.push(e));
      want.forEach(e => document.body.insertBefore(e, after));
    }
    document.querySelectorAll("[data-ps-removed]").forEach(n => n.removeAttribute("data-ps-removed"));
    layout.removed.forEach(r => { const n = resolve(r); if (n) n.setAttribute("data-ps-removed", "1"); });
    if (typeof PSB !== "undefined") PSB.refresh();
  }

  /* ---------- changes (each returns true/false; callers record undo) ---------- */
  const visible = () => ids().filter(i => !layout.removed.includes("s:" + i));
  function move(id, dir) {
    const arr = ids(), vis = visible(), p = vis.indexOf(id), q = p + dir;
    if (p < 0 || q < 0 || q >= vis.length) return false;
    const a = arr.indexOf(vis[p]), b = arr.indexOf(vis[q]);
    [arr[a], arr[b]] = [arr[b], arr[a]]; layout.order = arr; return true;
  }
  const remove = ref => { if (!ref || layout.removed.includes(ref) || !resolve(ref)) return false; layout.removed.push(ref); return true; };
  const restore = ref => { const n = layout.removed.indexOf(ref); if (n < 0) return false; layout.removed.splice(n, 1); return true; };
  function addBlock(t, c, afterId) {
    const b = { id: uid(), t, c }; layout.added.push(b);
    const arr = ids(); const at = afterId && arr.includes(afterId) ? arr.indexOf(afterId) + 1 : arr.length;
    arr.splice(at, 0, b.id); layout.order = arr;
    apply(); return b.id;
  }
  function addItem(secId, t) {
    const sec = el(secId); if (!sec) return false;
    if (t === "row" && !sec.querySelector("ul.dl")) return false;
    const it = { id: uid(), sec: secId, t }; layout.items.push(it); apply(); return it.id;
  }
  const snap = () => JSON.stringify(layout);
  const restoreSnap = s => { layout = JSON.parse(s); apply(); };
  async function save() {
    const v = JSON.stringify(layout);
    await saveContent(PAGE, "_layout", v); CONTENT._layout = v;
  }

  /* ---------- start-up: runs from the wrapped applyContent() ---------- */
  function boot() {
    sections().forEach((e, i) => { if (!e.dataset.sec) e.dataset.sec = e.id || ("s" + i); });
    capture(document); baseOrder = ids();
    try { const o = JSON.parse(CONTENT._layout || ""); if (o && o.v === 1) layout = Object.assign(layout, o); } catch (e) { /* no saved layout yet */ }
    apply();
    if (typeof PSB !== "undefined") PSB.init();
  }

  return { boot, apply, snap, restoreSnap, save, move, remove, restore, addBlock, addItem, visible, ids, el, label, refFor, resolve,
           orig: ORIG, setPage: p => { PAGE = p; }, get page() { return PAGE; }, get removed() { return layout.removed; } };
})();

/* learn which page we're on, and make sure layout runs before text is applied */
if (typeof loadContent === "function") {
  const _psLoad = loadContent;
  loadContent = function (p) { PSL.setPage(p); return _psLoad.apply(this, arguments); };
}
if (typeof applyContent === "function") {
  const _psApply = applyContent;
  applyContent = function () { psAutoTag(); PSL.boot(); return _psApply.apply(this, arguments); };
}
