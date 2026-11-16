/* ============================================================
   admin-school-picker.js — Schools tab: tick which Square items
   a school sells. Pool = Jo's live Square catalog (/api/square-catalog).
   Save = ps_admin_set_school_square_items (PS-632). Never deletes.
   Error codes: PS-630 Square load, PS-631 refresh, PS-632 save.
   ============================================================ */

let pkSquare = [], pkTicked = new Set(), pkLegacy = [], pkLegacyOn = new Set(), pkErr = null, pkBusy = false, pkLoading = false;

// Load Square catalog + this school's saved rows, then show the grid.
async function pkOpen() {
  pkErr = null; pkLoading = true; pkMsgClear(); render();
  try {
    const res = await fetch("/api/square-catalog");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "PS-630");
    pkSquare = data.items || [];
    await schRefresh();
  } catch (e) { pkErr = "PS-630 " + e.message; }
  pkLoading = false; pkSync(); render();
}
function pkMsgClear() { schMsg = null; }

// Rebuild ticked sets from saved rows for the open school.
function pkSync() {
  const rows = schItems(schSchool);
  pkTicked = new Set(rows.filter(r => r.square_item_id && r.active).map(r => r.square_item_id));
  pkLegacy = rows.filter(r => !r.square_item_id && r.active);
  pkLegacyOn = new Set(pkLegacy.map(r => r.id));
}

function pkToggle(id) { pkTicked.has(id) ? pkTicked.delete(id) : pkTicked.add(id); pkPaint(); }
function pkToggleLegacy(id) { pkLegacyOn.has(id) ? pkLegacyOn.delete(id) : pkLegacyOn.add(id); pkPaint(); }
function pkAll(on) { pkTicked = on ? new Set(pkSquare.map(i => i.id)) : new Set(); pkPaint(); }
function pkPaint() { render(); }

const pkCard = (key, on, name, price, photo, fn) => `
  <label class="orow" style="display:flex;gap:12px;align-items:center;min-height:44px;cursor:pointer;${on ? "outline:2px solid var(--peach,#E8845C)" : ""}">
    <input type="checkbox" ${on ? "checked" : ""} onchange="${fn}" style="width:22px;height:22px;flex:none">
    <span style="width:48px;height:48px;border-radius:8px;overflow:hidden;background:var(--cream-deep);flex:none">
      ${photo ? `<img src="${esc(photo)}" alt="" style="width:100%;height:100%;object-fit:cover">` : ""}</span>
    <span style="flex:1;min-width:0"><span class="oref" style="font-size:14px;display:block">${esc(name)}</span>
      <span class="ometa" style="margin:0">${price != null ? "£" + Number(price).toFixed(2) : "No price"}</span></span>
  </label>`;

function pkGridHtml() {
  const groups = {};
  pkSquare.forEach(i => (groups[i.category_name || "Other"] ||= []).push(i));
  return Object.keys(groups).sort().map(c => `<h3 style="font-size:13px;color:var(--muted);margin:18px 0 6px">${esc(c)}</h3>` +
    groups[c].map(i => pkCard(i.id, pkTicked.has(i.id), i.name, i.price_from, i.photo_url, `pkToggle('${esc(i.id)}')`)).join("")).join("");
}

// Replaces the old "items" view with the tick grid.
function schItemsHtml() {
  const head = schBack("Schools", "schGo('list')") + `<h2 style="font-size:20px;font-family:var(--display)">${esc(schSchool)}</h2>
    <p style="font-size:13px;color:var(--muted);margin:4px 0 14px">Tick what this school sells, then Save. Items come from your Square catalog.</p>`;
  if (pkLoading) return head + `<p style="text-align:center;color:var(--muted);padding:30px 0">Loading…</p>`;
  if (pkErr) return head + schNote("err", "Couldn't load your Square items. (" + esc(pkErr) + ")") + `<button class="btn-solid" style="width:100%" onclick="pkOpen()">Try again</button>`;
  const n = pkTicked.size + pkLegacyOn.size;
  return head + (schMsg ? schNote("ok", esc(schMsg)) : "") +
    `<div style="display:flex;gap:8px;margin-bottom:6px"><button class="ghost" onclick="pkAll(true)">Tick all</button><button class="ghost" onclick="pkAll(false)">Clear</button></div>` +
    (pkLegacy.length ? `<h3 style="font-size:13px;color:var(--muted);margin:18px 0 6px">Existing items (not from Square)</h3>` +
      pkLegacy.map(r => pkCard(r.id, pkLegacyOn.has(r.id), r.name, r.price, r.image_url, `pkToggleLegacy('${esc(r.id)}')`)).join("") : "") +
    pkGridHtml() +
    `<div style="position:sticky;bottom:0;background:var(--cream,#fff);padding:12px 0;display:flex;gap:12px;align-items:center;border-top:1px solid var(--cream-deep)">
      <span class="ometa" style="margin:0;flex:1">${plural(n, "item")} ticked</span>
      <button class="btn-solid" style="min-height:44px;padding:0 28px" ${pkBusy ? "disabled" : ""} onclick="pkSave()">${pkBusy ? "Saving…" : "Save"}</button></div>`;
}

// Save: ticked Square items on, everything else for this school off.
async function pkSave() {
  pkBusy = true; render();
  try {
    const items = pkSquare.filter(i => pkTicked.has(i.id)).map(i => ({
      square_id: i.id, name: i.name, price: i.price_from, image_url: i.photo_url || "",
      sizes: (i.variations || []).map(v => v.name).filter(Boolean).join(", ")
    }));
    const off = pkLegacy.filter(r => !pkLegacyOn.has(r.id)).map(r => r.id);
    await adminRpc("ps_admin_set_school_square_items", { p_school: schSchool, p_items: items, p_legacy_off: off }, "PS-632");
    await schRefresh(); pkSync();
    schMsg = "Saved. " + schSchool + " now shows " + plural(pkTicked.size + pkLegacyOn.size, "item") + ".";
  } catch (e) { schMsg = null; alert("Couldn't save (" + e.message + "). Try again."); }
  pkBusy = false; render();
}

// Opening a school loads the picker.
function schOpen(n) { schSchool = schList[n].name; schView = "items"; schMsg = null; window.scrollTo(0, 0); pkOpen(); }
