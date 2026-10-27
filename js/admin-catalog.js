/* ============================================================
   admin-catalog.js — the product Catalog, "Add from catalog" and
   "Duplicate this shop" on a club shop.

   A catalog product holds the master name, description, price, sizes,
   colours and photo. Adding it to a club shop LINKS it: the shop item
   shows the catalog's values, so editing the catalog updates every shop.
   A shop can override any field for itself (saving a value that matches
   the catalog keeps inheriting, so only real differences are overrides).

   "Needs a club logo photo" items are different: the catalog photo is
   never shown in a shop, because each club's logo differs. Each shop
   adds its own photo with one tap, and catalog edits never touch it.
   Duplicating a shop copies the links but never photos.

   Hooks into admin.js by wrapping render / load / setTab /
   renderGroupDetail, so admin.js itself stays untouched.
   Error codes: PS-31x
   ============================================================ */

let catalog = [], catalogLoaded = false, editingCatalog = undefined;   // undefined = list, null = new, object = editing

const catApi = {
  list: () => adminRpc("ps_admin_list_catalog", {}, "PS-310"),
  create: c => adminRpc("ps_admin_create_catalog_product", {
    p_name: c.name, p_description: c.description, p_price: c.price, p_sizes: c.sizes, p_colours: c.colours,
    p_needs_logo: c.needs_logo_photo, p_tag: c.tag
  }, "PS-311"),
  update: (id, c) => adminRpc("ps_admin_update_catalog_product", {
    p_id: id, p_name: c.name, p_description: c.description, p_price: c.price, p_sizes: c.sizes, p_colours: c.colours,
    p_image_url: c.image_url, p_needs_logo: c.needs_logo_photo, p_tag: c.tag
  }, "PS-312"),
  remove: id => adminRpc("ps_admin_delete_catalog_product", { p_id: id }, "PS-313"),
  addToShop: (groupId, ids) => adminRpc("ps_admin_add_catalog_to_group", { p_group_id: groupId, p_catalog_ids: ids }, "PS-316"),
  setPhoto: (id, url) => adminRpc("ps_admin_set_group_item_photo", { p_id: id, p_image_url: url }, "PS-318"),
  duplicate: (sourceId, name, slug, code) => adminRpc("ps_admin_duplicate_group", {
    p_source_id: sourceId, p_name: name, p_slug: slug, p_code: code
  }, "PS-317")
};

async function loadCatalog() {
  try { catalog = await catApi.list(); } catch (e) { catalog = []; }
  catalogLoaded = true;   // even on failure, so a broken call can't make the screen redraw forever
}
const plural = (n, word) => n + " " + word + (Number(n) === 1 ? "" : "s");

async function uploadItemPhoto(itemId, file) {
  const form = new FormData();
  let pin = null; try { pin = sessionStorage.getItem("ps_admin_pin"); } catch (e) {}
  form.append("pin", pin || ""); form.append("item_id", itemId); form.append("file", file); form.append("skip_square", "true");
  const res = await fetch("/api/product-photo", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "upload failed");
  return data.photo_url + "?v=" + Date.now();
}

/* ---------- Catalog tab ---------- */

function catThumb(c, size) {
  const s = size || 44;
  return c.image_url
    ? '<img src="' + attr(c.image_url) + '" alt="" style="width:' + s + 'px;height:' + s + 'px;border-radius:8px;object-fit:cover;flex:none">'
    : '<div style="width:' + s + 'px;height:' + s + 'px;border-radius:8px;background:var(--cream-deep);flex:none;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--muted);text-align:center">No photo</div>';
}
function catBadge(c) {
  return c.needs_logo_photo
    ? '<span style="font-size:11px;padding:2px 8px;border-radius:6px;background:#FBE9C8;color:#6B4A0E;display:inline-block;margin-top:4px">Logo item: photo per shop</span>'
    : '<span style="font-size:11px;padding:2px 8px;border-radius:6px;background:#DDEFD9;color:#245A1E;display:inline-block;margin-top:4px">Same photo everywhere</span>';
}

