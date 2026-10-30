/* ============================================================
   admin-schools-hidden.js — Job 16. A "Not shown to customers"
   section at the bottom of the Schools tab. Lists active school
   items whose category is not an active registry school and not
   "All Schools" (the "Needs Sorting" holding pen, or a typo in a
   school name). The public shop ignores these, so this is the only
   place Jo can see them. Read-only: it reads the lists the Schools
   tab already loaded (schList, schAll), so it adds no requests and
   no new error codes. Load after admin-schools.js and admin-catalog.js.
   ============================================================ */

function schHiddenItems(schools, items) {
  const names = new Set((schools || []).map(s => s.name));
  return (items || []).filter(i => i.active !== false && i.category !== "All Schools" && !names.has(i.category));
}

function schHiddenRow(i) {
  const price = i.price == null ? "No price" : money(i.price);
  const cat = i.category === "Needs Sorting" || !i.category
    ? esc(i.category || "No school")
    : esc(i.category) + ` <span style="color:#9B3B1E">(no matching school)</span>`;
  const name = (i.name || "").trim();
  return `<div style="display:flex;gap:12px;padding:10px 0;border-top:0.5px solid var(--line,#eadfd2)">
    ${catThumb({ image_url: i.image_url }, 56)}
    <div style="flex:1;min-width:0"><div class="oref" style="font-size:15px${name ? "" : ";font-style:italic;color:var(--muted)"}">${name ? esc(name) : "(unnamed item)"}</div>
    <div class="ometa" style="margin:2px 0 0">${price} · ${cat}</div></div></div>`;
}

function schHiddenHtml() {
  const list = schHiddenItems(schList, schAll);
  const head = `<div class="ometa" style="margin:0 0 4px;font-size:16px;font-weight:500;color:var(--charcoal,#2b2b2b)">Not shown to customers</div>`;
  if (!list.length) {
    return `<div class="orow" style="margin-top:14px">${head}<div class="ometa" style="margin:0">Nothing here. Every school item is linked to a school.</div></div>`;
  }
  return `<div class="orow" style="margin-top:14px;border:0.5px solid #EF9F27;background:#FFFBF2">
    <div class="orow-top">${head}<span class="otime">${plural(list.length, "item")}</span></div>
    <div class="ometa" style="margin:0 0 6px">These items aren't linked to a school, so customers can't see them. Tell Josh which school each one belongs to, or whether to remove it.</div>
    ${list.map(schHiddenRow).join("")}</div>`;
}

(function () {
  const _list = schListHtml;
  schListHtml = function () { return _list() + schHiddenHtml(); };
})();
