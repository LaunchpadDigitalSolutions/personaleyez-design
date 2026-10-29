/* ============================================================
   schools-shop.js — school uniform ordering.
   Same ps_products table and /api/checkout as the main shop
   (js/shop.js) - only the rows with is_school_item=true come
   here, grouped by their `category` value (the school name), so
   Jo manages them from the same admin Shop tab she already has,
   nothing new for her to learn.
   Which schools exist, their order, phase and crest come from the
   ps_schools registry (js/schools-registry.js), so a school shows
   up even before it has any products.
   ============================================================ */

let ALL_PRODUCTS = [], SCHOOLS = [], activePhase = null, activeSchool = null, activeItem = null, basket = [];
const $ = id => document.getElementById(id);
const money = n => "£" + Number(n || 0).toFixed(2);

/* Price of "initials stitched on" for a crested item. One value, used by the
   page label, the basket line and the unit price, so they can never disagree. */
const INITIALS_PRICE = 2;

function note(el, cls, msg){
  const n = $(el); n.className = "notice show " + cls; n.textContent = msg;
}

function groupBySchool(products){
  const map = {};
  products.forEach(p => {
    const school = p.category || "Other";
    (map[school] = map[school] || []).push(p);
  });
  return map;
}

/* Single source of truth for "what does this school's list contain":
   the school's own items first, then the shared "All Schools" items
   (trousers, pinafores, skirts, playsuits, skorts). renderList(),
   selectItem() and renderPreview() all use this so they can never
   disagree about which rows exist. (Job 06 will restructure this area
   for per-school overrides - change it here, in one place.) */
function getSchoolItems(school){
  const grouped = groupBySchool(ALL_PRODUCTS);
  return (grouped[school] || []).concat(grouped["All Schools"] || []);
}

function hasOwnItems(school){
  return ALL_PRODUCTS.some(p => p.category === school);
}

const PHASE_LABEL = { primary:"Primary Schools", secondary:"Secondary Schools", special:"Special Schools", other:"Other" };
const PHASE_ORDER = ["primary","secondary","special","other"];

function schoolInitials(name){
  return name.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join("").toUpperCase();
}

/* Crest comes from the registry (ps_schools.crest_url). No crest, or one
   that fails to load, falls back to the school's initials. */
function schoolCircle(name){
  const crest = crestFor(name), ini = escHtml(schoolInitials(name));
  return crest
    ? `<span class="su-school-circle has-crest" data-initials="${ini}"><img src="${escHtml(crest)}" alt="${escHtml(name)} crest" loading="lazy"></span>`
    : `<span class="su-school-circle">${ini}</span>`;
}

/* One set of click handlers for the whole page (event delegation). Rows carry
   data-phase / data-school / data-item, so no id or name is ever written into
   a JavaScript string. A crest that fails to load falls back to initials
   (error events don't bubble, hence the capture listener). */
function bindSchoolShopEvents(){
  const on = (box, attr, fn) => $(box).addEventListener("click", e => {
    const hit = e.target.closest && e.target.closest(`[${attr}]`);
    if(hit) fn(hit.dataset[attr.slice(5)]);
  });
  on("su-phases", "data-phase", selectPhase);
  on("su-tabs", "data-school", selectSchool);
  on("su-list", "data-item", selectItem);
  $("su-tabs").addEventListener("error", e => {
    const img = e.target, box = img && img.parentElement;
    if(!img || img.tagName !== "IMG" || !box) return;
    box.classList.remove("has-crest");
    box.textContent = box.dataset.initials || "";
  }, true);
}

/* ---------- screen 1: pick a phase ---------- */
function renderPhases(){
  const byPhase = {};
  SCHOOLS.forEach(s => { const p = classifyPhase(s); (byPhase[p] = byPhase[p] || []).push(s); });
  const phases = PHASE_ORDER.filter(p => byPhase[p] && byPhase[p].length);

  $("su-phases").innerHTML = phases.map(p => {
    const n = byPhase[p].length;
    return `
    <button class="su-school su-phase${p === activePhase ? " on" : ""}" aria-pressed="${p === activePhase}" aria-label="${PHASE_LABEL[p]}, ${n} school${n === 1 ? "" : "s"}" data-phase="${escHtml(p)}">
      <span class="su-school-circle">${typeof phaseIcon === "function" ? phaseIcon(p) : ""}</span>
      <span class="su-school-name">${PHASE_LABEL[p]}</span>
    </button>`;
  }).join("");

  return byPhase;
}

function selectPhase(phase){
  const hadFocus = $("su-phases").contains(document.activeElement); // re-render below would drop keyboard focus
  activePhase = phase; activeSchool = null; activeItem = null;
  renderPhases();
  if(hadFocus){ const on = document.querySelector("#su-phases .su-phase.on"); if(on) on.focus(); }
  renderTabs();
  $("su-schools-wrap").style.display = "block";
  $("su-preview").innerHTML = "";
  $("su-list").innerHTML = "";
  $("su-picker").style.display = "none";
}

/* ---------- screen 2: pick a school within that phase ---------- */
function renderTabs(){
  const inPhase = SCHOOLS.filter(s => classifyPhase(s) === activePhase);
  $("su-tabs").innerHTML = inPhase.map(s => `
    <button class="su-school${s === activeSchool ? " on" : ""}" data-school="${escHtml(s)}">
      ${schoolCircle(s)}
      <span class="su-school-name">${escHtml(s)}</span>
    </button>`).join("");
}

function selectSchool(school){
  activeSchool = school;
  activeItem = null;
  renderTabs();
  renderList();
  renderPreview();
  $("su-picker").style.display = "none";
}