function renderCatalog(p) {
  if (editingCatalog !== undefined) { renderCatalogEdit(p); return; }
  p.innerHTML = `
    <div class="orow">
      <div class="oref">Catalog</div>
      <div class="ometa">Edit a product here and every shop using it updates.</div>
      <button class="btn-solid" onclick="newCatalogProduct()" style="margin-top:14px;width:100%">+ Add product</button>
    </div>
    ${!catalogLoaded ? `<p style="text-align:center;color:var(--muted);padding:30px 0">Loading…</p>`
      : catalog.length ? catalog.map(c => `
      <div class="orow">
        <div style="display:flex;gap:12px;align-items:center">
          ${catThumb(c)}
          <div style="flex:1;min-width:0">
            <div style="font-size:15px;font-weight:500">${esc(c.name)}</div>
            <div class="ometa" style="margin-top:2px">${c.price != null ? money(c.price) : "No price"}${c.sizes ? " · " + esc(c.sizes) : ""} · Used in ${plural(c.used_by, "shop")}${c.tag ? " · " + esc(c.tag) : ""}</div>
            ${catBadge(c)}
          </div>
        </div>
        <div class="oact"><button class="ghost" onclick="editCatalogProduct('${c.id}')">Edit</button></div>
      </div>`).join("")
      : `<p style="text-align:center;color:var(--muted);padding:40px 0">No products in the catalog yet.</p>`}`;
}

function newCatalogProduct() { editingCatalog = null; render(); }
function editCatalogProduct(id) { editingCatalog = catalog.find(c => c.id === id); render(); window.scrollTo(0, 0); }
function closeCatalogEdit() { editingCatalog = undefined; loadCatalog().then(render); }

function renderCatalogEdit(p) {
  const e = editingCatalog, isNew = !e;
  const tags = [...new Set(catalog.map(c => c.tag).filter(Boolean))];
  p.innerHTML = `
    <button class="ghost" onclick="closeCatalogEdit()"
      style="min-height:44px;padding:0 18px;border-radius:2px;background:var(--cream-deep);margin-bottom:16px">&larr; Catalog</button>
    <div class="newcard" id="cat-card">
      <h2 style="font-size:20px;font-family:var(--display)">${isNew ? "Add a product" : "Edit product"}</h2>
      ${isNew ? `<p style="font-size:13px;color:var(--muted);margin:6px 0 0">Save it first, then you can add its photo.</p>` : `
      <div style="display:flex;gap:12px;align-items:center;margin:12px 0">
        <div id="cat-img-preview">${catThumb(e, 64)}</div>
        <button type="button" class="ghost" onclick="$('cat-file').click()" id="cat-photo-btn">${e.image_url ? "Replace photo" : "Add photo"}</button>
        <input type="hidden" id="cat-img" value="${attr(e.image_url)}">
        <input type="file" id="cat-file" accept="image/jpeg,image/png,image/webp" style="display:none" onchange="onCatalogPhoto(event)">
      </div>`}
      <div class="fld"><label for="cat-name">Name</label>
        <input id="cat-name" type="text" placeholder="Dance leggings" autocomplete="off" value="${e ? attr(e.name) : ""}"></div>
      <div class="fld"><label for="cat-desc">Description (optional)</label>
        <input id="cat-desc" type="text" autocomplete="off" value="${e ? attr(e.description) : ""}"></div>
      <div class="fld"><label for="cat-price">Price (£)</label>
        <input id="cat-price" type="number" step="0.01" inputmode="decimal" autocomplete="off" value="${e && e.price != null ? e.price : ""}"></div>
      <div class="fld"><label for="cat-sizes">Sizes, comma separated (optional)</label>
        <input id="cat-sizes" type="text" placeholder="3-4, 5-6, 7-8, S, M, L" autocomplete="off" value="${e ? attr(e.sizes) : ""}"></div>
      <div class="fld"><label for="cat-cols">Colours, comma separated (optional)</label>
        <input id="cat-cols" type="text" placeholder="Black, Grey" autocomplete="off" value="${e ? attr(e.colours) : ""}"></div>
      <div class="fld"><label for="cat-tag">Group heading in shops (optional)</label>
        <input id="cat-tag" type="text" list="cat-tags" placeholder="Dance range" autocomplete="off" value="${e ? attr(e.tag) : ""}">
        <datalist id="cat-tags">${tags.map(t => `<option value="${attr(t)}">`).join("")}</datalist></div>
      <div class="fld" style="display:flex;justify-content:space-between;align-items:center;gap:12px;border-top:0.5px solid var(--line);padding-top:12px">
        <label for="cat-logo" style="margin:0">Needs a club logo photo
          <span class="hint" style="display:block">On: each shop adds its own photo. Off: every shop shows this photo.</span></label>
        <input id="cat-logo" type="checkbox" style="width:auto;min-height:auto" ${e && e.needs_logo_photo ? "checked" : ""}></div>
      ${!isNew && e.used_by ? `<div class="notice show ok" style="margin-top:8px">Saving updates this product in ${plural(e.used_by, "shop")}. Shops with their own price or photo keep it.</div>` : ""}
      <div class="notice" id="cat-notice"></div>
      <button class="btn-solid" id="cat-save" onclick="saveCatalogProduct()" style="margin-top:18px;width:100%">${isNew ? "Add product" : "Save changes"}</button>
      ${isNew ? "" : `<button class="ghost" onclick="deleteCatalogProduct()" style="margin-top:12px;width:100%">Delete this product</button>`}
    </div>`;
}

