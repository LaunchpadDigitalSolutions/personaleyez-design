/* ============================================================
   admin-schools.js — the "Schools" tab.
   Jo picks a school, then ticks catalog items (tagged
   "School uniform") that belong to that school's uniform.
   Saves using ps_admin_save_uniform_assignments (same RPC
   as admin-uniform-pool.js — one consistent data model).
   Error codes: PS-610 catalog, PS-611 schools,
   PS-612 save, PS-613 load assignments.
   ============================================================ */

let schAll = [], schList = [], schCatalog = [], schLoaded = false, schLoadErr = null;
let schView = "list", schSchool = null, schSchoolSlug = null, schAssigned = [], schMsg = null;

const schApi = {
  schools: () => sb("ps_schools?select=id,name,slug,phase,sort_order&active=eq.true&order=sort_order.asc,name.asc", {}, "PS-611"),
  catalog: () => sb("ps_catalog_products?select=id,name,price,tag,image_url&order=sort_order.asc,name.asc", {}, "PS-610"),
  assign:  slug => adminRpc("ps_admin_get_uniform_assignments", { p_slug: slug }, "PS-613"),
  save:    (slug, name, ids) => adminRpc("ps_admin_save_uniform_assignments", { p_slug: slug, p_name: name, p_catalog_ids: ids }, "PS-612")
};

async function schLoad() {
  schLoadErr = null;
  try {
    const [schools, catalog] = await Promise.all([schApi.schools(), schApi.catalog()]);
    schList    = schools;
    schCatalog = catalog.filter(c => c.tag === "School uniform");
  } catch (e) { schLoadErr = e.message; }
  schLoaded = true;
}

const schNote = (cls, txt) => `<div class="notice show ${cls}" style="margin:0 0 14px">${txt}</div>`;
const schBack = (label, fn) => `<button class="ghost" onclick="${fn}" style="min-height:44px;padding:0 18px;border-radius:2px;background:var(--cream-deep);margin-bottom:16px">&larr; ${label}</button>`;

/* ---------- screens ---------- */

function renderSchools(p) {
  if (!schLoaded) { p.innerHTML = `<p style="text-align:center;color:var(--muted);padding:40px 0">Loading&hellip;</p>`; return; }
  if (schLoadErr) {
    p.innerHTML = schNote("err", "Couldn't load schools. (" + esc(schLoadErr) + ")") +
      `<button class="btn-solid" style="width:100%" onclick="schReload()">Try again</button>`;
    return;
  }
  p.innerHTML = schView === "items" ? schItemsHtml() : schListHtml();
}

function schListHtml() {
  return `<div class="orow"><div class="oref">Schools</div>
    <div class="ometa">Pick a school to set which catalog items belong to its uniform.</div></div>` +
    schList.map((s, n) =>
      `<div class="orow"><div class="orow-top">
        <span class="oref" style="font-size:15px">${esc(s.name)}</span>
      </div>
      <div class="oact"><button class="ghost" onclick="schOpen(${n})">Items</button></div></div>`
    ).join("");
}

function schItemsHtml() {
  const count = schAssigned.length;
  return schBack("Schools", "schGo('list')") +
    `<h2 style="font-size:20px;font-family:var(--display)">${esc(schSchool)}</h2>
    <p style="font-size:13px;color:var(--muted);margin:4px 0 14px">Tick the catalog items that belong to this school's uniform, then save.</p>` +
    `<div style="display:flex;justify-content:space-between;align-items:center;margin:0 0 10px">
      <span id="sch-count" style="font-size:13px;color:var(--muted)">${count} item${count !== 1 ? "s" : ""} selected</span>
      <span>
        <button class="ghost" onclick="schTickAll()" style="min-height:36px;padding:0 12px;font-size:13px">Tick all</button>
        <button class="ghost" onclick="schClearAll()" style="min-height:36px;padding:0 12px;font-size:13px;margin-left:6px">Clear all</button>
      </span>
    </div>` +
    (schMsg ? schNote("ok", esc(schMsg)) : "") +
    (schCatalog.length
      ? schCatalog.map(c => {
          const checked = schAssigned.includes(c.id);
          const thumb = c.image_url
            ? `<img src="${attr(c.image_url)}" style="width:48px;height:48px;object-fit:cover;border-radius:4px;margin-right:12px;flex-shrink:0">`
            : `<div style="width:48px;height:48px;background:var(--cream-deep);border-radius:4px;margin-right:12px;flex-shrink:0"></div>`;
          return `<label class="orow" style="display:flex;align-items:center;cursor:pointer;user-select:none">
            ${thumb}
            <div style="flex:1">
              <div class="oref" style="font-size:15px">${esc(c.name)}</div>
              <div class="ometa">${money(c.price)}</div>
            </div>
            <input type="checkbox" data-id="${attr(c.id)}" ${checked ? "checked" : ""}
              onchange="schUpdateCount()"
              style="width:20px;height:20px;min-height:auto;margin:0 0 0 12px;flex-shrink:0">
          </label>`;
        }).join("")
      : `<p style="text-align:center;color:var(--muted);padding:30px 0">No &ldquo;School uniform&rdquo; items in the catalog yet. Add items and tag them &ldquo;School uniform&rdquo; in the Catalog tab.</p>`
    ) +
    `<button class="btn-solid" id="sch-save-btn" onclick="schUniformSave()" style="width:100%;margin-top:14px">Save uniform for ${esc(schSchool)}</button>
    <div class="notice" id="sch-save-notice" style="margin-top:8px"></div>`;
}

