/* ============================================================
   schools-shop.js — school uniform ordering.
   Same ps_products table and /api/checkout as the main shop
   (js/shop.js) - schools are just grouped by their `category`
   value, so Jo manages them from the same admin Shop tab she
   already has, nothing new for her to learn.
   ============================================================ */

let ALL_PRODUCTS = [], SCHOOLS = [], activeSchool = null, activeItem = null, basket = [];
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

function renderTabs(){
  $("su-tabs").innerHTML = SCHOOLS.map(s =>
    `<button class="su-tab${s === activeSchool ? " on" : ""}" onclick="selectSchool('${s.replace(/'/g,"\\'")}')">${s}</button>`
  ).join("");
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
  const items = groupBySchool(ALL_PRODUCTS)[activeSchool] || [];
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
  SCHOOLS = Object.keys(groupBySchool(ALL_PRODUCTS));
  if(SCHOOLS.length){
    activeSchool = SCHOOLS[0];
    renderTabs();
    renderList();
    renderPreview();
  }else{
    $("su-tabs").innerHTML = "";
    $("su-list").innerHTML = `<p class="body dim">No schools set up yet — check back soon.</p>`;
  }
});
