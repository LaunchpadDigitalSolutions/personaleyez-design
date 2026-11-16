/* ============================================================
   admin-schools.js — the "Schools" tab. Jo picks a school, then
   adds items from the pool or changes one for that school only
   (colour, price, photo, logo). Same override rule as the club
   catalog: a blank field on the school's row follows the pool.
   Needs js/pool-overrides.js and admin-catalog.js (uploadItemPhoto,
   plural). Wraps admin.js render / load / setTab like admin-catalog.js.
   Error codes: PS-610 items, PS-611 pool, PS-612 save, PS-613 add,
   PS-614 photo, PS-616 schools list.
   ============================================================ */

let schAll = [], schList = [], schPool = [], schLoaded = false, schLoadErr = null;
let schView = "list", schSchool = null, schForm = null, schMsg = null;

const schApi = {
  schools: () => sb("ps_schools?select=name,phase,sort_order&active=eq.true&order=sort_order,name", {}, "PS-616"),
  items: () => adminRpc("ps_admin_list_school_items", { p_school: null }, "PS-610"),
  pool: () => adminRpc("ps_admin_list_pool", {}, "PS-611"),
  save: (id, v) => adminRpc("ps_admin_set_school_item", {
    p_id: id, p_colour: v.colour, p_price: v.price, p_image_url: v.image_url, p_crest: v.crest, p_name: v.name
  }, "PS-612"),
  add: (school, ids) => adminRpc("ps_admin_add_pool_to_school", { p_school: school, p_catalog_ids: ids }, "PS-613")
};

async function schLoad() {
  schLoadErr = null;
  try { [schList, schAll, schPool] = await Promise.all([schApi.schools(), schApi.items(), schApi.pool()]); }
  catch (e) { schLoadErr = e.message; }
  schLoaded = true;
}
async function schRefresh() { [schAll, schPool] = await Promise.all([schApi.items(), schApi.pool()]); }

const schItems = s => schAll.filter(i => i.category === s);
const schItem = id => schAll.find(i => i.id === id);
const schNote = (cls, txt) => `<div class="notice show ${cls}" style="margin:0 0 14px${cls === "info" ? ";background:#FFF1E4;color:#6A3A1B" : ""}">${txt}</div>`;
const schChip = (txt, own) => `<span style="font-size:11px;padding:2px 8px;border-radius:6px;display:inline-block;margin:4px 4px 0 0;background:${own ? "#FBE0D0" : "#DDEFD9"};color:${own ? "#8A3B1C" : "#245A1E"}">${txt}</span>`;
const schBack = (label, fn) => `<button class="ghost" onclick="${fn}" style="min-height:44px;padding:0 18px;border-radius:2px;background:var(--cream-deep);margin-bottom:16px">&larr; ${label}</button>`;
const schColours = () => [...new Set(schAll.filter(i => i.catalog_id && i.colour).map(i => i.colour))].sort();

/* ---------- screens ---------- */

function renderSchools(p) {
  if (!schLoaded) { p.innerHTML = `<p style="text-align:center;color:var(--muted);padding:40px 0">Loading…</p>`; return; }
  if (schLoadErr) {
    p.innerHTML = schNote("err", "Couldn't load the schools. Check your connection and try again. (" + esc(schLoadErr) + ")") +
      `<button class="btn-solid" style="width:100%" onclick="schReload()">Try again</button>`;
    return;
  }
  p.innerHTML = schView === "items" ? schItemsHtml() : schView === "pool" ? schPoolHtml() : schView === "form" ? schFormHtml() : schListHtml();
}

function schListHtml() {
  return `<div class="orow"><div class="oref">Schools</div>
    <div class="ometa">Pick a school to change its uniform. Changes only affect that school.</div></div>` +
    schList.map((s, n) => `<div class="orow"><div class="orow-top"><span class="oref" style="font-size:15px">${esc(s.name)}</span>
      <span class="otime">${plural(schItems(s.name).length, "item")}</span></div>
      <div class="oact"><button class="ghost" onclick="schOpen(${n})">Items</button></div></div>`).join("");
}

