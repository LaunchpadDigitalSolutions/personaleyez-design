/* ============================================================
   admin-uniform-pool.js — "Uniform pool" admin tab.

   Jo picks a school from a dropdown, then ticks which catalog
   items (tagged "School uniform") appear in that school's public
   uniform shop at /uniform/[slug].

   Saves a complete replacement of assignments via
   ps_admin_save_uniform_assignments.

   Hooks into admin.js with the same IIFE wrapping pattern used
   by admin-catalog.js and admin-schools.js.
   Error codes: PS-71x
   ============================================================ */

let upSchools = [], upPool = [], upLoaded = false;
let upSelectedSlug = null, upSelectedName = null;
let upCurrentAssigned = new Set(); // catalog_ids loaded from server for current school

const upApi = {
  schools: ()                      => sb("ps_schools?select=id,name,slug,phase&active=eq.true&order=sort_order.asc,name.asc", {}, "PS-711"),
  pool:    ()                      => adminRpc("ps_admin_list_pool", {}, "PS-712"),
  assign:  (slug)                  => adminRpc("ps_admin_get_uniform_assignments", { p_slug: slug }, "PS-713"),
  save:    (slug, name, ids)       => adminRpc("ps_admin_save_uniform_assignments",
                                       { p_slug: slug, p_name: name, p_catalog_ids: ids }, "PS-714")
};

/* ---- data loading ---- */

async function upLoad() {
  try {
    [upSchools, upPool] = await Promise.all([upApi.schools(), upApi.pool()]);
    upPool = (upPool || []).filter(c => c.tag === "School uniform");
    upPool.sort((a, b) =>
      (a.sort_order ?? 999) - (b.sort_order ?? 999) ||
      a.name.localeCompare(b.name));
  } catch (e) {
    console.error("PS-711/712", e);
    upSchools = []; upPool = [];
  }
  upLoaded = true;
}

async function upLoadAssign(slug) {
  try {
    const r = await upApi.assign(slug);
    return new Set(Array.isArray(r) ? r : []);
  } catch (e) {
    return new Set();
  }
}

/* ---- render: outer shell (school picker) ---- */

function renderUniformPool(p) {
  const stats = $("stats"); if (stats) stats.style.display = "none";

  if (!upLoaded) {
    p.innerHTML = `<p style="text-align:center;color:var(--muted);padding:40px 0">Loading&hellip;</p>`;
    return;
  }

  p.innerHTML = `
    <div class="orow">
      <div class="oref">Uniform pool</div>
      <div class="ometa" style="margin-top:4px">Pick a school, tick the catalog items for its uniform shop, then save.</div>
    </div>

    <div class="newcard" style="margin-bottom:0;border-bottom:none">
      <div class="fld" style="margin:0">
        <label for="up-school">School</label>
        <select id="up-school" onchange="upChangeSchool(this.value)" style="font-size:16px">
          <option value="">— choose a school —</option>
          ${upSchools.map(s =>
            `<option value="${attr(s.slug)}"${upSelectedSlug === s.slug ? " selected" : ""}>${esc(s.name)}</option>`
          ).join("")}
        </select>
      </div>
    </div>

    <div id="up-body"></div>`;

  // If a school is already selected (e.g. tab-restore), render body immediately
  if (upSelectedSlug) upRenderBody();
}

/* ---- render: item checkboxes ---- */