async function onCatalogPhoto(event) {
  const file = event.target.files[0], e = editingCatalog;
  event.target.value = "";
  if (!file || !e) return;
  const prev = $("cat-img-preview"), btn = $("cat-photo-btn"), before = prev.innerHTML;
  prev.textContent = "…"; btn.disabled = true;
  try {
    const url = await uploadItemPhoto(e.id, file);
    $("cat-img").value = url;
    prev.innerHTML = catThumb({ image_url: url }, 64);
    toast("Photo uploaded. Save changes to apply it.");
  } catch (err) { prev.innerHTML = before; toast("Couldn't upload that photo"); }
  btn.disabled = false;
}

function catForm() {
  const v = id => $(id).value.trim();
  return {
    name: v("cat-name"), description: v("cat-desc") || null, price: v("cat-price") ? Number(v("cat-price")) : null,
    sizes: v("cat-sizes") || null, colours: v("cat-cols") || null, tag: v("cat-tag") || null,
    needs_logo_photo: $("cat-logo").checked, image_url: $("cat-img") ? ($("cat-img").value || null) : null
  };
}

async function saveCatalogProduct() {
  const n = $("cat-notice"), btn = $("cat-save"), f = catForm(), isNew = !editingCatalog;
  if (!f.name) { n.className = "notice show err"; n.textContent = "Give the product a name."; return; }
  btn.disabled = true; n.className = "notice show busy"; n.textContent = "Saving…";
  try {
    if (isNew) {
      const c = await catApi.create(f);
      await loadCatalog();
      editingCatalog = catalog.find(x => x.id === c.id) || c;
      toast("Product added. Add its photo below.");
    } else {
      await catApi.update(editingCatalog.id, f);
      await loadCatalog();
      editingCatalog = undefined;
      toast("Saved. Shops using it are updated.");
    }
    render(); window.scrollTo(0, 0);
  } catch (e) { n.className = "notice show err"; n.textContent = "Couldn't save that (" + e.message + ")."; btn.disabled = false; }
}

async function deleteCatalogProduct() {
  const e = editingCatalog;
  if (!confirm("Delete " + e.name + " from the catalog? " + (e.used_by ? "It stays in the " + plural(e.used_by, "shop") + " that use it, as a normal item, with its current price and photo." : ""))) return;
  try { await catApi.remove(e.id); editingCatalog = undefined; await loadCatalog(); toast("Deleted"); render(); }
  catch (err) { toast("Couldn't delete that"); }
}

/* ---------- Club shop screen ---------- */