function schItemRow(i) {
  const own = (i.overrides || []).filter(k => k !== "colour").map(k => k === "crest" ? "logo setting" : k);
  return `<div class="orow"><div class="oref" style="font-size:15px">${esc(i.name)}</div>
    <div class="ometa">${i.colour && i.catalog_id ? "Colour: " + esc(i.colour) + " · " : ""}${money(i.price)}${i.sizes ? " · Sizes: " + esc(i.sizes) : ""}</div>
    <div>${i.catalog_id ? schChip("From pool") : ""}${own.length ? schChip("Own " + own.join(", "), true) : ""}${i.edited_at ? schChip("Changed for this school", true) : ""}</div>
    <div class="oact"><button class="ghost" onclick="schEdit('${i.id}')">Change for this school</button></div></div>`;
}

function schItemsHtml() {
  const items = schItems(schSchool);
  return schBack("Schools", "schGo('list')") + `<h2 style="font-size:20px;font-family:var(--display)">${esc(schSchool)}</h2>
    <p style="font-size:13px;color:var(--muted);margin:4px 0 14px">${plural(items.length, "item")} · changes here only affect this school. Plain trousers, skirts and pinafores are shared by every school and show automatically.</p>` +
    (schMsg ? schNote("ok", esc(schMsg)) : "") +
    (items.length ? items.map(schItemRow).join("") : `<div class="orow" style="text-align:center;padding:26px 14px">
      <div class="oref" style="font-size:16px">Start this school's uniform</div>
      <div class="ometa">Pick items from the pool, then change colour or price for this school.</div></div>`) +
    `<button class="btn-solid" style="width:100%;margin-top:6px" onclick="schGo('pool')">Add from pool</button>`;
}

function schPoolHtml() {
  const here = schItems(schSchool);
  return schBack(esc(schSchool), "schGo('items')") + `<h2 style="font-size:20px;font-family:var(--display)">The pool</h2>
    <p style="font-size:13px;color:var(--muted);margin:4px 0 14px">Pick an item to add to this school. You can change its colour or price afterwards.</p>` +
    (schMsg ? schNote("ok", esc(schMsg)) : "") +
    (schPool.length ? schPool.map(c => `<div class="orow" style="display:flex;justify-content:space-between;align-items:center;gap:10px">
      <div><div class="oref" style="font-size:15px">${esc(c.name)}</div><div class="ometa" style="margin:2px 0 0">${money(c.price)} · used by ${plural(c.used_by, "school")}</div></div>
      ${here.some(i => i.catalog_id === c.id) ? schChip("Already added") : `<button class="ghost" style="min-height:44px;padding:0 16px" onclick="schAddPool('${c.id}')">Add</button>`}
    </div>`).join("") : `<p style="text-align:center;color:var(--muted);padding:30px 0">The pool is empty.</p>`) +
    `<button class="ghost" style="width:100%;min-height:44px;margin-top:8px" onclick="setTab('catalog')">Edit the pool in Catalog</button>`;
}