/* ---------- actions ---------- */

async function schOpen(n) {
  schSchool     = schList[n].name;
  schSchoolSlug = schList[n].slug;
  schAssigned   = [];
  schMsg        = null;
  schView       = "items";
  render();
  window.scrollTo(0, 0);
  try { schAssigned = await schApi.assign(schSchoolSlug); }
  catch (e) { schAssigned = []; }
  render();
}

function schGo(v) {
  schView = v;
  schMsg  = null;
  if (v === "list") { schSchool = null; schSchoolSlug = null; schAssigned = []; }
  render();
  window.scrollTo(0, 0);
}

async function schReload() { schLoaded = false; render(); await schLoad(); render(); }

function schUpdateCount() {
  const checked = document.querySelectorAll('#panel input[type=checkbox][data-id]:checked').length;
  const el = document.getElementById('sch-count');
  if (el) el.textContent = checked + " item" + (checked !== 1 ? "s" : "") + " selected";
}

function schTickAll() {
  document.querySelectorAll('#panel input[type=checkbox][data-id]').forEach(c => c.checked = true);
  schUpdateCount();
}

function schClearAll() {
  document.querySelectorAll('#panel input[type=checkbox][data-id]').forEach(c => c.checked = false);
  schUpdateCount();
}

async function schUniformSave() {
  const ids    = Array.from(document.querySelectorAll('#panel input[type=checkbox][data-id]:checked')).map(c => c.dataset.id);
  const btn    = document.getElementById('sch-save-btn');
  const notice = document.getElementById('sch-save-notice');
  if (!btn || !notice) return;
  btn.disabled          = true;
  notice.className      = "notice show busy";
  notice.textContent    = "Saving…";
  try {
    await schApi.save(schSchoolSlug, schSchool, ids);
    schAssigned        = [...ids];
    schMsg             = "Saved.";
    notice.className   = "notice show ok";
    notice.textContent = "Saved.";
    btn.disabled       = false;
  } catch (e) {
    notice.className   = "notice show err";
    notice.textContent = "Couldn't save. Try again. (PS-612)";
    btn.disabled       = false;
  }
}

/* ---------- wiring into admin.js ---------- */
(function () {
  const _render = render;
  render = function () {
    const stats = $("stats");
    if (tab === "schools") {
      if (stats) { stats.style.display = "none"; stats.dataset.hid = "schools"; }
      renderSchools($("panel"));
      return;
    }
    if (stats && stats.dataset.hid === "schools") { stats.style.display = ""; delete stats.dataset.hid; }
    const r = _render.apply(this, arguments);
    if (tab === "shop") schHideSchoolRows($("panel"));
    return r;
  };

  const _load = load;
  load = function () { return tab === "schools" ? Promise.resolve() : _load.apply(this, arguments); };

  const _setTab = setTab;
  setTab = function (t) {
    if (t === "schools") { schView = "list"; schMsg = null; schSchool = null; schSchoolSlug = null; schAssigned = []; }
    _setTab.call(this, t);
    if (t === "schools") schLoad().then(() => { if (tab === "schools") render(); });
  };

  // School uniform items belong in the Schools tab, not the club shops' catalog
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
