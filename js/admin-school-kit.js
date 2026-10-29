/* ============================================================
   admin-school-kit.js — "Edit whole kit" grid for the Schools tab.
   Jo ticks the pool items a school sells, picks a colour and
   crested/plain for each, and saves once. Price and sizes always
   follow the pool. Unticking hides the item from that school
   (never deletes it). Needs admin-schools.js (schItems, schPool,
   schColours, schRefresh, schBack, schNote, schChip, schGo, schEdit).
   Hooks in by wrapping renderSchools and schItemsHtml.
   Error code: PS-620 save kit.
   ============================================================ */

let kitForm = null;

const kitApi = {
  save: (school, items) => adminRpc("ps_admin_set_school_kit", { p_school: school, p_items: items }, "PS-620")
};

function kitBuild(school) {
  const mine = schItems(school).filter(i => i.catalog_id);
  const rows = schPool.map(c => {
    const it = mine.find(i => i.catalog_id === c.id);
    return { cid: c.id, name: c.name, price: c.price, itemId: it ? it.id : null,
      on: !!it, colour: it && it.colour ? it.colour : "", other: "", crest: it ? !!it.crest : true };
  });
  return { school, rows, base: JSON.stringify(rows.map(kitKey)), errs: {}, busy: false, copyFrom: "" };
}

const kitColourOf = r => (r.colour === "__other" ? r.other : r.colour).trim();
const kitKey = r => [r.on, r.on ? kitColourOf(r) : "", r.on ? r.crest : ""];
function kitChanges() {
  const base = JSON.parse(kitForm.base);
  return kitForm.rows.filter((r, n) => JSON.stringify(kitKey(r)) !== JSON.stringify(base[n])).length;
}

function kitOpen() {
  kitForm = kitBuild(schSchool);
  schView = "kit"; schMsg = null; schForm = null;
  render(); window.scrollTo(0, 0);
}

/* ---------- screen ---------- */

function kitRowHtml(r, n) {
  const cols = [...new Set(schColours().concat(r.colour && r.colour !== "__other" ? [r.colour] : []))].sort();
  const base = JSON.parse(kitForm.base)[n];
  const colourMoved = r.on && r.itemId && base[0] && kitColourOf(r) !== base[1];
  let h = `<div class="orow" style="${r.on ? "border-color:var(--terracotta)" : ""}">
    <div style="display:flex;align-items:center;gap:12px;min-height:44px">
      <input type="checkbox" id="kit-on-${n}" aria-label="${attr(r.name)}" ${r.on ? "checked" : ""} onchange="kitTick(${n},this.checked)"
        style="width:24px;height:24px;min-height:auto;flex:none">
      <label for="kit-on-${n}" class="oref" style="font-size:15px;flex:1;margin:0">${esc(r.name)}</label>
      <span class="ometa" style="margin:0">${money(r.price)} from pool</span></div>`;
  if (r.on) {
    h += `<div style="display:grid;gap:10px;margin-top:10px;grid-template-columns:1fr" class="kit-opts">
      <div class="fld" style="margin:0"><label for="kit-col-${n}">Colour</label>
        <select id="kit-col-${n}" onchange="kitColour(${n},this.value)">
          <option value="">Choose colour</option>${cols.map(c => `<option${c === r.colour ? " selected" : ""}>${esc(c)}</option>`).join("")}
          <option value="__other"${r.colour === "__other" ? " selected" : ""}>Other…</option></select>
        <input type="text" id="kit-oth-${n}" placeholder="Bottle green" autocomplete="off" value="${attr(r.other)}"
          oninput="kitOther(${n},this.value)" style="margin-top:8px;display:${r.colour === "__other" ? "block" : "none"}"></div>
      <div class="fld" style="margin:0"><label for="kit-cr-${n}">Crest</label>
        <select id="kit-cr-${n}" onchange="kitCrest(${n},this.value)">
          <option value="1"${r.crest ? " selected" : ""}>Crested (initials offered)</option>
          <option value="0"${!r.crest ? " selected" : ""}>Plain</option></select></div>
      <div>${r.itemId
        ? `<button class="ghost" style="width:100%;min-height:44px" onclick="kitPhoto('${r.itemId}')">Change photo</button>`
        : `<div class="ometa" style="margin:0">Add a photo after saving.</div>`}</div></div>`;
    if (kitForm.errs[n]) h += `<div style="color:#9B3B1E;font-size:13px;margin-top:6px">Choose a colour for ${esc(r.name)}.</div>`;
    if (colourMoved) h += `<div class="ometa" style="margin-top:6px">The current photo may not match this colour. Change it after saving.</div>`;
  } else if (r.itemId) {
    h += `<div class="ometa" style="margin:4px 0 0">Will be hidden from this school's shop when you save.</div>`;
  }
  return h + `</div>`;
}

