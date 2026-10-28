/* ============================================================
   site-edit.js — everything on the site is editable, not just the
   text that happens to sit in a page's own HTML.

   What this adds on top of inline-edit.js:
   - sitewide values (header, footer, nav, phone, address, opening
     hours, logos) saved under the page "global" so one edit shows on
     every page. Keys: site_*, img_site_*, lnk_site_*.
   - the saved value is applied for EVERY visitor (that is how an edit
     goes live); editing it is for the signed-in admin only.
   - form hint text (placeholders) and dropdown choices.
   - where a link goes (lnk_<key>), page title + search description
     (meta_title / meta_desc), reveal of hidden messages.
   - psAuditEditable(): lists anything on the page that is NOT editable.
     The completeness check runs this on every page.

   All saves go through the existing PIN-gated ps_admin_save_content RPC;
   this file only re-routes site-wide keys to page "global" (see the
   adminRpc wrapper below) so undo/redo works for them too.
   Error codes: PS-420 (site edit)
   ============================================================ */

const PSE = (() => {
  const SITE_RE = /^(img_|lnk_)?site_/;
  const isSite = k => SITE_RE.test(k);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pageNow = () => (typeof PSL !== "undefined" && PSL.page) || "";
  const META_DEF = {};
  let chipTimer = null;

  /* ---------- styles for the bits this file adds ---------- */
  const st = document.createElement("style");
  st.textContent = `
  .ps-pop{position:fixed;inset:0;z-index:100000;background:rgba(40,30,25,.45);display:flex;align-items:center;justify-content:center;padding:16px}
  .ps-pop-card{background:#FBF5EE;color:#2b2420;border-radius:14px;padding:22px;width:min(460px,100%);max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);font-family:Jost,system-ui,sans-serif}
  .ps-pop-card h3{margin:0 0 6px;font-family:Fraunces,serif;font-size:22px;font-weight:500}
  .ps-pop-card p{margin:0 0 14px;font-size:14px;opacity:.75}
  .ps-pop-card label{display:block;font-size:13px;margin-top:12px;letter-spacing:.02em}
  .ps-pop-card input,.ps-pop-card textarea{display:block;width:100%;margin-top:6px;padding:11px 12px;border:1px solid #cdbfb2;border-radius:8px;font:inherit;font-size:16px;background:#fff;color:inherit}
  .ps-pop-row{display:flex;gap:10px;justify-content:flex-end;margin-top:18px}
  .ps-pop-row button{padding:11px 18px;border-radius:999px;border:1px solid #2b2420;background:transparent;color:inherit;font:inherit;font-size:15px;cursor:pointer}
  .ps-pop-row button.go{background:#c0603f;border-color:#c0603f;color:#fff}
  .ps-chip{position:absolute;z-index:99990;background:#2b2420;color:#fff;border:0;border-radius:999px;padding:8px 14px;font:500 13px Jost,system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25)}
  .ps-editbar .ps-ebtn{margin-left:8px;background:transparent;color:inherit;border:1px solid currentColor;border-radius:999px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}
  .ps-editbar .ps-ebtn.on{background:rgba(255,255,255,.25)}
  body.ps-edit-on input:not([type=checkbox]):not([type=radio]),body.ps-edit-on textarea,body.ps-edit-on select{outline:1px dashed rgba(192,96,63,.7);outline-offset:2px;cursor:pointer}
  body.ps-reveal [style*="display:none"]:not([hidden]):not(.ps-bar):not(.ps-pop){display:block!important}
  body.ps-reveal [style*="display: none"]:not([hidden]):not(.ps-bar):not(.ps-pop){display:block!important}
  body.ps-reveal .health,body.ps-reveal .notice{display:block!important;opacity:1!important}
  `;
  document.head.appendChild(st);

  /* ---------- a small dialog used for hints, choices, links, page title ---------- */
  function pop(title, fields, onSave, note) {
    document.querySelector(".ps-pop")?.remove();
    const wrap = document.createElement("div");
    wrap.className = "ps-pop";
    wrap.innerHTML = '<div class="ps-pop-card" role="dialog" aria-label="' + esc(title) + '"><h3>' + esc(title) + '</h3>' +
      (note ? '<p>' + esc(note) + '</p>' : "") +
      fields.map((f, i) => '<label>' + esc(f.label) + (f.multiline ? '<textarea data-i="' + i + '" rows="3"></textarea>' : '<input data-i="' + i + '" type="text">') + '</label>').join("") +
      '<div class="ps-pop-row"><button type="button" data-x="cancel">Cancel</button><button type="button" data-x="save" class="go">Save</button></div></div>';
    document.body.appendChild(wrap);
    wrap.querySelectorAll("[data-i]").forEach(el => { el.value = fields[+el.dataset.i].value || ""; });
    wrap.querySelector("input,textarea")?.focus();
    wrap.addEventListener("click", async e => {
      if (e.target === wrap) { wrap.remove(); return; }
      const x = e.target.closest("[data-x]");
      if (!x) return;
      if (x.dataset.x === "cancel") { wrap.remove(); return; }
      const vals = [...wrap.querySelectorAll("[data-i]")].map(el => el.value.trim());
      x.disabled = true;
      try { await onSave(vals); wrap.remove(); psToast("Saved · live now"); }
      catch (err) { console.error("PS-420", err); x.disabled = false; psToast("Couldn’t save that — try again"); }
    });
  }
  const save = async (key, val) => { await saveContent(pageNow(), key, val); CONTENT[key] = val; };

  /* ---------- sitewide cache + brand/hours/logos ---------- */
  function cacheSite() {
    const c = {};
    Object.keys(CONTENT).forEach(k => { if (/^(site_|img_site_)/.test(k)) c[k] = CONTENT[k]; });
    if (Object.keys(c).length) saveSiteCache(Object.assign({}, siteCache(), c));
  }
  function tagBrand() {
    document.querySelectorAll("[data-brand]").forEach(el => { if (!el.dataset.edit) el.dataset.edit = "site_brand_" + el.dataset.brand; });
  }

  /* ---------- page title + search description ---------- */
  function captureMeta() {
    META_DEF.title = document.title;
    META_DEF.desc = document.querySelector('meta[name="description"]')?.getAttribute("content") || "";
  }
  const setMeta = (sel, v) => document.querySelector(sel)?.setAttribute("content", v);
  function applyMeta() {
    const t = CONTENT.meta_title, d = CONTENT.meta_desc;
    if (t) { document.title = t; setMeta('meta[property="og:title"]', t); setMeta('meta[name="twitter:title"]', t); }
    if (d) { setMeta('meta[name="description"]', d); setMeta('meta[property="og:description"]', d); setMeta('meta[name="twitter:description"]', d); }
  }
  function openMeta() {
    pop("Page title and description", [
      { label: "Page title (browser tab and Google)", value: document.title },
      { label: "Search description (the grey text under the title on Google)", value: document.querySelector('meta[name="description"]')?.getAttribute("content") || "", multiline: true }
    ], async vals => {
      if (vals[0] && vals[0] !== document.title) await save("meta_title", vals[0]);
      const cur = document.querySelector('meta[name="description"]')?.getAttribute("content") || "";
      if (vals[1] && vals[1] !== cur) await save("meta_desc", vals[1]);
      applyMeta();
    }, "This page only. Google picks changes up; WhatsApp and Facebook link previews can take longer to update.");
  }

  /* ---------- where a link goes ---------- */
  const safeHref = v => !!v && !/^\s*(javascript|data|vbscript):/i.test(v) &&
    /^(https?:\/\/|mailto:|tel:|#|\/|[a-z0-9._\-\/]+(\.html?)?(#[\w\-]*)?(\?[\w=&\-]*)?$)/i.test(v.trim());
  function applyLinks() {
    document.querySelectorAll("[data-edit]").forEach(el => {
      const a = el.closest("a[href]");
      if (!a || a.hasAttribute("data-brand-href")) return;
      const v = CONTENT["lnk_" + el.dataset.edit];
      if (v && safeHref(v)) a.setAttribute("href", v.trim());
    });
  }
  function linkDialog(el, a) {
    const key = el.dataset.edit;
    pop("Where should this link go?", [{ label: "Link address", value: a.getAttribute("href") }], async vals => {
      if (!safeHref(vals[0])) throw new Error("bad link");
      await save("lnk_" + key, vals[0]);
      applyLinks();
    }, "A page name like contact.html, a full web address, mailto:you@example.com or tel:01429866266.");
  }
  function chipOff() { clearTimeout(chipTimer); document.querySelector(".ps-chip")?.remove(); }
  function chip(el) {
    chipOff();
    const a = el.closest("a[href]");
    if (!a || a.hasAttribute("data-brand-href") || a.closest(".ps-bar,.ps-editbar")) return;
    const r = el.getBoundingClientRect();
    const c = document.createElement("button");
    c.type = "button"; c.className = "ps-chip"; c.textContent = "Change where this link goes";
    c.style.top = (window.scrollY + r.bottom + 6) + "px";
    c.style.left = Math.max(8, window.scrollX + r.left) + "px";
    c.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); chipOff(); linkDialog(el, a); });
    document.body.appendChild(c);
    chipTimer = setTimeout(chipOff, 9000);
  }

  /* ---------- form hints and dropdown choices ---------- */
  const ctlKey = el => el.id || el.name || ("c" + [...document.querySelectorAll("input,textarea,select")].indexOf(el));
  function applyForm() {
    document.querySelectorAll("input,textarea").forEach(el => { const v = CONTENT["ph_" + ctlKey(el)]; if (v) el.setAttribute("placeholder", v); });
    document.querySelectorAll("select").forEach(s => {
      const b = ctlKey(s);
      [...s.options].forEach((o, i) => { const v = CONTENT["opt_" + b + "_" + i]; if (v) o.textContent = v; });
    });
  }
  function editControl(el) {
    const base = ctlKey(el);
    if (el.tagName === "SELECT") {
      const opts = [...el.options];
      pop("Edit the choices", opts.map((o, i) => ({ label: "Choice " + (i + 1), value: o.textContent })), async vals => {
        for (let i = 0; i < vals.length; i++) if (vals[i] && vals[i] !== opts[i].textContent) await save("opt_" + base + "_" + i, vals[i]);
        applyForm();
      }, "Wording only — what each choice does stays the same.");
      return;
    }
    if (["checkbox", "radio", "file", "submit", "button", "hidden"].includes(el.type)) return;
    pop("Edit the hint inside this box", [{ label: "Hint text (the grey words shown before someone types)", value: el.getAttribute("placeholder") || "" }], async vals => {
      if (vals[0]) await save("ph_" + base, vals[0]);
      applyForm();
    });
  }

  /* ---------- reveal messages that are normally hidden ---------- */
  function toggleReveal(btn) {
    const on = document.body.classList.toggle("ps-reveal");
    btn?.classList.toggle("on", on);
  }

  /* ---------- after any saved value: keep the live page + cache in step ---------- */
  function syncHref(el, val) {
    const a = el.closest("a[href^='mailto:'],a[href^='tel:']");
    if (!a || a.hasAttribute("data-brand-href")) return;
    if (a.getAttribute("href").startsWith("mailto:") && /@/.test(val)) a.setAttribute("href", "mailto:" + val.trim());
    else if (a.getAttribute("href").startsWith("tel:") && /\d/.test(val)) a.setAttribute("href", telLink(val));
  }
  function afterSave(key, val) {
    if (key === "_layout") return;
    CONTENT[key] = val;
    if (/^(site_|img_site_)/.test(key)) { const c = Object.assign({}, siteCache()); c[key] = val; saveSiteCache(c); }
    if (key.startsWith("site_brand_")) {
      const f = key.slice(11);
      BRAND[f] = val;
      if (f === "phone") BRAND.phoneLink = telLink(val);
      applyBrandToDom();
      injectLocalBusinessSchema();
    }
    const h = key.match(/^site_hours_(\d+)_(d|t)$/);
    if (h && BRAND.hours[+h[1]]) { BRAND.hours[+h[1]][h[2] === "d" ? 0 : 1] = val; injectLocalBusinessSchema(); }
    if (key.startsWith("img_")) {
      document.querySelectorAll('[data-img="' + key.slice(4) + '"]').forEach(i => { i.src = val + (val.includes("?") ? "&" : "?") + "v=" + Date.now(); });
    } else if (!key.startsWith("lnk_") && !key.startsWith("meta_") && !key.startsWith("ph_") && !key.startsWith("opt_")) {
      document.querySelectorAll('[data-edit="' + key + '"]').forEach(el => {
        if (!el.classList.contains("ps-active") && el.textContent !== val) el.textContent = val;
        syncHref(el, val);
      });
    }
    if (key.startsWith("meta_")) applyMeta();
    if (key.startsWith("lnk_")) applyLinks();
    if (key.startsWith("ph_") || key.startsWith("opt_")) applyForm();
  }

  /* ---------- start-up: wraps applyContent (see bottom of file) ---------- */
  function boot() {
    captureMeta();
    cacheSite();
    syncBrand();
    if (document.getElementById("site-header")) renderHeader();
    if (document.getElementById("site-footer")) renderFooter();
    renderHours();
    applyBrandToDom();
    injectLocalBusinessSchema();
    tagBrand();
  }
  function after() {          // runs once inline-edit has tagged everything
    applyMeta();
    applyLinks();
    applyForm();
  }

  /* ---------- completeness check ----------
     Everything visible on the page must be reachable by the editor:
     text (data-edit), photos (data-img), form hints/choices (control
     dialog), page title (meta dialog). Returns what is NOT. */
  function audit() {
    const SKIP = ".ps-bar,.ps-edit-toggle,.ps-editbar,.ps-pin-pop,.ps-toast,.ps-pop,.ps-chip,.ps-movetab,script,style,noscript,svg,option,textarea,select";
    const missing = []; let total = 0, ok = 0;
    const where = n => { const p = n.closest("section,header,footer,nav,div") || n; return (p.id ? "#" + p.id : p.className ? "." + String(p.className).split(" ")[0] : p.tagName.toLowerCase()); };
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode, p = n.parentElement, t = n.nodeValue.trim();
      if (!p || !t || !/[A-Za-z0-9£]/.test(t) || p.closest(SKIP)) continue;
      total++;
      if (p.closest("[data-edit]")) ok++; else missing.push({ type: "text", text: t.slice(0, 70), where: where(p) });
    }
    document.querySelectorAll("img").forEach(i => {
      if (i.closest(SKIP)) return;
      total++;
      if (i.closest("[data-img]") || i.hasAttribute("data-img")) ok++; else missing.push({ type: "image", text: (i.getAttribute("src") || "").slice(0, 70), where: where(i) });
    });
    document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]),textarea,select").forEach(c => { if (!c.closest(".ps-bar,.ps-pop")) { total++; ok++; } });  // editable via editControl
    return { page: pageNow(), total, ok, missing };
  }
  window.psAuditEditable = audit;

  return { boot, after, afterSave, pop, chip, chipOff, editControl, openMeta, toggleReveal, isSite, audit };
})();

/* Site-wide values are stored under page "global" no matter which page Jo
   is on, and after every save the live page + cache are brought in step.
   Wrapping adminRpc (not saveContent) means every path is covered: a
   direct edit, undo and redo all end up here. */
if (typeof adminRpc === "function") {
  const _psRpc = adminRpc;
  adminRpc = async function (rpc, params, code) {
    const site = rpc === "ps_admin_save_content" && params && PSE.isSite(params.p_ckey);
    const p = site ? Object.assign({}, params, { p_page: "global" }) : params;
    const r = await _psRpc.call(this, rpc, p, code);
    if (rpc === "ps_admin_save_content" && params) PSE.afterSave(params.p_ckey, params.p_value);
    return r;
  };
}

if (typeof applyContent === "function") {
  const _psPrevApply = applyContent;
  applyContent = function () {
    PSE.boot();
    const r = _psPrevApply.apply(this, arguments);
    PSE.after();
    return r;
  };
}
