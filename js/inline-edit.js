/* ============================================================
   inline-edit.js — Jo edits the real page, in place.

   Replaces the old admin.html "Wording" form: instead of a list of
   textareas somewhere else, every [data-edit] and [data-img]
   element on the page she's actually looking at becomes
   click-to-change, gated by the same PIN as admin.html. Text still
   lives in ps_content (js/api.js: loadContent/applyContent/
   saveContent); photos are the same table under page=<page>,
   ckey="img_<slot>" - and the R2 object is stored under
   "site/<page>/<slot>" too, so the same slot name reused on two
   pages (e.g. "folded" on both schools.html and services.html)
   doesn't overwrite each other.

   Call psInitInlineEditor(page) once, after loadContent()+applyContent()
   have run, from the bottom of each public page.

   EVERYTHING is editable. Auto-tagging (psAutoTag below) tags every
   visible piece of text and every photo that isn't already tagged,
   including header, footer, nav, form labels, buttons, notices,
   opening hours and contact details. The only things left alone are
   the editor's own controls, scripts/styles/icons, and punctuation-only
   glyphs (arrows, separators). Form hint text and dropdown choices,
   link targets and the page title are edited through the small dialogs
   in site-edit.js. Nothing is excluded in code without being listed in
   docs/EDITABLE-EXCLUSIONS.md.

   The editor bar (move / remove / add / undo) is loaded from the last
   lines of this file: js/editor-layout.js, editor-bar.js, editor-sheets.js,
   site-edit.js.
   Error codes: PS-407
   ============================================================ */

function psInitInlineEditor(page){
  // The editor is for a signed-in admin session only (Josh and Jo). Everyone else never sees the pill.
  // The real lock is still the staff PIN, which the server checks on every save.
  if (!psHasPin()) return;
  const toggle = document.createElement("div");
  toggle.className = "ps-edit-toggle";
  toggle.innerHTML = `<span>Edit this page</span><button class="ps-switch" aria-label="Toggle edit mode"></button>`;
  document.body.appendChild(toggle);
  toggle.querySelector("button").addEventListener("click", () => psToggleEdit(page));

  // Capture phase, so a button's own onclick (e.g. "Send enquiry") or a
  // link never fires while editing - the click is turned into an edit.
  document.addEventListener("click", (e) => {
    if (!document.body.classList.contains("ps-edit-on")) return;
    const t = e.target;
    if (t.closest(".ps-bar,.ps-movetab,.ps-edit-toggle,.ps-editbar,.ps-pin-pop,.ps-pop,.ps-chip,.ps-toast")) return;
    // remove-mode (tap anything to remove it) is handled by the editor bar
    if (document.querySelector('.ps-bar .ps-b[data-a="rm"].on')) return;
    const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    const editEl = t.closest("[data-edit]");
    const imgEl = t.closest("[data-img]");
    if (editEl) { stop(); psEditText(editEl, page); return; }
    if (imgEl) { stop(); psEditImage(imgEl, page); return; }
    const ctl = t.closest("input,textarea,select");
    if (ctl) { stop(); if (typeof PSE !== "undefined") PSE.editControl(ctl); return; }
    if (t.closest("a,button,label,summary,[onclick]")) stop();
  }, true);
  // Opened from the admin dashboard (Edit site tab): go straight into edit mode.
  if (/[?&]edit=1(&|$)/.test(location.search)) psEnterEdit(page);
}

function psHasPin(){
  try { return !!sessionStorage.getItem("ps_admin_pin"); } catch (e) { return false; }
}

async function psToggleEdit(page){
  if (document.body.classList.contains("ps-edit-on")) {
    psLeaveEdit();
    return;
  }
  if (psHasPin()) { psEnterEdit(page); return; }
  psShowPinPrompt(page);
}

function psShowPinPrompt(page){
  document.querySelector(".ps-pin-pop")?.remove();
  const pop = document.createElement("div");
  pop.className = "ps-pin-pop";
  pop.innerHTML = `
    <input type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="••••">
    <button>Unlock</button>
    <div class="ps-pin-err">That's not right — try again.</div>`;
  document.body.appendChild(pop);
  const input = pop.querySelector("input"), btn = pop.querySelector("button"), err = pop.querySelector(".ps-pin-err");
  input.focus();

  const submit = async () => {
    const pin = input.value.trim();
    btn.disabled = true;
    try {
      const res = await fetch("/api/admin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, rpc: "ping" })
      });
      if (res.ok) {
        try { sessionStorage.setItem("ps_admin_pin", pin); } catch (e) {}
        pop.remove();
        psEnterEdit(page);
        return;
      }
    } catch (e) { /* falls through to the error state below */ }
    err.classList.add("show");
    input.value = ""; input.focus();
    btn.disabled = false;
  };
  btn.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
}

