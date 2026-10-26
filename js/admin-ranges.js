/* ============================================================
   admin-ranges.js — Ranges (reusable product lists), plus "Add a range"
   and "Duplicate this shop" on a club shop.

   A range (e.g. "Dance range") is set up once in the Ranges tab. Adding
   it to a club shop COPIES its products into that shop, so each club can
   then change prices, sizes or photos without touching any other club.
   Items already in the shop are skipped, so adding twice is harmless.
   Duplicating a shop copies all its items to a new, paused shop.

   Hooks into admin.js by wrapping render / load / setTab /
   renderGroupDetail, so admin.js itself stays untouched.

   Note: names used in onclick="..." attributes must not clash with
   built-ins on document/window (createRange() is one - hence
   createNewRange below).
   Error codes: PS-31x
   ============================================================ */

let ranges = [], rangesLoaded = false, openRange = null, openRangeProducts = [], editingRangeProduct = null;

const rangeApi = {
  list: () => adminRpc("ps_admin_list_ranges", {}, "PS-310"),
  create: name => adminRpc("ps_admin_create_range", { p_name: name }, "PS-311"),
  remove: id => adminRpc("ps_admin_delete_range", { p_id: id }, "PS-311"),
  products: id => adminRpc("ps_admin_list_range_products", { p_range_id: id }, "PS-312"),
  addProduct: (rangeId, p, order) => adminRpc("ps_admin_create_range_product", {
    p_range_id: rangeId, p_name: p.name, p_description: p.description, p_price: p.price,
    p_sizes: p.sizes, p_colours: p.colours, p_image_url: null, p_sort_order: order
  }, "PS-313"),
  updateProduct: (id, p) => adminRpc("ps_admin_update_range_product", {
    p_id: id, p_name: p.name, p_description: p.description, p_price: p.price,
    p_sizes: p.sizes, p_colours: p.colours, p_image_url: p.image_url || null
  }, "PS-314"),
  removeProduct: id => adminRpc("ps_admin_delete_range_product", { p_id: id }, "PS-315"),
  addToShop: (groupId, rangeId) => adminRpc("ps_admin_add_range_to_group", { p_group_id: groupId, p_range_id: rangeId }, "PS-316"),
  duplicate: (sourceId, name, slug, code) => adminRpc("ps_admin_duplicate_group", {
    p_source_id: sourceId, p_name: name, p_slug: slug, p_code: code
  }, "PS-317")
};

async function loadRanges() {
  try { ranges = await rangeApi.list(); } catch (e) { ranges = []; }
  rangesLoaded = true;   // even on failure, so a broken call can't make the screen redraw forever
}
const plural = (n, word) => n + " " + word + (Number(n) === 1 ? "" : "s");

/* ---------- Ranges tab ---------- */

function renderRanges(p) {
  if (openRange) { renderRangeDetail(p); return; }
  p.innerHTML = `
    <div class="newcard" style="margin-bottom:18px">
      <h2 style="font-size:20px;font-family:var(--display)">Add a range</h2>
      <p style="font-size:14px;color:var(--muted);margin:6px 0 0">A range is a list of products you set up once, like your Dance range or Sublimation range. Then add it to any club shop in one tap.</p>
      <div class="fld"><label for="rg-name">Range name</label>
        <input id="rg-name" type="text" placeholder="Dance range" autocomplete="off"></div>
      <div class="notice" id="rg-notice"></div>
      <button class="btn-solid" id="rg-save" onclick="createNewRange()" style="margin-top:18px">Create range</button>
    </div>
    ${ranges.length ? ranges.map(r => `
      <div class="orow">
        <div class="orow-top"><span class="oref">${esc(r.name)}</span>
          <span class="otime">${plural(r.product_count, "product")}</span></div>
        <div class="ometa">Used by ${plural(r.used_by, "shop")}</div>
        <div class="oact"><button onclick="openRangePanel('${r.id}')">Open</button></div>
      </div>`).join("")
    : `<p style="text-align:center;color:var(--muted);padding:50px 0">No ranges yet.</p>`}`;
}

