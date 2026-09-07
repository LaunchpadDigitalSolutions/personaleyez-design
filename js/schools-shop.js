/* ============================================================
   schools-shop.js — school uniform ordering.
   Same ps_products table and /api/checkout as the main shop
   (js/shop.js) - schools are just grouped by their `category`
   value, so Jo manages them from the same admin Shop tab she
   already has, nothing new for her to learn.
   ============================================================ */

let ALL_PRODUCTS = [], SCHOOLS = [], activePhase = null, activeSchool = null, activeItem = null, basket = [];
const $ = id => document.getElementById(id);
const money = n => "£" + Number(n || 0).toFixed(2);

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

/* ------------------------------------------------------------
   Primary / Secondary phase lookup — sourced from Hartlepool
   Borough Council's own school directory (hartlepool.gov.uk),
   since most school names don't literally say "Primary" or
   "Secondary" (e.g. "High Tunstall College of Science"). Only
   the 5 secondaries need listing explicitly; anything with
   "Primary" in the name is primary; anything else unmatched
   falls into "Other" rather than being silently guessed at, so
   a typo or new school in Jo's Square categories is visible
   instead of hidden.
   ------------------------------------------------------------ */
const SECONDARY_SCHOOLS = [
  "dyke house sports and technology college", "dyke house academy", "dyke house",
  "english martyrs catholic school and sixth form college", "english martyrs school and sixth form college", "english martyrs",
  "high tunstall college of science", "high tunstall",
  "manor community academy", "manor college of technology", "manor",
  "st hild's church of england school", "st hilds church of england school", "st hild's", "st hilds"
];
const SPECIAL_SCHOOLS = [
  "catcote academy", "the horizon school", "horizon school", "springwell school"
];

function classifyPhase(name){
  const n = (name || "").toLowerCase().trim();
  if (SECONDARY_SCHOOLS.some(s => n.includes(s))) return "secondary";
  if (SPECIAL_SCHOOLS.some(s => n.includes(s))) return "special";
  if (n.includes("primary") || n.includes("academy")) return "primary"; // covers e.g. Eldon Grove/Eskdale/Rossmere Academy
  return "other";
}

const PHASE_LABEL = { primary:"Primary Schools", secondary:"Secondary Schools", special:"Special Schools", other:"Other" };
const PHASE_ORDER = ["primary","secondary","special","other"];

function schoolInitials(name){
  return name.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join("").toUpperCase();
}

/* ---------- screen 1: pick a phase ---------- */
function renderPhases(){
  const byPhase = {};
  SCHOOLS.forEach(s => { const p = classifyPhase(s); (byPhase[p] = byPhase[p] || []).push(s); });
  const phases = PHASE_ORDER.filter(p => byPhase[p] && byPhase[p].length);

  $("su-phases").innerHTML = phases.map(p => `
    <button class="su-school${p === activePhase ? " on" : ""}" onclick="selectPhase('${p}')">
      <span class="su-school-circle">${byPhase[p].length}</span>
      <span class="su-school-name">${PHASE_LABEL[p]}</span>
    </button>`).join("");

  return byPhase;
}

function selectPhase(phase){
  activePhase = phase; activeSchool = null; activeItem = null;
  renderPhases();
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
    <button class="su-school${s === activeSchool ? " on" : ""}" onclick="selectSchool('${s.replace(/'/g,"\\'")}')">
      <span class="su-school-circle">${schoolInitials(s)}</span>
      <span class="su-school-name">${s}</span>
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
  const items = groupBySchool(ALL_PRODUCTS)[activeSchool] || [];
  const shown = activeItem || items[0];
  $("su-preview").innerHTML = shown && shown.image_url
    ? `<img loading="lazy" src="${shown.image_url}" alt="${shown.name}">`
    : `<div class="su-preview-empty">${shown ? shown.name : "Pick an item to see it"}</div>`;
}

function renderList(){
  const grouped = groupBySchool(ALL_PRODUCTS);
  const shared = grouped["All Schools"] || [];
  const items = (grouped[activeSchool] || []).concat(shared);
  $("su-list").innerHTML = items.length ? items.map(p => `
    <div class="su-row${activeItem && activeItem.id === p.id ? " on" : ""}" onclick="selectItem('${p.id}')">
      <div>
        <div class="su-row-name">${p.name}</div>
        ${p.sizes ? `<div class="su-row-meta">Sizes: ${p.sizes}</div>` : ""}
        <div class="su-row-price">${money(p.price)}</div>
      </div>
    </div>`).join("")
    : `<p class="body dim">No uniform listed for this school yet — give us a ring and we'll sort it.</p>`;
}