function suggestOpts() {
  const inShop = new Set(openGroupProducts.map(x => x.catalog_id).filter(Boolean));
  return catalog.filter(c => !inShop.has(c.id));
}

function shopToolsHtml() {
  const avail = suggestOpts(), tags = [...new Set(avail.map(c => c.tag).filter(Boolean))];
  const picks = !catalogLoaded ? `<p style="font-size:14px;color:var(--muted)">Loading the catalog…</p>`
    : !catalog.length ? `<p style="font-size:14px;color:var(--muted)">No catalog products yet.</p>
       <button class="ghost" onclick="setTab('catalog')" style="min-height:44px;margin-top:6px">Open the catalog</button>`
    : !avail.length ? `<p style="font-size:14px;color:var(--muted)">Everything in the catalog is already in this shop.</p>`
    : (tags.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 4px">${tags.map(t =>
        `<button class="ghost" style="min-height:36px;padding:0 12px;font-size:13px" onclick="pickCatalogTag('${attr(t).replace(/'/g, "&#39;")}')">All of ${esc(t)}</button>`).join("")}</div>` : "")
      + avail.map(c => `
      <div class="fld" style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <label for="ct-${c.id}" style="margin:0">${esc(c.name)} <span class="hint">${c.price != null ? money(c.price) : ""}${c.tag ? " · " + esc(c.tag) : ""}${c.needs_logo_photo ? " · needs club photo" : ""}</span></label>
        <input id="ct-${c.id}" class="ct-pick" data-tag="${attr(c.tag)}" type="checkbox" value="${c.id}" style="width:auto;min-height:auto"></div>`).join("");
  return `
    <div class="newcard" style="margin:18px 0" id="ct-card">
      <h2 style="font-size:19px;font-family:var(--display)">Add from catalog</h2>
      <p style="font-size:14px;color:var(--muted);margin:6px 0 0">Adds the product with its photo, sizes and price. Change it in the catalog and this shop updates too. Items already here are skipped.</p>
      ${picks}
      <div class="notice" id="ct-notice"></div>
      ${avail.length ? `<button class="btn-solid" id="ct-add" onclick="addCatalogToShop()" style="margin-top:14px">Add to this shop</button>` : ""}
    </div>
    <div class="newcard" style="margin:18px 0" id="dup-card">
      <h2 style="font-size:19px;font-family:var(--display)">Duplicate this shop</h2>
      <p style="font-size:14px;color:var(--muted);margin:6px 0 0">Copies all ${plural(openGroupProducts.length, "item")} into a new shop for another club, without their photos (those show this club's logo). Catalog photos still come through; add each logo item's photo afterwards. The new shop starts paused until you reactivate it.</p>
      <div class="fld"><label for="dup-name">New club or team name</label>
        <input id="dup-name" type="text" placeholder="Starlight Cheer" oninput="dupAutoSlug()" autocomplete="off"></div>
      <div class="fld"><label for="dup-slug">Web name</label>
        <input id="dup-slug" type="text" placeholder="starlight-cheer" autocomplete="off"></div>
      <div class="fld"><label for="dup-code">Access code</label>
        <input id="dup-code" type="text" style="text-transform:uppercase" autocomplete="off" value="${suggestCode()}"></div>
      <div class="notice" id="dup-notice"></div>
      <button class="btn-solid" id="dup-save" onclick="duplicateShop()" style="margin-top:18px">Duplicate shop</button>
    </div>`;
}

function pickCatalogTag(tag) { document.querySelectorAll(".ct-pick").forEach(x => { if (x.dataset.tag === tag) x.checked = true; }); }
function dupAutoSlug() { if ($("dup-slug")) $("dup-slug").value = slugify($("dup-name").value); }

function itemBadge(pr) {
  const chip = (txt, bg, fg) => '<span style="font-size:11px;padding:2px 8px;border-radius:6px;background:' + bg + ';color:' + fg + ';display:inline-block;margin-top:4px">' + txt + '</span>';
  if (!pr.catalog_id) return "";
  const own = pr.overrides || [];
  if (pr.needs_logo_photo && !pr.image_url) return chip("Needs club photo", "#FBE9C8", "#6B4A0E");
  if (own.length) return chip("From catalog, own " + own.map(k => k === "image_url" ? "photo" : k).join(" and "), "#DDEFD9", "#245A1E");
  return chip("From catalog", "#EEE6DC", "#5A4A3A");
}

function decorateGroupDetail(p) {
  if (!openGroup) return;
  const rows = [...p.querySelectorAll(".orow")];
  if (rows[0]) rows[0].insertAdjacentHTML("afterend", shopToolsHtml());
  rows.slice(1).forEach((row, i) => {
    const pr = openGroupProducts[i], meta = row.querySelector(".ometa");
    if (!pr) return;
    if (pr.range_name && meta) meta.insertAdjacentText("beforeend", " · " + pr.range_name);
    row.insertAdjacentHTML("afterbegin", '<div style="margin-bottom:10px">' + (pr.image_url
      ? '<img src="' + attr(pr.image_url) + '" alt="" style="width:56px;height:56px;border-radius:8px;object-fit:cover;display:block">'
      : '<div style="width:56px;height:56px;border-radius:8px;background:var(--cream-deep);display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--muted);text-align:center">No photo</div>') + '</div>');
    const badge = itemBadge(pr);
    if (badge && meta) meta.insertAdjacentHTML("afterend", '<div>' + badge + '</div>');
    const act = row.querySelector(".oact");
    if (act) {
      const ownPhoto = !pr.catalog_id || (pr.overrides || []).includes("image_url");
      const label = !pr.image_url ? "Add photo" : (pr.catalog_id && !ownPhoto ? "Use own photo" : "Replace photo");
      act.insertAdjacentHTML("afterbegin", '<button class="qp-btn' + (pr.image_url ? " ghost" : "") + '" onclick="quickPhoto(\'' + pr.id + '\')">' + label + '</button>');
      if (pr.catalog_id && !(pr.overrides || []).length) {
        const edit = [...act.querySelectorAll("button")].find(b => b.textContent.trim() === "Edit");
        if (edit) edit.textContent = "Override";
      }
    }
  });
  const missing = openGroupProducts.filter(x => !x.image_url).length, head = rows[0] && rows[0].querySelector(".ometa");
  if (head && openGroupProducts.length && missing)
    head.insertAdjacentHTML("beforeend", '<br><strong style="color:var(--terracotta)">' + missing + " of " + plural(openGroupProducts.length, "item") + " still need" + (missing === 1 ? "s" : "") + " a photo.</strong>");
  p.insertAdjacentHTML("beforeend", '<input type="file" id="qp-file" accept="image/jpeg,image/png,image/webp" style="display:none" onchange="onQuickPhoto(event)">');
  if (!catalogLoaded) loadCatalog().then(() => { if (tab === "groups" && openGroup) render(); });
}

let quickPhotoId = null;
function quickPhoto(id) { quickPhotoId = id; const f = $("qp-file"); if (f) f.click(); }

/* Uploads the photo and saves it on the shop item in one go. Stored under this item's own id, so one club's
   photo can never overwrite another club's. Only the photo is saved, so inheritance of everything else is untouched. */
async function onQuickPhoto(event) {
  const file = event.target.files[0], id = quickPhotoId, pr = openGroupProducts.find(x => x.id === id);
  event.target.value = "";
  if (!file || !pr) return;
  const btn = [...document.querySelectorAll(".qp-btn")].find(b => (b.getAttribute("onclick") || "").includes(id));
  const was = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Uploading…"; }
  try {
    const url = await uploadItemPhoto(id, file);
    await catApi.setPhoto(id, url);
    openGroupProducts = await listGroupProducts(openGroup.id);
    toast("Photo saved");
    render();
  } catch (e) {
    toast("Couldn't upload that photo");
    if (btn) { btn.disabled = false; btn.textContent = was; }
  }
}

async function addCatalogToShop() {
  const ids = [...document.querySelectorAll(".ct-pick:checked")].map(x => x.value);
  const n = $("ct-notice"), btn = $("ct-add");
  if (!ids.length) { n.className = "notice show err"; n.textContent = "Tick at least one product."; return; }
  btn.disabled = true; n.className = "notice show busy"; n.textContent = "Adding…";
  try {
    const r = await catApi.addToShop(openGroup.id, ids);
    openGroupProducts = await listGroupProducts(openGroup.id);
    loadCatalog();                                         // refresh the "used in" counts in the background
    toast(r.added ? "Added " + plural(r.added, "item") : "Nothing new to add");
    render();
    const logo = openGroupProducts.filter(x => x.needs_logo_photo && !x.image_url).length, n2 = $("ct-notice");
    if (n2 && r.added) {
      n2.className = "notice show ok";
      n2.textContent = plural(r.added, "item") + " added." + (logo ? " " + plural(logo, "logo item") + " need" + (logo === 1 ? "s" : "") + " a club photo: tap Add photo on each." : "");
    }
  } catch (e) { n.className = "notice show err"; n.textContent = "Couldn't add that (" + e.message + ")."; btn.disabled = false; }
}

async function duplicateShop() {
  const name = $("dup-name").value.trim(), slug = slugify($("dup-slug").value || name), code = $("dup-code").value.trim().toUpperCase();
  const n = $("dup-notice"), btn = $("dup-save");
  if (!name) { n.className = "notice show err"; n.textContent = "Give the new club a name."; return; }
  if (!code) { n.className = "notice show err"; n.textContent = "Set an access code."; return; }
  btn.disabled = true; n.className = "notice show busy"; n.textContent = "Copying…";
  try {
    const r = await catApi.duplicate(openGroup.id, name, slug, code);
    toast("Copied " + plural(r.products_copied, "item") + " - the new shop is paused");
    $("dup-name").value = ""; $("dup-slug").value = "";   // clear first so the auto-refresh guard lets go
    closeGroupPanel(); await load(); setTab("groups");
  } catch (e) {
    n.className = "notice show err"; n.textContent = "Couldn't copy that (" + e.message + "). The web name may already be taken.";
    btn.disabled = false;
  }
}

/* ---------- wiring into admin.js ---------- */
(function () {
  // The 30s auto-refresh must not redraw underneath someone part-way through one of these forms.
  const guarded = ["dup-name", "dup-slug", "cat-name", "cat-desc", "cat-price", "cat-sizes", "cat-cols", "cat-tag"];
  const hasUnsaved = () => guarded.some(id => { const el = $(id); return el && el.value && el.value.trim(); });

  const _load = load;
  load = function () { return hasUnsaved() ? Promise.resolve() : _load.apply(this, arguments); };

  const _render = render;
  render = function () {
    if (tab === "catalog") { const s = $("stats"); if (s) s.style.display = "none"; renderCatalog($("panel")); return; }
    return _render.apply(this, arguments);
  };

  const _renderGroupDetail = renderGroupDetail;
  renderGroupDetail = function (p) { _renderGroupDetail.call(this, p); decorateGroupDetail(p); };

  const _setTab = setTab;
  setTab = function (t) {
    _setTab.call(this, t);
    if (t === "catalog") { editingCatalog = undefined; loadCatalog().then(() => { if (tab === "catalog") render(); }); }
  };

  /* A refresh or "back" lands on #catalog: admin.js doesn't know that tab, so send it there. */
  if (location.hash === "#catalog") {
    let touched = false;
    document.addEventListener("pointerdown", e => { if (e.target.closest(".tab")) touched = true; }, true);
    const _setTab2 = setTab;
    setTab = function (t) { return _setTab2.call(this, !touched && t === "live" ? "catalog" : t); };
    let tries = 0;
    const go = () => {
      if (touched || tab === "catalog") return;
      const gate = document.getElementById("pingate");
      if (gate && getComputedStyle(gate).display !== "none") { if (++tries < 120) setTimeout(go, 250); return; }
      setTab("catalog");
    };
    document.addEventListener("DOMContentLoaded", () => setTimeout(go, 600));
  }
})();