async function createNewRange() {
  const name = $("rg-name").value.trim(), n = $("rg-notice"), btn = $("rg-save");
  if (!name) { n.className = "notice show err"; n.textContent = "Give the range a name."; return; }
  btn.disabled = true; n.className = "notice show busy"; n.textContent = "Creating…";
  try {
    const r = await rangeApi.create(name);
    $("rg-name").value = "";
    await loadRanges();
    toast("Range created");
    await openRangePanel(r.id);
  } catch (e) {
    n.className = "notice show err"; n.textContent = "Couldn't create that (" + e.message + "). The name may already be used.";
    btn.disabled = false;
  }
}

async function openRangePanel(id) {
  openRange = ranges.find(r => r.id === id); editingRangeProduct = null;
  if (!openRange) return;
  try { openRangeProducts = await rangeApi.products(id); } catch (e) { openRangeProducts = []; }
  render();
}
function closeRangePanel() { openRange = null; openRangeProducts = []; editingRangeProduct = null; loadRanges().then(render); }

function renderRangeDetail(p) {
  const r = openRange, e = editingRangeProduct;
  p.innerHTML = `
    <button class="ghost" onclick="closeRangePanel()"
      style="min-height:44px;padding:0 18px;border-radius:2px;background:var(--cream-deep);margin-bottom:16px">&larr; All ranges</button>
    <div class="orow">
      <div class="orow-top"><span class="oref">${esc(r.name)}</span></div>
      <div class="ometa">Used by ${plural(r.used_by, "shop")}. Changing a product here doesn't change shops that already have it, so each club keeps its own prices and photos.</div>
    </div>
    <div class="newcard" style="margin:18px 0" id="rp-card">
      <h2 style="font-size:19px;font-family:var(--display)">${e ? "Edit product" : "Add a product"}</h2>
      <div class="fld"><label for="rp-name">Product name</label>
        <input id="rp-name" type="text" placeholder="Leggings" autocomplete="off" value="${e ? attr(e.name) : ""}"></div>
      <div class="fld"><label for="rp-desc">Description (optional)</label>
        <input id="rp-desc" type="text" autocomplete="off" value="${e ? attr(e.description) : ""}"></div>
      <div class="fld"><label for="rp-price">Price (£)</label>
        <input id="rp-price" type="number" step="0.01" inputmode="decimal" autocomplete="off" value="${e && e.price != null ? e.price : ""}"></div>
      <div class="fld"><label for="rp-sizes">Sizes, comma separated (optional)</label>
        <input id="rp-sizes" type="text" placeholder="3-4, 5-6, S, M, L" autocomplete="off" value="${e ? attr(e.sizes) : ""}"></div>
      <div class="fld"><label for="rp-cols">Colours, comma separated (optional)</label>
        <input id="rp-cols" type="text" placeholder="Black, Grey" autocomplete="off" value="${e ? attr(e.colours) : ""}"></div>
      <p style="font-size:13px;color:var(--muted);margin:10px 0 0">Photos are added in each club shop, because every club's branding is different.</p>
      <div class="notice" id="rp-notice"></div>
      <div style="display:flex;gap:10px;margin-top:18px">
        <button class="btn-solid" id="rp-save" onclick="saveRangeProduct()" style="flex:1">${e ? "Save changes" : "Add product"}</button>
        ${e ? `<button class="ghost" onclick="cancelEditRangeProduct()">Cancel</button>` : ""}
      </div>
    </div>
    ${openRangeProducts.length ? openRangeProducts.map(pr => `
      <div class="orow">
        <div class="orow-top"><span class="oref" style="font-size:15px">${esc(pr.name)}</span>
          <span class="otime">${pr.price != null ? money(pr.price) : "—"}</span></div>
        ${pr.description ? `<div class="odesc">${esc(pr.description)}</div>` : ""}
        <div class="ometa">${pr.sizes ? "Sizes: " + esc(pr.sizes) : ""}${pr.colours ? " · Colours: " + esc(pr.colours) : ""}</div>
        <div class="oact">
          <button class="ghost" onclick="editRangeProduct('${pr.id}')">Edit</button>
          <button class="ghost" onclick="removeRangeProduct('${pr.id}')">Remove</button>
        </div>
      </div>`).join("")
    : `<p style="text-align:center;color:var(--muted);padding:30px 0">No products in this range yet.</p>`}
    <div style="margin-top:24px"><button class="ghost" onclick="deleteRange()">Delete this range</button></div>`;
}