function psEnterEdit(page){
  document.body.classList.add("ps-edit-on");
  const bar = document.createElement("div");
  bar.className = "ps-editbar";
  bar.id = "ps-editbar";
  bar.style.flexWrap = "wrap";
  bar.innerHTML = `<span>Editing peachstate.co.uk — changes go live as you save them. <a href="admin.html#editsite" style="color:inherit;text-decoration:underline;white-space:nowrap">Back to admin</a></span>
    <button class="ps-ebtn" id="ps-ebtn-meta">Page title</button>
    <button class="ps-ebtn" id="ps-ebtn-reveal">Show hidden messages</button>
    <button id="ps-editbar-done">Done editing</button>`;
  document.body.prepend(bar);
  bar.querySelector("#ps-editbar-done").addEventListener("click", psLeaveEdit);
  bar.querySelector("#ps-ebtn-meta").addEventListener("click", () => PSE.openMeta());
  bar.querySelector("#ps-ebtn-reveal").addEventListener("click", (e) => PSE.toggleReveal(e.currentTarget));
}
function psLeaveEdit(){
  document.body.classList.remove("ps-edit-on", "ps-reveal");
  document.querySelector(".ps-pop")?.remove();
  if (typeof PSE !== "undefined") PSE.chipOff();
  psRemoveBar();
}
function psRemoveBar(){ document.getElementById("ps-editbar")?.remove(); }