function upRenderBody() {
  const body = $("up-body"); if (!body) return;

  if (!upPool.length) {
    body.innerHTML = `<div class="newcard" style="margin-top:0;border-top:none;text-align:center;padding:28px">
      <p style="color:var(--muted)">No “School uniform” items in the catalog yet — add some in the Catalog tab first.</p>
    </div>`;
    return;
  }

  const count = document.querySelectorAll(".up-cb:checked").length ||
                (upCurrentAssigned ? upCurrentAssigned.size : 0);

  body.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;
                padding:12px 20px;background:#fff;
                border:1px solid var(--line);border-top:none;border-bottom:none">
      <span id="up-count" style="font-size:13px;color:var(--muted)">
        ${count} item${count === 1 ? "" : "s"} selected
      </span>
      <div style="display:flex;gap:8px">
        <button class="ghost" style="min-height:40px;padding:0 14px;font-size:13px" onclick="upToggleAll(false)">Clear all</button>
        <button class="ghost" style="min-height:40px;padding:0 14px;font-size:13px" onclick="upToggleAll(true)">Tick all</button>
      </div>
    </div>

    ${upPool.map(c => `
    <div class="orow" style="display:flex;align-items:center;gap:14px;cursor:pointer;
              border-radius:0;border-top:none;border-bottom:0.5px solid var(--line);margin:0"
         onclick="upRowClick('${c.id}')">
      ${c.image_url
        ? `<img src="${attr(c.image_url)}" alt="" style="width:52px;height:52px;border-radius:8px;object-fit:cover;flex:none">`
        : `<div style="width:52px;height:52px;border-radius:8px;background:var(--cream-deep);flex:none"></div>`}
      <div style="flex:1;min-width:0">
        <div style="font-size:15px;font-weight:500">${esc(c.name)}</div>
        <div class="ometa" style="margin-top:2px">${
          c.price != null ? money(c.price) : "No price"
        }${c.sizes ? " &middot; " + esc(c.sizes) : ""}</div>
      </div>
      <input type="checkbox" id="up-cb-${c.id}" value="${c.id}" class="up-cb"
        ${upCurrentAssigned && upCurrentAssigned.has(c.id) ? "checked" : ""}
        style="width:22px;height:22px;flex:none;accent-color:var(--terracotta);cursor:pointer"
        onclick="event.stopPropagation()">
    </div>`).join("")}

    <div style="background:#fff;border:1px solid var(--line);border-top:none;
                border-radius:0 0 2px 2px;padding:16px 16px 20px">
      <div class="notice" id="up-notice"></div>
      <button class="btn-solid" id="up-save" onclick="upSave()"
              style="width:100%;margin-top:12px">
        Save for ${esc(upSelectedName || "this school")}
      </button>
    </div>`;
}

/* ---- user actions ---- */

async function upChangeSchool(slug) {
  upSelectedSlug = slug || null;
  const school = upSchools.find(s => s.slug === slug);
  upSelectedName = school ? school.name : null;
  upCurrentAssigned = new Set();

  if (!slug) {
    const b = $("up-body"); if (b) b.innerHTML = "";
    return;
  }

  const body = $("up-body");
  if (body) body.innerHTML = `<p style="text-align:center;color:var(--muted);padding:24px">Loading&hellip;</p>`;

  upCurrentAssigned = await upLoadAssign(slug);
  upRenderBody();
}

function upRowClick(id) {
  const cb = $("up-cb-" + id); if (!cb) return;
  cb.checked = !cb.checked;
  upUpdateCount();
}

function upUpdateCount() {
  const count = document.querySelectorAll(".up-cb:checked").length;
  const el = $("up-count");
  if (el) el.textContent = count + " item" + (count === 1 ? "" : "s") + " selected";
}

function upToggleAll(checked) {
  document.querySelectorAll(".up-cb").forEach(cb => { cb.checked = checked; });
  upUpdateCount();
}

async function upSave() {
  const n = $("up-notice"), btn = $("up-save");
  if (!upSelectedSlug || !upSelectedName) return;

  // Read live DOM state at save time
  const ids = [...document.querySelectorAll(".up-cb:checked")].map(cb => cb.value);

  btn.disabled = true;
  n.className = "notice show busy"; n.textContent = "Saving…";

  try {
    await upApi.save(upSelectedSlug, upSelectedName, ids);
    upCurrentAssigned = new Set(ids);
    n.className = "notice show ok";
    n.textContent = "Saved. " + esc(upSelectedName) + "’s shop now shows " +
                    ids.length + " item" + (ids.length === 1 ? "" : "s") + ".";
  } catch (e) {
    n.className = "notice show err";
    n.textContent = "Couldn’t save — try again. (" + e.message + ")";
  }
  btn.disabled = false;
}

/* ---- wiring into admin.js ---- */
(function () {
  const _render = render;
  render = function () {
    if (tab === "uniformpool") { renderUniformPool($("panel")); return; }
    return _render.apply(this, arguments);
  };

  // Block auto-refresh while user is working in the uniform pool tab
  const _load = load;
  load = function () {
    if (tab === "uniformpool") return Promise.resolve();
    return _load.apply(this, arguments);
  };

  const _setTab = setTab;
  setTab = function (t) {
    _setTab.call(this, t);
    if (t === "uniformpool" && !upLoaded) {
      upLoad().then(() => { if (tab === "uniformpool") render(); });
    }
  };
})();