function editRangeProduct(id) {
  editingRangeProduct = openRangeProducts.find(x => x.id === id);
  render(); $("rp-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
}
function cancelEditRangeProduct() { editingRangeProduct = null; render(); }

async function saveRangeProduct() {
  const v = id => $(id).value.trim(), n = $("rp-notice"), btn = $("rp-save");
  if (!v("rp-name")) { n.className = "notice show err"; n.textContent = "Give the product a name."; return; }
  const payload = {
    name: v("rp-name"), description: v("rp-desc") || null, price: v("rp-price") ? Number(v("rp-price")) : null,
    sizes: v("rp-sizes") || null, colours: v("rp-cols") || null,
    image_url: editingRangeProduct ? editingRangeProduct.image_url : null
  };
  btn.disabled = true; n.className = "notice show busy"; n.textContent = "Saving…";
  try {
    if (editingRangeProduct) { await rangeApi.updateProduct(editingRangeProduct.id, payload); editingRangeProduct = null; toast("Product updated"); }
    else { await rangeApi.addProduct(openRange.id, payload, openRangeProducts.length); toast("Product added"); }
    openRangeProducts = await rangeApi.products(openRange.id);
    await loadRanges(); openRange = ranges.find(r => r.id === openRange.id) || openRange;
    render();
  } catch (e) { n.className = "notice show err"; n.textContent = "Couldn't save that (" + e.message + ")."; btn.disabled = false; }
}

async function removeRangeProduct(id) {
  try {
    await rangeApi.removeProduct(id);
    openRangeProducts = await rangeApi.products(openRange.id);
    await loadRanges(); openRange = ranges.find(r => r.id === openRange.id) || openRange;
    toast("Removed"); render();
  } catch (e) { toast("Couldn't remove that"); }
}

async function deleteRange() {
  if (!confirm("Delete the " + openRange.name + "? Shops that already have its products keep them.")) return;
  try { await rangeApi.remove(openRange.id); toast("Range deleted"); closeRangePanel(); }
  catch (e) { toast("Couldn't delete that"); }
}

/* ---------- Club shop screen: Add a range / Duplicate this shop ---------- */

function shopToolsHtml() {
  const picks = ranges.length ? ranges.map(r => `
      <div class="fld" style="display:flex;justify-content:space-between;align-items:center">
        <label for="rt-${r.id}" style="margin:0">${esc(r.name)} <span class="hint">${plural(r.product_count, "product")}</span></label>
        <input id="rt-${r.id}" class="rt-pick" type="checkbox" value="${r.id}" style="width:auto;min-height:auto">
      </div>`).join("")
    : `<p style="font-size:14px;color:var(--muted)">No ranges yet.</p>
       <button class="ghost" onclick="setTab('ranges')" style="min-height:44px;margin-top:6px">Create a range</button>`;
  return `
    <div class="newcard" style="margin:18px 0" id="rt-card">
      <h2 style="font-size:19px;font-family:var(--display)">Add a range</h2>
      <p style="font-size:14px;color:var(--muted);margin:6px 0 0">Copies a range's products into this shop. You can then change prices, sizes or photos for this club only. Items already here are skipped.</p>
      ${picks}
      <div class="notice" id="rt-notice"></div>
      ${ranges.length ? `<button class="btn-solid" id="rt-add" onclick="addRangesToShop()" style="margin-top:14px">Add to this shop</button>` : ""}
    </div>
    <div class="newcard" style="margin:18px 0" id="dup-card">
      <h2 style="font-size:19px;font-family:var(--display)">Duplicate this shop</h2>
      <p style="font-size:14px;color:var(--muted);margin:6px 0 0">Copies all ${plural(openGroupProducts.length, "item")} into a new shop for another club. The new shop starts paused until you reactivate it.</p>
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

function dupAutoSlug() { if ($("dup-slug")) $("dup-slug").value = slugify($("dup-name").value); }

function decorateGroupDetail(p) {
  if (!openGroup) return;
  const rows = [...p.querySelectorAll(".orow")];
  if (rows[0]) rows[0].insertAdjacentHTML("afterend", shopToolsHtml());
  rows.slice(1).forEach((row, i) => {                    // tag each item with the range it came from
    const pr = openGroupProducts[i], meta = row.querySelector(".ometa");
    if (pr && pr.range_name && meta) meta.insertAdjacentText("beforeend", " · " + pr.range_name);
  });
  if (!rangesLoaded) loadRanges().then(() => { if (tab === "groups" && openGroup) render(); });
}

async function addRangesToShop() {
  const ids = [...document.querySelectorAll(".rt-pick:checked")].map(x => x.value);
  const n = $("rt-notice"), btn = $("rt-add");
  if (!ids.length) { n.className = "notice show err"; n.textContent = "Tick a range first."; return; }
  btn.disabled = true; n.className = "notice show busy"; n.textContent = "Adding…";
  let added = 0, skipped = 0;
  try {
    for (const id of ids) { const r = await rangeApi.addToShop(openGroup.id, id); added += r.added; skipped += r.skipped; }
    openGroupProducts = await listGroupProducts(openGroup.id);
    loadRanges();                                          // refresh the "used by" counts in the background
    toast(added ? "Added " + plural(added, "item") : "Nothing new to add");
    render();
    const n2 = $("rt-notice");
    if (n2 && skipped) { n2.className = "notice show ok"; n2.textContent = plural(skipped, "item") + " already in this shop, skipped."; }
  } catch (e) { n.className = "notice show err"; n.textContent = "Couldn't add that (" + e.message + ")."; btn.disabled = false; }
}

async function duplicateShop() {
  const name = $("dup-name").value.trim(), slug = slugify($("dup-slug").value || name), code = $("dup-code").value.trim().toUpperCase();
  const n = $("dup-notice"), btn = $("dup-save");
  if (!name) { n.className = "notice show err"; n.textContent = "Give the new club a name."; return; }
  if (!code) { n.className = "notice show err"; n.textContent = "Set an access code."; return; }
  btn.disabled = true; n.className = "notice show busy"; n.textContent = "Copying…";
  try {
    const r = await rangeApi.duplicate(openGroup.id, name, slug, code);
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
  const guarded = ["dup-name", "dup-slug", "rg-name", "rp-name", "rp-desc", "rp-price", "rp-sizes", "rp-cols"];
  const hasUnsaved = () => guarded.some(id => { const el = $(id); return el && el.value && el.value.trim(); });

  const _load = load;
  load = function () { return hasUnsaved() ? Promise.resolve() : _load.apply(this, arguments); };

  const _render = render;
  render = function () {
    if (tab === "ranges") { const s = $("stats"); if (s) s.style.display = "none"; renderRanges($("panel")); return; }
    return _render.apply(this, arguments);
  };

  const _renderGroupDetail = renderGroupDetail;
  renderGroupDetail = function (p) { _renderGroupDetail.call(this, p); decorateGroupDetail(p); };

  const _setTab = setTab;
  setTab = function (t) {
    _setTab.call(this, t);
    if (t === "ranges") { openRange = null; editingRangeProduct = null; loadRanges().then(() => { if (tab === "ranges") render(); }); }
  };

  /* A refresh or "back" lands on #ranges: admin.js doesn't know that tab, so send it there. */
  if (location.hash === "#ranges") {
    let touched = false;
    document.addEventListener("pointerdown", e => { if (e.target.closest(".tab")) touched = true; }, true);
    const _setTab2 = setTab;
    setTab = function (t) { return _setTab2.call(this, !touched && t === "live" ? "ranges" : t); };
    let tries = 0;
    const go = () => {
      if (touched || tab === "ranges") return;
      const gate = document.getElementById("pingate");
      if (gate && getComputedStyle(gate).display !== "none") { if (++tries < 120) setTimeout(go, 250); return; }
      setTab("ranges");
    };
    document.addEventListener("DOMContentLoaded", () => setTimeout(go, 600));
  }
})();