function psToast(msg){
  let t = document.querySelector(".ps-toast");
  if (!t) { t = document.createElement("div"); t.className = "ps-toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._psTimer);
  t._psTimer = setTimeout(() => t.classList.remove("show"), 2400);
}

/* ---------- text ---------- */

function psEditText(el, page){
  if (el.classList.contains("ps-active")) return; // already editing this one
  const key = el.dataset.edit;
  const before = el.textContent;
  el.classList.add("ps-active");
  el.contentEditable = "true";
  el.focus();
  // Best-effort "select all so typing replaces it" - not every browser
  // context implements execCommand, so click-to-edit must still work
  // without it.
  try { document.execCommand("selectAll", false, null); } catch (e) {}
  if (typeof PSE !== "undefined") PSE.chip(el);   // "Change where this link goes" when the text is a link

  const finish = async () => {
    el.removeEventListener("blur", finish);
    el.contentEditable = "false";
    el.classList.remove("ps-active");
    const after = el.textContent.trim();
    if (after === before.trim() || !after) { el.textContent = before; return; }
    try {
      await saveContent(page, key, after);
      CONTENT[key] = after;
      delete el.dataset.ph;
      psToast("Saved · live now");
    } catch (e) {
      el.textContent = before;
      psToast("Couldn't save that — try again");
    }
  };
  el.addEventListener("blur", finish);
}

/* ---------- photos ---------- */

function psEditImage(el, page){
  const slot = el.dataset.img;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/jpeg,image/png,image/webp";
  input.style.display = "none";
  document.body.appendChild(input);
  input.addEventListener("change", async () => {
    const file = input.files[0];
    input.remove();
    if (!file) return;
    const before = el.src;
    el.style.opacity = "0.5";
    try {
      let pin = null;
      try { pin = sessionStorage.getItem("ps_admin_pin"); } catch (e) {}
      // sitewide photos (logos) live under page "global" so they show on every page
      const upPage = (typeof PSE !== "undefined" && PSE.isSite("img_" + slot)) ? "global" : page;
      const form = new FormData();
      form.append("pin", pin || "");
      form.append("page", upPage);
      form.append("slot", slot);
      form.append("file", file);
      const res = await fetch("/api/site-photo", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "PS-407: upload failed");

      const url = data.photo_url + "?v=" + Date.now();
      await saveContent(page, "img_" + slot, data.photo_url);
      CONTENT["img_" + slot] = data.photo_url;
      el.src = url;
      psToast("Saved · live now");
    } catch (e) {
      el.src = before;
      psToast("Couldn't upload that photo");
    }
    el.style.opacity = "";
  });
  input.click();
}

/* ---------- auto-tagging: make everything on the page editable ----------

   Walks every text node in <body> and gives it a data-edit key, so Jo
   can click any wording on the page without anyone hand-tagging it.

   - Element with only text inside (h2, p, b, a...) -> that element is tagged.
   - Element with text mixed in with child elements (e.g. "A name
     changes<br><span class=italic>everything.</span>") -> each loose
     piece of text is wrapped in its own <span data-edit>, so editing it
     never flattens the italic/linebreak next to it. Leading/trailing
     spaces stay OUTSIDE the span so words don't run together after a save.
   - Buttons always get their text wrapped in a span (typing inside a
     <button> itself is unreliable in browsers).
   - Key = hash of the ORIGINAL text (+ "_2", "_3"... for repeats on the
     same page), so it stays stable between loads. Anything already
     hand-tagged ([data-edit]/[data-img]) is left alone - that includes
     header, footer, nav, hours and brand details, which are tagged by
     partials.js / site-edit.js with sitewide keys.
   - Every <img> that isn't already a [data-img] slot becomes one.
   - Left alone (the ONLY exclusions): the editor's own controls,
     script/style/svg, form-control internals (hints and dropdown choices
     are edited via site-edit.js), arrows, and text with no letters or
     digits in it (separators, brackets).

   Runs automatically just before applyContent() (see the wrapper below),
   so saved edits are applied to auto-tagged text too.
   ------------------------------------------------------------------ */

function psAutoTag(){
  if (document.body.dataset.psTagged) return;
  document.body.dataset.psTagged = "1";

  const SKIP = [
    "script", "style", "noscript", "svg", "select", "option", "textarea", "input",
    ".arrow", "[data-no-edit]",
    ".ps-edit-toggle", ".ps-editbar", ".ps-pin-pop", ".ps-toast", ".ps-bar", ".ps-pop", ".ps-chip"
  ].join(",");

  const seen = {};
  function keyFor(text){
    const t = text.trim().replace(/\s+/g, " ");
    let h = 5381;
    for (const c of t) h = ((h << 5) + h + c.charCodeAt(0)) | 0;
    const base = "t" + (h >>> 0).toString(36);
    seen[base] = (seen[base] || 0) + 1;
    return seen[base] > 1 ? base + "_" + seen[base] : base;
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach(n => {
    const raw = n.nodeValue;
    if (!raw || !raw.trim()) return;
    if (!/[A-Za-z0-9£]/.test(raw)) return;           // separators / glyphs only
    const p = n.parentElement;
    if (!p) return;
    if (p.closest(SKIP)) return;
    if (p.closest("[data-edit],[data-img]")) return;   // already tagged by hand (or by us)

    if (p.children.length === 0 && !p.matches("button,summary")) {   // pure-text element: tag it directly
      p.dataset.edit = keyFor(p.textContent);
      return;
    }

    const m = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);       // text mixed with child elements: wrap it
    const span = document.createElement("span");
    span.dataset.edit = keyFor(m[2]);
    span.textContent = m[2];
    const frag = document.createDocumentFragment();
    if (m[1]) frag.append(document.createTextNode(m[1]));
    frag.append(span);
    if (m[3]) frag.append(document.createTextNode(m[3]));
    n.replaceWith(frag);
  });

  // photos that were never given a slot
  const imgSeen = {};
  document.querySelectorAll("img").forEach(i => {
    if (i.hasAttribute("data-img") || i.closest("[data-img]")) return;
    if (i.closest(".ps-bar,.ps-edit-toggle,.ps-editbar,.ps-pop,.ps-pin-pop,.ps-toast,[data-no-edit]")) return;
    const src = (i.getAttribute("src") || "").split("?")[0];
    if (!src || src.startsWith("data:")) return;
    let h = 5381;
    for (const c of src) h = ((h << 5) + h + c.charCodeAt(0)) | 0;
    const base = "x" + (h >>> 0).toString(36);
    imgSeen[base] = (imgSeen[base] || 0) + 1;
    i.dataset.img = imgSeen[base] > 1 ? base + "-" + imgSeen[base] : base;
  });
}

/* Pages call applyContent() from their DOMContentLoaded handler; make
   sure auto-tagging happens first so saved edits land on every piece
   of text, not just the hand-tagged ones. */
if (typeof applyContent === "function") {
  const _psApplyContent = applyContent;
  applyContent = function(){ psAutoTag(); return _psApplyContent.apply(this, arguments); };
}

/* Editor modules: loaded right after this file, in order, so their
   wrappers around loadContent/applyContent/saveContent are in place
   before the page's DOMContentLoaded handler runs. site-edit.js goes
   last so its applyContent wrapper is the outermost. */
(function(){
  const v = "?v=0.9.1";
  document.write('<link rel="stylesheet" href="css/editor-bar.css' + v + '">');
  ["editor-layout", "editor-bar", "editor-sheets", "site-edit"].forEach(n =>
    document.write('<script src="js/' + n + '.js' + v + '"><\/script>'));
})();