function schFormHtml() {
  const f = schForm, i = schItem(f.id), linked = !!i.catalog_id;
  const cols = [...new Set(schColours().concat(f.colour && f.colour !== "__other" ? [f.colour] : []))];
  const photoOpts = [`<option value="keep">Keep the current photo</option>`]
    .concat(f.alts.map((a, n) => `<option value="${n}"${f.photo === String(n) ? " selected" : ""}>${esc(a.label)}</option>`),
      f.photo === "new" ? [`<option value="new" selected>New photo (just uploaded)</option>`] : [],
      [`<option value="__up">Upload a new photo…</option>`]).join("");
  return schBack(esc(schSchool), "schGo('items')") + `<div class="newcard">
    <h2 style="font-size:20px;font-family:var(--display)">${esc(linked ? i.pool_name : i.name)}</h2>
    ${schNote("info", linked ? "Changing this for " + esc(schSchool) + " only. Other schools stay the same." : "This item isn't in the pool, so changes only affect " + esc(schSchool) + ".")}
    ${linked ? `<div class="fld"><label for="sch-col">Colour</label><select id="sch-col" onchange="schColour(this.value)">
        ${cols.map(c => `<option${c === f.colour ? " selected" : ""}>${esc(c)}</option>`).join("")}
        <option value="__other"${f.colour === "__other" ? " selected" : ""}>Other…</option></select>
      <input id="sch-other" type="text" placeholder="Bottle green" autocomplete="off" value="${attr(f.other)}" oninput="schForm.other=this.value;schShown()"
        style="margin-top:8px;display:${f.colour === "__other" ? "block" : "none"}"></div>`
      : `<div class="fld"><label for="sch-name">Name</label><input id="sch-name" type="text" autocomplete="off" value="${attr(f.name)}" oninput="schForm.name=this.value"></div>`}
    <div class="ometa" style="margin:-4px 0 6px">Shows as: <strong id="sch-shown"></strong></div>
    <div class="fld"><label for="sch-price">Price (£) <span class="hint">${linked ? "Leave as the pool price to keep following it" : ""}</span></label>
      <input id="sch-price" type="text" inputmode="decimal" autocomplete="off" value="${attr(f.price)}" oninput="schForm.price=this.value"></div>
    <div class="fld"><label for="sch-photo">Photo</label>
      <div style="display:flex;gap:10px;align-items:center">${catThumb({ image_url: f.photoUrl }, 56)}
        <select id="sch-photo" onchange="schPhoto(this.value)" style="flex:1">${photoOpts}</select></div>
      <div id="sch-photo-note"></div>
      <input type="file" id="sch-file" accept="image/jpeg,image/png,image/webp" style="display:none" onchange="schUpload(event)"></div>
    <div class="fld" style="display:flex;justify-content:space-between;align-items:center;gap:12px">
      <label for="sch-crest" style="margin:0">Embroider school logo</label>
      <input id="sch-crest" type="checkbox" style="width:auto;min-height:auto" ${f.crest ? "checked" : ""} onchange="schForm.crest=this.checked"></div>
    <div class="notice" id="sch-notice"></div>
    <button class="btn-solid" id="sch-save" onclick="schSave()" style="margin-top:16px;width:100%">Save for this school</button>
    <button class="ghost" onclick="schGo('items')" style="margin-top:10px;width:100%;min-height:44px">Cancel</button></div>`;
}

/* ---------- actions ---------- */

function schOpen(n) { schSchool = schList[n].name; schGo("items"); }
function schGo(v) { schView = v; schMsg = null; schForm = null; render(); window.scrollTo(0, 0); }
async function schReload() { schLoaded = false; render(); await schLoad(); render(); }

async function schAddPool(id) {
  try {
    await schApi.add(schSchool, [id]); await schRefresh();
    schMsg = "Added. Open it from the school's items to set its colour."; render();
  } catch (e) { schMsg = null; toast("Couldn't add that. Try again. (PS-613)"); }
}

function schEdit(id) {
  const i = schItem(id);
  const alts = [], seen = new Set([i.image_url]);
  schAll.filter(x => x.id !== id && x.image_url && (i.catalog_id ? x.catalog_id === i.catalog_id : false)).forEach(x => {
    if (!seen.has(x.image_url)) { seen.add(x.image_url); alts.push({ url: x.image_url, label: x.name + " (" + x.category + ")" }); }
  });
  schForm = { id, colour: i.colour || "", other: "", name: i.name, price: i.price != null ? Number(i.price).toFixed(2) : "",
    photo: "keep", cur: i.image_url || "", photoUrl: i.image_url || "", alts, crest: !!i.crest, start: i.colour || "" };
  schView = "form"; render(); window.scrollTo(0, 0); schShown();
}

function schShown() {
  const f = schForm, i = schItem(f.id), el = $("sch-shown");
  if (!el) return;
  const colour = f.colour === "__other" ? f.other : f.colour;
  el.textContent = i.catalog_id ? PoolOverrides.displayName({ name: i.pool_name }, { colour }) : f.name;
  const moved = i.catalog_id && colour.trim() !== f.start.trim() && f.photo === "keep";
  $("sch-photo-note").innerHTML = moved ? schNote("info", "Heads up: the current photo may not match " + esc(colour.toLowerCase()) + ". Pick or upload one that does.") : "";
}
function schColour(v) { schForm.colour = v; $("sch-other").style.display = v === "__other" ? "block" : "none"; schShown(); }