function selectItem(id){
  const items = groupBySchool(ALL_PRODUCTS)[activeSchool] || [];
  activeItem = items.find(p => p.id === id);
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
  box.style.display = "block";
  box.innerHTML = `
    <h3 style="font-size:19px">${p.name}</h3>
    ${sizes.length ? `<div class="fld"><label for="su-size">Size</label>
      <select id="su-size">${sizes.map(s => `<option>${s}</option>`).join("")}</select></div>` : ""}
    ${cols.length ? `<div class="fld"><label for="su-colour">Colour</label>
      <select id="su-colour">${cols.map(c => `<option>${c}</option>`).join("")}</select></div>` : ""}
    <div class="fld"><label for="su-qty">Quantity</label>
      <input id="su-qty" type="number" min="1" value="1" inputmode="numeric"></div>
    <div class="su-toggles">
      <label><span>Embroidered school logo</span><input type="checkbox" checked disabled></label>
      <label><span>Initials stitched on <span class="dim">+£3.50</span></span>
        <input type="checkbox" id="su-initials"></label>
    </div>
    <button class="btn-solid" style="width:100%;margin-top:20px" onclick="addToBasket()">Add to order</button>`;
}

function addToBasket(){
  const p = activeItem;
  const qty = parseInt(($("su-qty") || {}).value) || 1;
  const size = $("su-size") ? $("su-size").value : null;
  const colour = $("su-colour") ? $("su-colour").value : null;
  const initials = $("su-initials") && $("su-initials").checked;
  const bits = [];
  if(size) bits.push(size);
  if(colour) bits.push(colour);
  bits.push("logo embroidered");
  if(initials) bits.push("initials +£3.50");

  basket.push({
    name: p.name, qty, unit: Number(p.price || 0) + (initials ? 3.50 : 0), opts: bits
  });
  renderBasket();
  activeItem = null;
  renderList();
  renderPreview();
  $("su-picker").style.display = "none";
}

function renderBasket(){
  const box = $("su-basketbox"), co = $("su-checkout");
  if(!basket.length){ box.style.display = "none"; co.style.display = "none"; return; }
  box.style.display = "block"; co.style.display = "block";
  $("su-basket").innerHTML = basket.map(b =>
    `<li><b>${b.qty} × ${b.name} · ${b.opts.join(" · ")}</b><span>${money(b.unit * b.qty)}</span></li>`).join("");
  const total = basket.reduce((s, b) => s + b.unit * b.qty, 0);
  $("su-total").textContent = money(total);
}

async function startUniformCheckout(){
  const name  = $("su-cname").value.trim();
  const phone = $("su-cphone").value.trim();
  const email = $("su-cemail").value.trim();
  const btn   = $("su-pay");

  if(!basket.length){ note("su-notice", "err", "Add at least one item first."); return; }
  if(!name){ note("su-notice", "err", "We need your name."); return; }
  if(phone.length < 9){ note("su-notice", "err", "We need a phone number."); return; }

  btn.disabled = true; note("su-notice", "busy", "Setting up your payment…");
  try{
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: basket.map(b => ({ name: `${b.name} (${b.opts.join(", ")})`, price: b.unit, qty: b.qty })),
        customer: { name, phone, email: email || undefined },
        note: activeSchool || undefined
      })
    });
    const data = await res.json();
    if(!res.ok || !data.checkout_url){
      note("su-notice", "err", "That didn't go through. Please ring us on " + BRAND.phone + ".");
      btn.disabled = false; return;
    }
    location.href = data.checkout_url;
  }catch(e){
    note("su-notice", "err", "That didn't go through. Please ring us on " + BRAND.phone + ".");
    btn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  if(!(await healthCheck())) $("health").style.display = "block";
  try{ ALL_PRODUCTS = (await listShopProducts()).filter(p => p.category); }
  catch(e){ ALL_PRODUCTS = []; }
  SCHOOLS = Object.keys(groupBySchool(ALL_PRODUCTS)).filter(s => s !== "All Schools");
  if(SCHOOLS.length){
    renderPhases();
  }else{
    $("su-phases").innerHTML = "";
    $("su-list").innerHTML = `<p class="body dim">No schools set up yet — check back soon.</p>`;
  }
});