function renderPreview(){
  const items = getSchoolItems(activeSchool);
  const shown = activeItem || items[0];
  $("su-preview").innerHTML = shown && shown.image_url
    ? `<img loading="lazy" src="${escHtml(shown.image_url)}" alt="${escHtml(shown.name)}">`
    : `<div class="su-preview-empty">${shown ? escHtml(shown.name) : "Pick an item to see it"}</div>`;
}

const EMPTY_SCHOOL_LINE = `<p class="body dim">No uniform listed for this school yet — give us a ring and we'll sort it.</p>`;

/* A school with none of its own items says so, then still lists the
   shared pieces (plain bottoms) underneath so they can be ordered. */
function renderList(){
  const items = getSchoolItems(activeSchool);
  const rows = items.map(p => `
    <div class="su-row${activeItem && activeItem.id === p.id ? " on" : ""}" data-item="${escHtml(p.id)}">
      <div>
        <div class="su-row-name">${escHtml(p.name)}</div>
        ${p.sizes ? `<div class="su-row-meta">Sizes: ${escHtml(p.sizes)}</div>` : ""}
        <div class="su-row-price">${money(p.price)}</div>
      </div>
    </div>`).join("");
  $("su-list").innerHTML = (hasOwnItems(activeSchool) ? "" : EMPTY_SCHOOL_LINE) + rows;
}

function selectItem(id){
  activeItem = getSchoolItems(activeSchool).find(p => p.id === id);
  renderList();
  renderPreview();
  renderPicker();
}

function renderPicker(){
  const p = activeItem;
  const box = $("su-picker");
  if(!p){ box.style.display = "none"; return; }
  const sizes = (p.sizes || "").split(",").map(s => s.trim()).filter(Boolean);
  const cols  = (p.colours || "").split(",").map(s => s.trim()).filter(Boolean);
  const crested = isCrestedItem(p);
  box.style.display = "block";
  box.innerHTML = `
    <h3 style="font-size:19px">${escHtml(p.name)}</h3>
    ${sizes.length ? `<div class="fld"><label for="su-size">Size</label>
      <select id="su-size">${sizes.map(s => `<option>${escHtml(s)}</option>`).join("")}</select></div>` : ""}
    ${cols.length ? `<div class="fld"><label for="su-colour">Colour</label>
      <select id="su-colour">${cols.map(c => `<option>${escHtml(c)}</option>`).join("")}</select></div>` : ""}
    <div class="fld"><label for="su-qty">Quantity</label>
      <input id="su-qty" type="number" min="1" value="1" inputmode="numeric"></div>
    ${crested ? `<div class="su-toggles">
      <label><span>Embroidered school logo</span><input type="checkbox" checked disabled></label>
      <label><span>Initials stitched on <span class="dim">+${money(INITIALS_PRICE)}</span></span>
        <input type="checkbox" id="su-initials"></label>
    </div>` : ""}
    <button class="btn-solid" style="width:100%;margin-top:20px" onclick="addToBasket()">Add to order</button>`;
}

/* Only the school-branded top half (sweatshirts/cardigans/polos/hoodies)
   carries the crest — plain bottoms in the shared "All Schools" category
   (trousers, pinafores, skirts, playsuits, skorts) are never embroidered,
   so they shouldn't offer or claim it. */
function isCrestedItem(p){
  if(typeof p.crest === "boolean") return p.crest;   // merged value from the pool + school override
  return p.category !== "All Schools" && p.category !== "Needs Sorting";
}

function addToBasket(){
  const p = activeItem;
  const qty = parseInt(($("su-qty") || {}).value) || 1;
  const size = $("su-size") ? $("su-size").value : null;
  const colour = $("su-colour") ? $("su-colour").value : null;
  const crested = isCrestedItem(p);
  const initials = crested && $("su-initials") && $("su-initials").checked;
  const bits = [];
  if(size) bits.push(size);
  if(colour) bits.push(colour);
  if(crested) bits.push("logo embroidered");
  if(initials) bits.push("initials +" + money(INITIALS_PRICE));

  basket.push({
    name: p.name, qty, unit: Number(p.price || 0) + (initials ? INITIALS_PRICE : 0), opts: bits
  });
  renderBasket();
  activeItem = null;
  renderList();
  renderPreview();
  $("su-picker").style.display = "none";
  toast(`${p.name} added to your order`);
}

function renderBasket(){
  const bar = $("su-sticky");
  if(!basket.length){ bar.style.display = "none"; return; }
  bar.style.display = "block";
  const items = basket.reduce((s, b) => s + b.qty, 0);
  const total = basket.reduce((s, b) => s + b.unit * b.qty, 0);
  $("su-sticky-count").textContent = items === 1 ? "1 item" : `${items} items`;
  $("su-sticky-total").textContent = money(total);
}

/* Hands the basket to the dedicated checkout page — sessionStorage rather
   than a URL param since a full uniform order can run to a dozen+ lines
   with sizes/colours/embroidery notes attached to each. */
function goToUniformCheckout(){
  sessionStorage.setItem("su_basket", JSON.stringify(basket));
  sessionStorage.setItem("su_school", activeSchool || "");
  location.href = "schools-checkout.html";
}

document.addEventListener("DOMContentLoaded", async () => {
  bindSchoolShopEvents();
  if(!(await healthCheck())) $("health").style.display = "block";
  // js/schools-items.js: pool + this school's overrides, already merged
  try{ ALL_PRODUCTS = await listSchoolItems(); }
  catch(e){ ALL_PRODUCTS = []; }
  await loadSchoolRegistry();
  SCHOOLS = buildSchoolList(Object.keys(groupBySchool(ALL_PRODUCTS)));
  if(SCHOOLS.length){
    renderPhases();
  }else{
    $("su-phases").innerHTML = "";
    $("su-list").innerHTML = `<p class="body dim">No schools set up yet — check back soon.</p>`;
  }
});