function schPhoto(v) {
  const f = schForm;
  if (v === "__up") { $("sch-photo").value = f.photo; $("sch-file").click(); return; }
  f.photo = v;
  f.photoUrl = v === "keep" ? f.cur : f.alts[Number(v)].url;
  render(); schShown();
}

async function schUpload(event) {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  const n = $("sch-notice");
  n.className = "notice show busy"; n.textContent = "Uploading…";
  try {
    schForm.photoUrl = await uploadItemPhoto(schForm.id, file); schForm.photo = "new";
    render(); schShown();
  } catch (e) { n.className = "notice show err"; n.textContent = "Couldn't upload that photo. Try a different one. (PS-614)"; }
}

async function schSave() {
  const f = schForm, i = schItem(f.id), n = $("sch-notice"), btn = $("sch-save"), price = String(f.price).trim();
  if (price !== "" && !(Number(price) >= 0)) { n.className = "notice show err"; n.textContent = "Enter the price as a number, like 18.00."; return; }
  const colour = f.colour === "__other" ? f.other.trim() : f.colour;
  if (i.catalog_id && f.colour === "__other" && !colour) { n.className = "notice show err"; n.textContent = "Type the colour."; return; }
  btn.disabled = true; n.className = "notice show busy"; n.textContent = "Saving…";
  try {
    await schApi.save(f.id, { colour: i.catalog_id ? colour : null, price: price === "" ? null : Number(price),
      image_url: f.photoUrl || "", crest: f.crest, name: i.catalog_id ? null : f.name });
    await schRefresh();
    const msg = "Saved for " + schSchool + ". Other schools are unchanged.";
    schView = "items"; schForm = null; render(); schMsg = msg; render(); window.scrollTo(0, 0);
  } catch (e) {
    n.className = "notice show err"; n.textContent = "Couldn't save your change. Check your connection and try again. (PS-612)";
    btn.disabled = false; btn.textContent = "Try again";
  }
}

/* ---------- wiring into admin.js ---------- */
(function () {
  const _render = render;
  render = function () {
    const stats = $("stats");
    if (tab === "schools") { if (stats) { stats.style.display = "none"; stats.dataset.hid = "schools"; } renderSchools($("panel")); return; }
    if (stats && stats.dataset.hid === "schools") { stats.style.display = ""; delete stats.dataset.hid; }
    const r = _render.apply(this, arguments);
    if (tab === "shop") schHideSchoolRows($("panel"));
    return r;
  };

  const _load = load;       // the 30s refresh must not redraw a half-filled form
  load = function () { return tab === "schools" ? Promise.resolve() : _load.apply(this, arguments); };

  const _setTab = setTab;
  setTab = function (t) {
    if (t === "schools") { schView = "list"; schMsg = null; schForm = null; }
    _setTab.call(this, t);
    if (t === "schools") schLoad().then(() => { if (tab === "schools") render(); });
  };

  // School pool items belong in the Schools tab, not the club shops' "Add from catalog" list
  const _suggest = suggestOpts;
  suggestOpts = function () { return _suggest.apply(this, arguments).filter(c => c.tag !== "School uniform"); };
})();

/* The Shop tab can't change a school item's colour or price, so school rows are managed here instead. */
function schHideSchoolRows(p) {
  let hidden = 0;
  p.querySelectorAll(".orow").forEach(r => {
    const m = r.querySelector(".ometa");
    if (m && m.textContent.trim().startsWith("School uniform")) { r.remove(); hidden++; }
  });
  if (hidden) p.insertAdjacentHTML("afterbegin", `<div class="orow"><div class="ometa" style="margin:0">${plural(hidden, "school uniform item")} ${hidden === 1 ? "is" : "are"} managed in the Schools tab.</div>
    <div class="oact"><button class="ghost" onclick="setTab('schools')">Open Schools</button></div></div>`);
}