function kitHtml() {
  const f = kitForm, c = kitChanges();
  const others = schList.filter(s => s.name !== f.school && schItems(s.name).some(i => i.catalog_id));
  return schBack(esc(f.school), "schGo('items')") + `<h2 style="font-size:20px;font-family:var(--display)">${esc(f.school)}: whole kit</h2>
    <p style="font-size:13px;color:var(--muted);margin:4px 0 14px">Tick what this school sells and choose its colours. Prices come from the pool. Plain trousers, skirts and pinafores are shared and show automatically.</p>
    <div class="fld"><label for="kit-copy">Copy kit from another school</label>
      <div style="display:flex;gap:8px"><select id="kit-copy" style="flex:1" onchange="kitForm.copyFrom=this.value">
        <option value="">Choose a school</option>${others.map(s => `<option${s.name === f.copyFrom ? " selected" : ""}>${esc(s.name)}</option>`).join("")}</select>
        <button class="ghost" style="min-height:44px;padding:0 18px" onclick="kitCopy()">Copy</button></div>
      <div class="ometa" style="margin:6px 0 0">Copying only fills this form. Nothing is saved until you press Save.</div></div>
    <div id="kit-msg"></div>` +
    (f.rows.length ? f.rows.map(kitRowHtml).join("") : `<p style="text-align:center;color:var(--muted);padding:30px 0">The pool is empty.</p>`) +
    `<div class="ometa" id="kit-sum">${c ? plural(c, "unsaved change") : "No changes"}</div>
    <button class="btn-solid" id="kit-save" style="width:100%;margin-top:10px" ${f.busy ? "disabled" : ""} onclick="kitSave()">Save kit</button>`;
}

/* ---------- actions ---------- */

function kitTick(n, on) { kitForm.rows[n].on = on; delete kitForm.errs[n]; render(); }
function kitColour(n, v) { kitForm.rows[n].colour = v; delete kitForm.errs[n]; render(); }
function kitOther(n, v) { kitForm.rows[n].other = v; delete kitForm.errs[n]; const s = $("kit-sum"); if (s) s.textContent = kitChanges() ? plural(kitChanges(), "unsaved change") : "No changes"; }
function kitCrest(n, v) { kitForm.rows[n].crest = v === "1"; render(); }

function kitPhoto(itemId) {
  if (kitChanges()) { toast("Save your kit first, then change the photo."); return; }
  schView = "items"; schEdit(itemId);
}

function kitCopy() {
  const f = kitForm;
  if (!f.copyFrom) { $("kit-msg").innerHTML = schNote("err", "Choose a school to copy from first."); return; }
  const src = schItems(f.copyFrom).filter(i => i.catalog_id);
  f.rows.forEach(r => {
    const it = src.find(i => i.catalog_id === r.cid);
    r.on = !!it; r.colour = it && it.colour ? it.colour : ""; r.other = ""; r.crest = it ? !!it.crest : true;
  });
  f.errs = {};
  render();
}

async function kitSave() {
  const f = kitForm;
  f.errs = {};
  f.rows.forEach((r, n) => { if (r.on && !kitColourOf(r)) f.errs[n] = true; });
  if (Object.keys(f.errs).length) { render(); return; }
  f.busy = true; render();
  const items = f.rows.filter(r => r.on).map(r => ({ catalog_id: r.cid, colour: kitColourOf(r), crest: r.crest }));
  try {
    await kitApi.save(f.school, items);
    await schRefresh();
    kitForm = null; schView = "items"; render();
    schMsg = "Saved. " + f.school + " now shows " + plural(items.length, "item") + " from the pool."; render(); window.scrollTo(0, 0);
  } catch (e) {
    f.busy = false; render();
    const bad = String(e && e.message || "").includes("PS-KIT-COLOUR");
    $("kit-msg").innerHTML = schNote("err", bad ? "Choose a colour for every ticked item." : "Couldn't save the kit. Check your connection and try again. (PS-620)");
  }
}

/* ---------- wiring into admin-schools.js ---------- */
(function () {
  const _rs = renderSchools;
  renderSchools = function (p) {
    if (schLoaded && !schLoadErr && schView === "kit" && kitForm) { p.innerHTML = kitHtml(); return; }
    return _rs(p);
  };
  const _si = schItemsHtml;
  schItemsHtml = function () {
    return _si() + `<button class="ghost" style="width:100%;min-height:44px;margin-top:10px" onclick="kitOpen()">Edit whole kit</button>`;
  };
})();
